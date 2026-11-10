import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { isScary } from './groups'
import { tileKey, type TileStore } from './tileStore'
import { BIN_BY_CHAR, type Cell, type Rules } from './types'

export const CELL = 28
/** Filas/columnas extra renderizadas fuera de la vista. */
const OVERSCAN = 1
/** Tope de celdas en el DOM (requisito: nunca más de 2 500). */
const MAX_DOM_CELLS = 2400

const BIN_CLASS: Record<string, string> = {
  W: 'bg-sky-500/25 text-sky-100',
  F: 'bg-emerald-500/25 text-emerald-100',
  D: 'bg-amber-500/25 text-amber-100',
  M: 'bg-rose-500/25 text-rose-100',
}

interface CellProps {
  r: number
  c: number
  /** -1 si el bloque aún no llegó. */
  digit: number
  scary: boolean
  level: number
  bin: string
  selected: boolean
  focused: boolean
  claimedBy: string | null
}

const GridCell = memo(function GridCell({ r, c, digit, scary, level, bin, selected, focused, claimedBy }: CellProps) {
  const loaded = digit >= 0
  const refined = bin !== '.'
  let label: string
  if (!loaded) label = `Fila ${r + 1}, columna ${c + 1}: cargando`
  else {
    label = `Fila ${r + 1}, columna ${c + 1}: ${digit}`
    if (refined) label += `, refinado en ${BIN_BY_CHAR[bin] ?? bin}`
    else if (scary) label += ', da miedo'
    if (claimedBy) label += `, reservado por ${claimedBy}`
  }
  const tone = !loaded
    ? 'bg-slate-800/50'
    : selected
      ? 'bg-sky-300 text-slate-950 font-bold'
      : refined
        ? (BIN_CLASS[bin] ?? '')
        : claimedBy
          ? 'bg-fuchsia-500/30 text-fuchsia-100 font-bold'
          : scary
            ? 'text-white font-bold scary-mark'
            : 'text-slate-400'
  return (
    <div
      role="gridcell"
      aria-colindex={c + 1}
      aria-selected={selected}
      aria-label={label}
      tabIndex={focused ? 0 : -1}
      data-r={r}
      data-c={c}
      className={`absolute top-0 grid size-7 place-items-center font-mono text-sm outline-none select-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-sky-200 ${tone}`}
      style={{ left: c * CELL }}
    >
      {loaded && <span className={scary && !refined && !selected ? `tremble tremble-${level}` : undefined}>{digit}</span>}
    </div>
  )
})

export interface GridProps {
  store: TileStore
  rules: Rules
  label: string
  initial: Cell
  selection: ReadonlySet<string>
  claims: ReadonlyMap<string, string>
  onActivate: (cell: Cell) => void
  onDragStart: (e: PointerEvent<HTMLDivElement>, cell: Cell) => void
  onViewportChange: (topLeft: Cell) => void
  onFocusChange?: (cell: Cell) => void
  /** Capa extra (cursores de otros refinadores) que se dibuja encima sin re-renderizar la grilla. */
  overlay?: ReactNode
}

interface View {
  r0: number
  c0: number
  vr: number
  vc: number
}

export function Grid({
  store,
  rules,
  label,
  initial,
  selection,
  claims,
  onActivate,
  onDragStart,
  onViewportChange,
  onFocusChange,
  overlay,
}: GridProps) {
  useSyncExternalStore(store.subscribe, store.getVersion)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>({ r0: initial.r, c0: initial.c, vr: 30, vc: 40 })
  const [focus, setFocus] = useState<Cell>(initial)
  const keyboardMove = useRef(false)
  const rafId = useRef<number | null>(null)

  const measure = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const next: View = {
      r0: Math.floor(el.scrollTop / CELL),
      c0: Math.floor(el.scrollLeft / CELL),
      vr: Math.ceil(el.clientHeight / CELL) + 1,
      vc: Math.ceil(el.clientWidth / CELL) + 1,
    }
    setView((v) => (v.r0 === next.r0 && v.c0 === next.c0 && v.vr === next.vr && v.vc === next.vc ? v : next))
  }, [])

  // Posición inicial (de ?r=&c=) y mediciones.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = initial.r * CELL
    el.scrollLeft = initial.c * CELL
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
    // Solo al montar: la URL inicial manda una vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onScroll = useCallback(() => {
    if (rafId.current !== null) return
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null
      measure()
    })
  }, [measure])

  // Bloques visibles → se piden; los que salen de la vista se cancelan.
  useEffect(() => {
    const ts = store.tileSize
    const keys: string[] = []
    const rEnd = Math.min(store.rows - 1, view.r0 + view.vr)
    const cEnd = Math.min(store.cols - 1, view.c0 + view.vc)
    for (let tr = Math.floor(view.r0 / ts); tr <= Math.floor(rEnd / ts); tr++)
      for (let tc = Math.floor(view.c0 / ts); tc <= Math.floor(cEnd / ts); tc++) keys.push(tileKey(tr, tc))
    store.setWanted(keys)
  }, [store, view])

  useEffect(() => () => store.setWanted([]), [store])

  useEffect(() => {
    onViewportChange({ r: view.r0, c: view.c0 })
  }, [view.r0, view.c0, onViewportChange])

  useEffect(() => {
    onFocusChange?.(focus)
  }, [focus, onFocusChange])

  // El foco del teclado sigue a la celda (que siempre está en el DOM).
  useLayoutEffect(() => {
    if (!keyboardMove.current) return
    keyboardMove.current = false
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-r="${focus.r}"][data-c="${focus.c}"]`)
    el?.focus({ preventScroll: true })
  }, [focus])

  function scrollIntoView(cell: Cell) {
    const el = scrollRef.current
    if (!el) return
    const top = cell.r * CELL
    const left = cell.c * CELL
    if (top < el.scrollTop) el.scrollTop = top
    else if (top + CELL > el.scrollTop + el.clientHeight) el.scrollTop = top + CELL - el.clientHeight
    if (left < el.scrollLeft) el.scrollLeft = left
    else if (left + CELL > el.scrollLeft + el.clientWidth) el.scrollLeft = left + CELL - el.clientWidth
  }

  function moveTo(cell: Cell) {
    const next = {
      r: Math.max(0, Math.min(store.rows - 1, cell.r)),
      c: Math.max(0, Math.min(store.cols - 1, cell.c)),
    }
    keyboardMove.current = true
    setFocus(next)
    scrollIntoView(next)
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const page = Math.max(1, view.vr - 2)
    const { r, c } = focus
    switch (e.key) {
      case 'ArrowUp':
        moveTo({ r: r - 1, c })
        break
      case 'ArrowDown':
        moveTo({ r: r + 1, c })
        break
      case 'ArrowLeft':
        moveTo({ r, c: c - 1 })
        break
      case 'ArrowRight':
        moveTo({ r, c: c + 1 })
        break
      case 'PageUp':
        moveTo({ r: r - page, c })
        break
      case 'PageDown':
        moveTo({ r: r + page, c })
        break
      case 'Home':
        moveTo(e.ctrlKey ? { r: 0, c: 0 } : { r, c: 0 })
        break
      case 'End':
        moveTo(e.ctrlKey ? { r: store.rows - 1, c: store.cols - 1 } : { r, c: store.cols - 1 })
        break
      case 'Enter':
      case ' ':
        onActivate(focus)
        break
      default:
        return
    }
    e.preventDefault()
  }

  function cellFromEvent(target: EventTarget): Cell | null {
    const el = (target as HTMLElement).closest<HTMLElement>('[data-r]')
    if (!el) return null
    return { r: Number(el.dataset.r), c: Number(el.dataset.c) }
  }

  // Ventana a renderizar (más la celda con foco, si quedó fuera).
  const { rowList, colRange } = useMemo(() => {
    let rStart = Math.max(0, view.r0 - OVERSCAN)
    let rEnd = Math.min(store.rows - 1, view.r0 + view.vr + OVERSCAN)
    let cStart = Math.max(0, view.c0 - OVERSCAN)
    let cEnd = Math.min(store.cols - 1, view.c0 + view.vc + OVERSCAN)
    // Tope duro de celdas en el DOM.
    while ((rEnd - rStart + 1) * (cEnd - cStart + 1) > MAX_DOM_CELLS - 1) {
      if (rEnd - rStart >= cEnd - cStart) rEnd--
      else cEnd--
      if (rEnd <= rStart && cEnd <= cStart) break
    }
    const rows: number[] = []
    for (let r = rStart; r <= rEnd; r++) rows.push(r)
    if (focus.r < rStart || focus.r > rEnd) rows.push(focus.r)
    rStart = Math.min(rStart, rEnd)
    cStart = Math.min(cStart, cEnd)
    return { rowList: rows, colRange: [cStart, cEnd] as const }
  }, [view, store.rows, store.cols, focus.r])

  const th = rules.tremorThreshold
  const span = Math.max(1, 101 - th)

  return (
    <div
      ref={scrollRef}
      role="grid"
      aria-label={label}
      aria-rowcount={store.rows}
      aria-colcount={store.cols}
      aria-multiselectable="true"
      tabIndex={-1}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      onClick={(e) => {
        const cell = cellFromEvent(e.target)
        if (!cell) return
        setFocus(cell)
        onActivate(cell)
      }}
      onPointerDown={(e) => {
        const cell = cellFromEvent(e.target)
        if (cell && selection.has(`${cell.r},${cell.c}`)) onDragStart(e, cell)
      }}
      className="relative h-[min(70vh,840px)] w-full max-w-[1120px] overflow-auto rounded border border-slate-700 bg-slate-950"
    >
      <div className="relative" style={{ height: store.rows * CELL, width: store.cols * CELL }}>
        {rowList.map((r) => {
          const cols: number[] = []
          for (let c = colRange[0]; c <= colRange[1]; c++) cols.push(c)
          if (r === focus.r && (focus.c < colRange[0] || focus.c > colRange[1])) cols.push(focus.c)
          return (
            <div
              key={r}
              role="row"
              aria-rowindex={r + 1}
              className="absolute left-0"
              style={{ top: r * CELL, height: CELL, width: store.cols * CELL }}
            >
              {cols.map((c) => {
                const data = store.cell(r, c)
                const scary = data ? isScary(rules, data.tremor) : false
                const k = `${r},${c}`
                return (
                  <GridCell
                    key={c}
                    r={r}
                    c={c}
                    digit={data ? data.digit : -1}
                    scary={scary}
                    level={data && scary ? 1 + Math.min(2, Math.floor(((data.tremor - th) / span) * 3)) : 0}
                    bin={data ? data.bin : '.'}
                    selected={selection.has(k)}
                    focused={focus.r === r && focus.c === c}
                    claimedBy={claims.get(k) ?? null}
                  />
                )
              })}
            </div>
          )
        })}
        {overlay}
      </div>
    </div>
  )
}
