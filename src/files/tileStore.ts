/**
 * Caché y cola de bloques de la grilla.
 *
 * - Un bloque se pide solo cuando hace falta (visible o necesario para completar un grupo).
 * - Nunca hay dos requests en vuelo para el mismo bloque.
 * - Los bloques que salen de la vista antes de responder se cancelan (AbortController).
 * - 429: no se pide NINGÚN bloque hasta que pase Retry-After. Además se limita el ritmo (≤ 36 cada 10 s) para no llegar a 429.
 * - 503: reintento con Retry-After y espera creciente.
 */
import { requestRaw } from '../api/client'
import { ApiError } from '../api/errors'
import type { TileDto } from './types'

export interface Tile {
  tileRow: number
  tileCol: number
  originRow: number
  originCol: number
  rows: number
  cols: number
  /** Dígito por celda (0..9). */
  values: Uint8Array
  /** Temblor por celda (0..100). */
  tremor: Uint8Array
  /** Carácter de caja por celda: '.', 'W', 'F', 'D', 'M'. */
  bins: string[]
  version: number
}

const MAX_CONCURRENT = 4
const WINDOW_MS = 10_000
const MAX_PER_WINDOW = 36
const ABORT_COOLDOWN_MS = 1500
const ERROR_RETRY_MS = 5000

/** Límite de ritmo compartido por toda la pestaña (el límite del servidor es por sesión). */
const limiter = {
  blockedUntil: 0,
  sent: [] as number[],
  /** Milisegundos a esperar antes de poder pedir otro bloque (0 = ya). */
  wait(now: number): number {
    this.sent = this.sent.filter((t) => now - t < WINDOW_MS)
    const byBlock = Math.max(0, this.blockedUntil - now)
    const byWindow = this.sent.length >= MAX_PER_WINDOW ? (this.sent[0] ?? now) + WINDOW_MS - now : 0
    return Math.max(byBlock, byWindow)
  },
  record(now: number) {
    this.sent.push(now)
  },
  block(seconds: number) {
    this.blockedUntil = Math.max(this.blockedUntil, Date.now() + seconds * 1000)
  },
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function parseTile(dto: TileDto): Tile {
  const values = new Uint8Array(dto.values.length)
  for (let i = 0; i < dto.values.length; i++) values[i] = dto.values.charCodeAt(i) - 48
  return {
    tileRow: dto.tileRow,
    tileCol: dto.tileCol,
    originRow: dto.originRow,
    originCol: dto.originCol,
    rows: dto.rows,
    cols: dto.cols,
    values,
    tremor: decodeBase64(dto.tremor),
    bins: dto.bins.split(''),
    version: dto.version,
  }
}

export const tileKey = (tr: number, tc: number) => `${tr},${tc}`

interface Waiter {
  resolve: (t: Tile) => void
  reject: (e: unknown) => void
}

export type TileState = 'idle' | 'loading' | 'ready' | 'error'

export class TileStore {
  readonly tileRows: number
  readonly tileCols: number
  private tiles = new Map<string, Tile>()
  private inflight = new Map<string, AbortController>()
  private wanted = new Set<string>()
  private waiters = new Map<string, Waiter[]>()
  private retryAt = new Map<string, number>()
  private attempts = new Map<string, number>()
  private errors = new Set<string>()
  private listeners = new Set<() => void>()
  private version = 0
  private pumpTimer: number | null = null
  private disposed = false
  readonly fileId: number
  readonly rows: number
  readonly cols: number
  readonly tileSize: number

  constructor(fileId: number, rows: number, cols: number, tileSize: number) {
    this.fileId = fileId
    this.rows = rows
    this.cols = cols
    this.tileSize = tileSize
    this.tileRows = Math.ceil(rows / tileSize)
    this.tileCols = Math.ceil(cols / tileSize)
  }

  // ---- suscripción (useSyncExternalStore) ----
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getVersion = () => this.version
  private notify() {
    this.version++
    for (const l of this.listeners) l()
  }

  // ---- lectura ----
  getTile(tr: number, tc: number): Tile | undefined {
    return this.tiles.get(tileKey(tr, tc))
  }

  state(tr: number, tc: number): TileState {
    const k = tileKey(tr, tc)
    if (this.tiles.has(k)) return 'ready'
    if (this.inflight.has(k)) return 'loading'
    if (this.errors.has(k)) return 'error'
    return 'idle'
  }

  /** Datos de una celda global, o undefined si su bloque no está cargado. */
  cell(r: number, c: number): { digit: number; tremor: number; bin: string } | undefined {
    const t = this.tiles.get(tileKey(Math.floor(r / this.tileSize), Math.floor(c / this.tileSize)))
    if (!t) return undefined
    const i = (r - t.originRow) * t.cols + (c - t.originCol)
    return { digit: t.values[i] ?? 0, tremor: t.tremor[i] ?? 0, bin: t.bins[i] ?? '.' }
  }

  // ---- demanda ----
  /** Bloques visibles ahora. Los que estaban en vuelo y ya no se ven (y nadie más espera) se cancelan. */
  setWanted(keys: Iterable<string>) {
    this.wanted = new Set(keys)
    for (const [k, ctrl] of this.inflight) {
      if (!this.wanted.has(k) && !this.waiters.has(k)) {
        ctrl.abort()
        this.inflight.delete(k)
        this.retryAt.set(k, Date.now() + ABORT_COOLDOWN_MS)
      }
    }
    this.schedule(0)
  }

  /** Pide un bloque aunque no esté visible (para completar un grupo). */
  ensure(tr: number, tc: number): Promise<Tile> {
    const k = tileKey(tr, tc)
    const t = this.tiles.get(k)
    if (t) return Promise.resolve(t)
    return new Promise<Tile>((resolve, reject) => {
      const list = this.waiters.get(k) ?? []
      list.push({ resolve, reject })
      this.waiters.set(k, list)
      this.errors.delete(k)
      this.retryAt.delete(k)
      this.schedule(0)
    })
  }

  /** Vuelve a pedir bloques (p. ej. tras 409 ALREADY_REFINED). */
  invalidate(keys: string[]) {
    for (const k of keys) {
      this.tiles.delete(k)
      this.errors.delete(k)
      this.retryAt.delete(k)
      this.attempts.delete(k)
    }
    this.notify()
    this.schedule(0)
  }

  /** Marca celdas como refinadas sin volver a pedir la grilla. */
  applyBins(cells: { r: number; c: number }[], binChar: string) {
    for (const { r, c } of cells) {
      const t = this.tiles.get(tileKey(Math.floor(r / this.tileSize), Math.floor(c / this.tileSize)))
      if (!t) continue
      t.bins[(r - t.originRow) * t.cols + (c - t.originCol)] = binChar
    }
    this.notify()
  }

  dispose() {
    this.disposed = true
    for (const ctrl of this.inflight.values()) ctrl.abort()
    this.inflight.clear()
    if (this.pumpTimer !== null) window.clearTimeout(this.pumpTimer)
    for (const list of this.waiters.values()) for (const w of list) w.reject(new DOMException('cerrado', 'AbortError'))
    this.waiters.clear()
  }

  // ---- cola ----
  private schedule(ms: number) {
    if (this.disposed) return
    if (this.pumpTimer !== null) window.clearTimeout(this.pumpTimer)
    this.pumpTimer = window.setTimeout(() => {
      this.pumpTimer = null
      this.pump()
    }, ms)
  }

  private nextCandidate(now: number): { key: string | null; waitMs: number } {
    let soonest = Infinity
    // Primero lo que alguien espera (grupo), después lo visible.
    for (const k of [...this.waiters.keys(), ...this.wanted]) {
      if (this.tiles.has(k) || this.inflight.has(k)) continue
      const at = this.retryAt.get(k) ?? 0
      if (at > now) {
        soonest = Math.min(soonest, at - now)
        continue
      }
      return { key: k, waitMs: 0 }
    }
    return { key: null, waitMs: soonest }
  }

  private pump() {
    if (this.disposed) return
    for (;;) {
      if (this.inflight.size >= MAX_CONCURRENT) return
      const now = Date.now()
      const { key, waitMs } = this.nextCandidate(now)
      if (!key) {
        if (Number.isFinite(waitMs)) this.schedule(waitMs + 10)
        return
      }
      const limitWait = limiter.wait(now)
      if (limitWait > 0) {
        this.schedule(limitWait + 10)
        return
      }
      limiter.record(now)
      void this.fetchTile(key)
    }
  }

  private async fetchTile(key: string) {
    const [tr, tc] = key.split(',').map(Number) as [number, number]
    const ctrl = new AbortController()
    this.inflight.set(key, ctrl)
    try {
      const { data } = await requestRaw<TileDto>(`/files/${this.fileId}/tiles/${tr}/${tc}`, {
        signal: ctrl.signal,
        retries503: 0,
      })
      if (this.inflight.get(key) !== ctrl) return
      this.inflight.delete(key)
      const tile = parseTile(data)
      this.tiles.set(key, tile)
      this.errors.delete(key)
      this.attempts.delete(key)
      for (const w of this.waiters.get(key) ?? []) w.resolve(tile)
      this.waiters.delete(key)
      this.notify()
    } catch (e) {
      if (this.inflight.get(key) !== ctrl) return // cancelado por salir de la vista
      this.inflight.delete(key)
      if (ctrl.signal.aborted) return
      if (e instanceof ApiError && e.status === 429) {
        limiter.block(e.retryAfter ?? 2)
      } else if (e instanceof ApiError && e.status === 503) {
        const n = (this.attempts.get(key) ?? 0) + 1
        this.attempts.set(key, n)
        const backoff = Math.min(15_000, 500 * 2 ** n) + Math.random() * 300
        this.retryAt.set(key, Date.now() + Math.max((e.retryAfter ?? 0) * 1000, backoff))
      } else if (e instanceof TypeError) {
        // Corte de red: reintento con espera creciente.
        const n = (this.attempts.get(key) ?? 0) + 1
        this.attempts.set(key, n)
        this.retryAt.set(key, Date.now() + Math.min(15_000, 1000 * 2 ** n))
      } else {
        this.errors.add(key)
        this.retryAt.set(key, Date.now() + ERROR_RETRY_MS)
        for (const w of this.waiters.get(key) ?? []) w.reject(e)
        this.waiters.delete(key)
      }
      this.notify()
    } finally {
      this.schedule(0)
    }
  }
}

