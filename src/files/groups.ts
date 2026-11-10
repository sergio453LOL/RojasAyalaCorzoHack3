import type { TileStore } from './tileStore'
import type { BinCode, Cell, Rules } from './types'

export interface Group {
  cells: Cell[]
  /** Clave estable del grupo (celdas ordenadas). */
  key: string
  /** Tamaño real, o `maxGroupSize + 1` si se cortó la búsqueda porque ya es ruido. */
  size: number
  noise: boolean
  /** Caja según las reglas, o null si es ruido. */
  bin: BinCode | null
  /** Ya está refinado (todas sus celdas tienen caja). */
  refinedAs: string | null
}

const N4 = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const
const N8 = [...N4, [-1, -1], [-1, 1], [1, -1], [1, 1]] as const

export function binFor(rules: Rules, digits: number[]): BinCode {
  const index =
    rules.binning.strategy === 'DIGIT_SUM_MOD'
      ? digits.reduce((a, d) => a + d, 0) % 4
      : Math.max(...digits) % 4
  return rules.binning.order[index] ?? rules.binning.order[0] ?? 'WO'
}

export function isScary(rules: Rules, tremor: number) {
  return tremor >= rules.tremorThreshold
}

/**
 * Grupo máximo de celdas conectadas que dan miedo a partir de (r, c).
 * Si el grupo cruza bloques sin cargar, los pide (aunque no estén visibles) y sigue.
 */
export async function findGroup(store: TileStore, rules: Rules, r: number, c: number): Promise<Group | null> {
  const start = store.cell(r, c) ?? (await ensureCell(store, r, c))
  if (!start || !isScary(rules, start.tremor)) return null

  const neighbors = rules.connectivity === 8 ? N8 : N4
  const limit = rules.maxGroupSize + 1
  const seen = new Set<string>([`${r},${c}`])
  const queue: Cell[] = [{ r, c }]
  const cells: Cell[] = []
  const digits: number[] = []
  const binChars = new Set<string>()

  while (queue.length > 0 && cells.length < limit) {
    const cur = queue.shift() as Cell
    const data = store.cell(cur.r, cur.c) ?? (await ensureCell(store, cur.r, cur.c))
    if (!data) continue
    cells.push(cur)
    digits.push(data.digit)
    binChars.add(data.bin)
    for (const [dr, dc] of neighbors) {
      const nr = cur.r + dr
      const nc = cur.c + dc
      if (nr < 0 || nc < 0 || nr >= store.rows || nc >= store.cols) continue
      const k = `${nr},${nc}`
      if (seen.has(k)) continue
      seen.add(k)
      const nd = store.cell(nr, nc) ?? (await ensureCell(store, nr, nc))
      if (nd && isScary(rules, nd.tremor)) queue.push({ r: nr, c: nc })
    }
  }

  const size = cells.length
  const noise = size < rules.minGroupSize || size > rules.maxGroupSize
  const sorted = [...cells].sort((a, b) => a.r - b.r || a.c - b.c)
  const refinedAs = binChars.size === 1 && !binChars.has('.') ? ([...binChars][0] ?? null) : null
  return {
    cells: sorted,
    key: sorted.map((x) => `${x.r}:${x.c}`).join('|'),
    size,
    noise,
    bin: noise ? null : binFor(rules, digits),
    refinedAs,
  }
}

async function ensureCell(store: TileStore, r: number, c: number) {
  await store.ensure(Math.floor(r / store.tileSize), Math.floor(c / store.tileSize))
  return store.cell(r, c)
}
