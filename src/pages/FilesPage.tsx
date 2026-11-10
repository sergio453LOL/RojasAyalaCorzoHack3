import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { request } from '../api/client'
import { errorMessage } from '../api/errors'
import type { FilePage, FileStatus } from '../files/types'

const SIZES = [10, 25, 50] as const
const SORTS = [
  { value: 'updatedAt,desc', label: 'Últimos actualizados' },
  { value: 'progress,desc', label: 'Más avanzados' },
  { value: 'name,asc', label: 'Nombre (A-Z)' },
] as const
const STATUSES: { value: '' | FileStatus; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'ACTIVE', label: 'Activos' },
  { value: 'COMPLETE', label: 'Completados' },
]

interface Query {
  page: number
  size: number
  status: '' | FileStatus
  q: string
  sort: string
}

const DEFAULTS: Query = { page: 0, size: 10, status: '', q: '', sort: 'updatedAt,desc' }

/** Lee la URL y descarta lo inválido: una URL rota nunca rompe la vista. */
function parseQuery(params: URLSearchParams): Query {
  const page = Number(params.get('page'))
  const size = Number(params.get('size'))
  const status = params.get('status')
  const sort = params.get('sort')
  return {
    page: Number.isInteger(page) && page >= 0 && page < 100000 ? page : DEFAULTS.page,
    size: (SIZES as readonly number[]).includes(size) ? size : DEFAULTS.size,
    status: status === 'ACTIVE' || status === 'COMPLETE' ? status : '',
    q: (params.get('q') ?? '').slice(0, 60),
    sort: SORTS.some((s) => s.value === sort) ? (sort as string) : DEFAULTS.sort,
  }
}

function toParams(q: Query): URLSearchParams {
  const p = new URLSearchParams()
  if (q.page !== DEFAULTS.page) p.set('page', String(q.page))
  if (q.size !== DEFAULTS.size) p.set('size', String(q.size))
  if (q.status) p.set('status', q.status)
  if (q.q) p.set('q', q.q)
  if (q.sort !== DEFAULTS.sort) p.set('sort', q.sort)
  return p
}

function pct(n: number) {
  return `${Math.round(n * 100)} %`
}

type Load = { kind: 'loading' } | { kind: 'ok'; data: FilePage } | { kind: 'error'; message: string }

export default function FilesPage() {
  const [params, setParams] = useSearchParams()
  const query = parseQuery(params)
  const queryKey = toParams(query).toString()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [reloadTick, setReloadTick] = useState(0)
  const [search, setSearch] = useState(query.q)
  const lastData = useRef<FilePage | null>(null)

  // Normaliza la URL si traía valores inválidos (sin agregar historial).
  useEffect(() => {
    if (params.toString() !== queryKey) setParams(new URLSearchParams(queryKey), { replace: true })
  }, [params, queryKey, setParams])

  // Si la URL cambia por atrás/adelante, el campo de búsqueda la sigue.
  useEffect(() => setSearch(query.q), [query.q])

  // Búsqueda sin una request por tecla: espera 350 ms sin escribir.
  useEffect(() => {
    if (search === query.q) return
    const t = window.setTimeout(() => {
      setParams(toParams({ ...query, q: search.slice(0, 60), page: 0 }), { replace: true })
    }, 350)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  // Una respuesta vieja nunca pisa a una nueva: se aborta la anterior.
  useEffect(() => {
    const controller = new AbortController()
    setLoad({ kind: 'loading' })
    const apiParams = new URLSearchParams({ page: String(query.page), size: String(query.size), sort: query.sort })
    if (query.status) apiParams.set('status', query.status)
    if (query.q) apiParams.set('q', query.q)
    request<FilePage>(`/files?${apiParams.toString()}`, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return
        lastData.current = data
        setLoad({ kind: 'ok', data })
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setLoad({ kind: 'error', message: errorMessage(e) })
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, reloadTick])

  function update(patch: Partial<Query>) {
    setParams(toParams({ ...query, page: 0, ...patch }))
  }

  const data = load.kind === 'ok' ? load.data : lastData.current
  const totalPages = data?.totalPages ?? 0

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">Archivos de datos</h1>

      <form className="flex flex-wrap items-end gap-4" onSubmit={(e) => e.preventDefault()} role="search">
        <div className="flex flex-col gap-1">
          <label htmlFor="files-q" className="text-sm text-slate-300">
            Buscar
          </label>
          <input
            id="files-q"
            type="search"
            maxLength={60}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded border border-slate-600 bg-slate-900 px-3 py-1.5"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="files-status" className="text-sm text-slate-300">
            Estado
          </label>
          <select
            id="files-status"
            value={query.status}
            onChange={(e) => update({ status: e.target.value as Query['status'] })}
            className="rounded border border-slate-600 bg-slate-900 px-2 py-1.5"
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="files-sort" className="text-sm text-slate-300">
            Orden
          </label>
          <select
            id="files-sort"
            value={query.sort}
            onChange={(e) => update({ sort: e.target.value })}
            className="rounded border border-slate-600 bg-slate-900 px-2 py-1.5"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="files-size" className="text-sm text-slate-300">
            Por página
          </label>
          <select
            id="files-size"
            value={query.size}
            onChange={(e) => update({ size: Number(e.target.value) })}
            className="rounded border border-slate-600 bg-slate-900 px-2 py-1.5"
          >
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </form>

      <div aria-live="polite" className="min-h-6 text-sm">
        {load.kind === 'loading' && <span className="text-slate-300">Cargando archivos…</span>}
        {load.kind === 'error' && (
          <span className="text-rose-300">
            No se pudieron cargar los archivos: {load.message}{' '}
            <button type="button" className="underline" onClick={() => setReloadTick((t) => t + 1)}>
              Reintentar
            </button>
          </span>
        )}
        {load.kind === 'ok' && (
          <span className="text-slate-300">
            {load.data.totalElements} archivo{load.data.totalElements === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {data && (
        <div className={load.kind === 'loading' ? 'opacity-60' : undefined}>
          <table className="w-full border-collapse text-left">
            <caption className="sr-only">Archivos de datos</caption>
            <thead>
              <tr className="border-b border-slate-700 text-sm text-slate-300">
                <th scope="col" className="py-2 pr-4">
                  Nombre
                </th>
                <th scope="col" className="py-2 pr-4">
                  Tamaño
                </th>
                <th scope="col" className="py-2 pr-4">
                  Progreso
                </th>
                <th scope="col" className="py-2 pr-4">
                  Grupos
                </th>
                <th scope="col" className="py-2 pr-4">
                  Errores
                </th>
                <th scope="col" className="py-2">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {data.content.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-300">
                    Ningún archivo coincide con la búsqueda.
                  </td>
                </tr>
              )}
              {data.content.map((f) => (
                <tr key={f.id} className="border-b border-slate-800">
                  <td className="py-2 pr-4">
                    <Link to={`/files/${f.id}/refine`} className="text-sky-300 underline">
                      {f.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 font-mono text-sm">
                    {f.rows} × {f.cols}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <progress max={1} value={f.progress.overall} aria-label={`Progreso de ${f.name}`} className="w-24" />
                      <span className="text-sm">{pct(f.progress.overall)}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-4 text-sm">
                    {f.refinedGroups} / {f.totalGroups}
                  </td>
                  <td className="py-2 pr-4 text-sm">{f.mistakes}</td>
                  <td className="py-2 text-sm">{f.status === 'COMPLETE' ? 'Completado' : 'Activo'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <nav aria-label="Paginación" className="flex items-center gap-3">
        <button
          type="button"
          disabled={query.page === 0}
          onClick={() => setParams(toParams({ ...query, page: query.page - 1 }))}
          className="rounded border border-slate-600 px-3 py-1 disabled:opacity-40"
        >
          Anterior
        </button>
        <span className="text-sm text-slate-300">
          Página {query.page + 1} de {Math.max(totalPages, 1)}
        </span>
        <button
          type="button"
          disabled={query.page + 1 >= totalPages}
          onClick={() => setParams(toParams({ ...query, page: query.page + 1 }))}
          className="rounded border border-slate-600 px-3 py-1 disabled:opacity-40"
        >
          Siguiente
        </button>
      </nav>
    </main>
  )
}
