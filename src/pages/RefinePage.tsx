import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { request, requestRaw, sleep } from '../api/client'
import { ApiError, errorMessage } from '../api/errors'
import { useCan } from '../auth/authContext'
import { BinsPanel } from '../files/BinsPanel'
import { Grid } from '../files/Grid'
import { findGroup, type Group } from '../files/groups'
import { TileStore, tileKey } from '../files/tileStore'
import { BINS, CHAR_BY_BIN, type BinCode, type Cell, type DataFile, type RefineResult, type Rules } from '../files/types'

type Load = { kind: 'loading' } | { kind: 'error'; message: string; notFound: boolean } | { kind: 'ok'; file: DataFile; rules: Rules }

function clampInt(raw: string | null, max: number): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? Math.min(n, Math.max(0, max - 1)) : 0
}

const MAX_TRANSIENT_RETRIES = 6

export default function RefinePage() {
  const { id } = useParams()
  const fileId = Number(id)
  const validId = Number.isInteger(fileId) && fileId > 0
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    if (!validId) {
      setLoad({ kind: 'error', message: 'El id del archivo no es válido.', notFound: true })
      return
    }
    const controller = new AbortController()
    setLoad({ kind: 'loading' })
    Promise.all([
      request<DataFile>(`/files/${fileId}`, { signal: controller.signal }),
      request<Rules>(`/files/${fileId}/rules`, { signal: controller.signal }),
    ])
      .then(([file, rules]) => {
        if (!controller.signal.aborted) setLoad({ kind: 'ok', file, rules })
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return
        const notFound = e instanceof ApiError && e.status === 404
        setLoad({ kind: 'error', message: notFound ? 'Ese archivo no existe.' : errorMessage(e), notFound })
      })
    return () => controller.abort()
  }, [fileId, validId, reloadTick])

  if (load.kind === 'loading')
    return (
      <main className="p-6" aria-busy="true">
        <p role="status">Abriendo el archivo…</p>
      </main>
    )
  if (load.kind === 'error')
    return (
      <main className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-semibold">No se pudo abrir el archivo</h1>
        <p role="alert" className="mt-2 text-rose-300">
          {load.message}
        </p>
        <div className="mt-4 flex gap-4">
          {!load.notFound && (
            <button type="button" className="underline" onClick={() => setReloadTick((t) => t + 1)}>
              Reintentar
            </button>
          )}
          <Link to="/files" className="text-sky-300 underline">
            Volver a los archivos
          </Link>
        </div>
      </main>
    )
  return <Refinery key={load.file.id} file={load.file} rules={load.rules} />
}

interface DragState {
  startX: number
  startY: number
  active: boolean
}

function Refinery({ file: initialFile, rules }: { file: DataFile; rules: Rules }) {
  const canRefine = useCan('files:refine')
  const [params, setParams] = useSearchParams()
  const [initial] = useState<Cell>(() => ({
    r: clampInt(params.get('r'), initialFile.rows),
    c: clampInt(params.get('c'), initialFile.cols),
  }))
  const store = useMemo(
    () => new TileStore(initialFile.id, initialFile.rows, initialFile.cols, initialFile.tileSize),
    [initialFile],
  )
  useEffect(() => () => store.dispose(), [store])

  const [fileState, setFileState] = useState(initialFile)
  const [group, setGroup] = useState<Group | null>(null)
  const [finding, setFinding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'info' | 'error' | 'ok'; text: string } | null>(null)
  const [hoverBin, setHoverBin] = useState<BinCode | null>(null)
  const findToken = useRef(0)
  const intentKeys = useRef(new Map<string, string>())
  const inflightGroups = useRef(new Set<string>())
  const ghostRef = useRef<HTMLDivElement>(null)
  const drag = useRef<DragState | null>(null)

  const selection = useMemo(() => new Set(group?.cells.map((x) => `${x.r},${x.c}`) ?? []), [group])
  const claims = useMemo(() => new Map<string, string>(), [])

  // ?r=&c= sin llenar el historial.
  const urlTimer = useRef<number | null>(null)
  const onViewportChange = useCallback(
    (tl: Cell) => {
      if (urlTimer.current !== null) window.clearTimeout(urlTimer.current)
      urlTimer.current = window.setTimeout(() => {
        setParams(
          (prev) => {
            const next = new URLSearchParams(prev)
            next.set('r', String(tl.r))
            next.set('c', String(tl.c))
            return next
          },
          { replace: true, preventScrollReset: true },
        )
      }, 300)
    },
    [setParams],
  )

  const onActivate = useCallback(
    async (cell: Cell) => {
      const data = store.cell(cell.r, cell.c)
      if (data && data.tremor < rules.tremorThreshold) {
        setGroup(null)
        setMessage({ tone: 'info', text: 'Esa celda no da miedo.' })
        return
      }
      const token = ++findToken.current
      setFinding(true)
      setMessage(null)
      try {
        const g = await findGroup(store, rules, cell.r, cell.c)
        if (token !== findToken.current) return
        if (!g) {
          setGroup(null)
          setMessage({ tone: 'info', text: 'Esa celda no da miedo.' })
        } else if (g.refinedAs) {
          setGroup(null)
          setMessage({ tone: 'info', text: 'Ese grupo ya está refinado.' })
        } else {
          setGroup(g)
          setMessage({
            tone: 'info',
            text: g.noise
              ? `Grupo de ${g.size > rules.maxGroupSize ? `más de ${rules.maxGroupSize}` : g.size} celdas: es ruido, no se puede refinar.`
              : `Grupo de ${g.size} celdas. Según las reglas va en ${g.bin}. Arrástralo a una caja o usa las teclas 1 a 4.`,
          })
        }
      } catch (e) {
        if (token === findToken.current) setMessage({ tone: 'error', text: `No se pudo cargar el grupo: ${errorMessage(e)}` })
      } finally {
        if (token === findToken.current) setFinding(false)
      }
    },
    [store, rules],
  )

  /**
   * Regla de Kier: una key por intención (grupo + caja). Doble clic, doble Enter o reintentos por red reusan la
   * misma key, así que el servidor nunca refina dos veces ni cuenta dos errores.
   */
  const refine = useCallback(
    async (bin: BinCode) => {
      const g = group
      if (!g || g.noise || !canRefine) return
      if (inflightGroups.current.has(g.key)) return
      inflightGroups.current.add(g.key)
      setBusy(true)
      setMessage({ tone: 'info', text: `Llevando el grupo a ${bin}…` })
      const intent = `${g.key}|${bin}`
      let key = intentKeys.current.get(intent)
      if (!key) {
        key = crypto.randomUUID()
        intentKeys.current.set(intent, key)
      }
      const send = async (): Promise<RefineResult> => {
        for (let attempt = 0; ; attempt++) {
          try {
            const raw = await requestRaw<RefineResult>(`/files/${fileState.id}/refinements`, {
              method: 'POST',
              body: { bin, cells: g.cells },
              headers: { 'Idempotency-Key': key },
              retries503: 0,
            })
            return raw.data
          } catch (e) {
            // 503 tras guardar (caos) o corte de red: misma key, el servidor responde la repetición guardada.
            const transient = (e instanceof ApiError && e.status === 503) || e instanceof TypeError
            if (!transient || attempt >= MAX_TRANSIENT_RETRIES) throw e
            const retryAfter = e instanceof ApiError ? (e.retryAfter ?? 0) : 0
            await sleep(Math.max(retryAfter * 1000, 400 * 2 ** attempt))
          }
        }
      }
      try {
        const res = await send()
        store.applyBins(g.cells, CHAR_BY_BIN[bin])
        setFileState((f) => ({ ...f, ...res.file }))
        setGroup(null)
        setMessage({ tone: 'ok', text: `Grupo de ${res.size} celdas refinado en ${res.bin}.` })
      } catch (e) {
        handleRefineError(e, g)
      } finally {
        inflightGroups.current.delete(g.key)
        setBusy(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [group, canRefine, fileState.id, store],
  )

  function handleRefineError(e: unknown, g: Group) {
    if (!(e instanceof ApiError)) {
      setMessage({ tone: 'error', text: `Sin conexión. Reintenta: el grupo nunca se refina dos veces. (${errorMessage(e)})` })
      return
    }
    const d = (e.details ?? {}) as Record<string, unknown>
    const groupTiles = [
      ...new Set(g.cells.map((x) => tileKey(Math.floor(x.r / store.tileSize), Math.floor(x.c / store.tileSize)))),
    ]
    switch (e.code) {
      case 'WRONG_BIN': {
        const mistakes = typeof d.mistakes === 'number' ? d.mistakes : fileState.mistakes + 1
        setFileState((f) => ({ ...f, mistakes }))
        setMessage({ tone: 'error', text: `Caja equivocada: ese grupo no va ahí. Errores del archivo: ${mistakes}. Prueba otra caja.` })
        return
      }
      case 'ALREADY_REFINED': {
        const tiles = Array.isArray(d.tiles)
          ? d.tiles.filter((t): t is [number, number] => Array.isArray(t) && t.length === 2).map(([tr, tc]) => tileKey(tr, tc))
          : groupTiles
        store.invalidate(tiles)
        setGroup(null)
        setMessage({ tone: 'error', text: 'Alguien ya refinó parte de ese grupo. Actualicé los bloques afectados.' })
        return
      }
      case 'GROUP_CLAIMED': {
        const holder = d.holder as { displayName?: string } | undefined
        setMessage({
          tone: 'error',
          text: `${holder?.displayName ?? 'Otro refinador'} tiene reservado ese grupo. Espera a que lo libere o elige otro.`,
        })
        return
      }
      case 'GROUP_INVALID': {
        const reason = d.reason
        store.invalidate(groupTiles)
        setGroup(null)
        const text =
          reason === 'INCOMPLETE'
            ? `Al grupo le faltan ${typeof d.missing === 'number' ? d.missing : 'algunas'} celdas. Recargué sus bloques: vuelve a seleccionarlo.`
            : reason === 'SIZE_OUT_OF_RANGE'
              ? 'Ese grupo es ruido: no se puede refinar.'
              : reason === 'BELOW_THRESHOLD'
                ? 'Alguna celda ya no da miedo. Recargué los bloques: vuelve a seleccionar el grupo.'
                : 'Las celdas no forman un solo grupo. Recargué los bloques: vuelve a seleccionarlo.'
        setMessage({ tone: 'error', text })
        return
      }
      case 'FORBIDDEN':
        setMessage({ tone: 'error', text: 'Tu rol no tiene permiso para refinar.' })
        return
      default:
        setMessage({ tone: 'error', text: `No se pudo refinar: ${e.message}. Puedes reintentar sin riesgo.` })
    }
  }

  // Teclado: 1–4 llevan el grupo a una caja, Escape lo suelta.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return
      if (e.key === 'Escape') {
        setGroup(null)
        return
      }
      const idx = ['1', '2', '3', '4'].indexOf(e.key)
      const bin = BINS[idx]
      if (bin && group && !group.noise) {
        e.preventDefault()
        void refine(bin)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [group, refine])

  // Arrastre con Pointer Events (sin librería).
  const onDragStart = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>, _cell: Cell) => {
      if (!group || group.noise || !canRefine || e.button !== 0) return
      drag.current = { startX: e.clientX, startY: e.clientY, active: false }
      const binAt = (x: number, y: number): BinCode | null => {
        const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-bin]')
        const b = el?.dataset.bin
        return b === 'WO' || b === 'FC' || b === 'DR' || b === 'MA' ? b : null
      }
      const move = (ev: PointerEvent) => {
        const d = drag.current
        if (!d) return
        if (!d.active && Math.hypot(ev.clientX - d.startX, ev.clientY - d.startY) > 5) d.active = true
        if (!d.active) return
        ev.preventDefault()
        const ghost = ghostRef.current
        if (ghost) {
          ghost.hidden = false
          ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`
        }
        setHoverBin(binAt(ev.clientX, ev.clientY))
      }
      const up = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        const d = drag.current
        drag.current = null
        if (ghostRef.current) ghostRef.current.hidden = true
        setHoverBin(null)
        if (d?.active && ev.type === 'pointerup') {
          const bin = binAt(ev.clientX, ev.clientY)
          if (bin) void refine(bin)
        }
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    },
    [group, canRefine, refine],
  )

  if (fileState.status === 'COMPLETE' || fileState.progress.overall >= 1) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-4 p-6 text-center">
        <h1 className="text-3xl font-semibold">Archivo completado</h1>
        <p className="text-slate-300">
          {fileState.name}: {fileState.refinedGroups} de {fileState.totalGroups} grupos refinados, {fileState.mistakes}{' '}
          errores.
        </p>
        <p className="text-slate-300">Que cada número encuentre su caja.</p>
        <Link to="/files" className="text-sky-300 underline">
          Volver a los archivos
        </Link>
      </main>
    )
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold">{fileState.name}</h1>
        <p className="text-sm text-slate-300">
          {fileState.rows} × {fileState.cols} · {fileState.refinedGroups}/{fileState.totalGroups} grupos ·{' '}
          {fileState.mistakes} errores · umbral {rules.tremorThreshold}, conectividad {rules.connectivity}
        </p>
      </div>

      <div role="status" aria-live="polite" className="min-h-6 text-sm">
        {finding && <span className="text-slate-300">Buscando el grupo completo…</span>}
        {!finding && message && (
          <span
            className={
              message.tone === 'error' ? 'text-rose-300' : message.tone === 'ok' ? 'text-emerald-300' : 'text-slate-200'
            }
          >
            {message.text}
          </span>
        )}
      </div>

      <Grid
        store={store}
        rules={rules}
        label={`Grilla de ${fileState.name}. Flechas para moverse, Enter para elegir un grupo.`}
        initial={initial}
        selection={selection}
        claims={claims}
        onActivate={(cell) => void onActivate(cell)}
        onDragStart={onDragStart}
        onViewportChange={onViewportChange}
      />

      {canRefine ? (
        <BinsPanel
          progress={fileState.progress}
          canDrop={!!group && !group.noise}
          suggested={group?.bin ?? null}
          hover={hoverBin}
          busy={busy}
          onDrop={(bin) => void refine(bin)}
        />
      ) : (
        <p className="text-sm text-slate-300">Tu rol puede ver la grilla, pero no refinar.</p>
      )}

      <div
        ref={ghostRef}
        hidden
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-0 z-50 rounded bg-sky-300 px-2 py-1 text-sm font-semibold text-slate-950 shadow-lg"
      >
        Grupo de {group?.size ?? 0} celdas
      </div>
    </main>
  )
}
