import { useCallback, useEffect, useState } from 'react'
import { request } from '../api/client'
import { errorMessage } from '../api/errors'
import type { Check, ClearanceCheckResult, IntegrationStatus } from '../api/types'
import { useAuth } from '../auth/authContext'
import { config } from '../lib/config'

type Load<T> = { kind: 'loading' } | { kind: 'ok'; data: T } | { kind: 'error'; message: string }

function CheckList({ checks }: { checks: Check[] }) {
  if (checks.length === 0) return <p className="text-slate-400">Sin comprobaciones todavía.</p>
  return (
    <ul className="flex flex-col gap-1">
      {checks.map((c) => (
        <li key={c.name} className="flex gap-2">
          <span aria-hidden="true">{c.passed ? '✅' : '❌'}</span>
          <span>
            <span className="font-mono">{c.name}</span>
            <span className="sr-only">{c.passed ? ' aprobada' : ' fallida'}</span>: {c.detail}
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function EstadoPage() {
  const { reloadMe } = useAuth()
  const [health, setHealth] = useState<Load<string>>({ kind: 'loading' })
  const [status, setStatus] = useState<Load<IntegrationStatus>>({ kind: 'loading' })
  const [check, setCheck] = useState<Load<ClearanceCheckResult> | null>(null)
  const [chaos, setChaos] = useState<{ level: number; busy: boolean; message: string | null }>({
    level: 0,
    busy: false,
    message: null,
  })

  const loadStatus = useCallback(async (signal?: AbortSignal) => {
    setStatus({ kind: 'loading' })
    try {
      setStatus({ kind: 'ok', data: await request<IntegrationStatus>('/integrations/status', { signal }) })
    } catch (e) {
      if (!signal?.aborted) setStatus({ kind: 'error', message: errorMessage(e) })
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    request<{ status: string }>('/meta/health', { auth: false, signal: controller.signal })
      .then((h) => setHealth({ kind: 'ok', data: h.status }))
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setHealth({ kind: 'error', message: errorMessage(e) })
      })
    void loadStatus(controller.signal)
    return () => controller.abort()
  }, [loadStatus])

  async function runCheck() {
    setCheck({ kind: 'loading' })
    try {
      const result = await request<ClearanceCheckResult>('/clearance/check', { method: 'POST' })
      setCheck({ kind: 'ok', data: result })
      if (result.granted) void reloadMe()
    } catch (e) {
      setCheck({ kind: 'error', message: errorMessage(e) })
    }
  }

  async function applyChaos() {
    setChaos((c) => ({ ...c, busy: true, message: null }))
    try {
      await request('/workspace/chaos', { method: 'PUT', body: { level: chaos.level } })
      setChaos((c) => ({ ...c, busy: false, message: `Caos ${c.level} activado.` }))
    } catch (e) {
      setChaos((c) => ({ ...c, busy: false, message: `Error: ${errorMessage(e)}` }))
    }
  }

  const st = status.kind === 'ok' ? status.data : null

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 p-6">
      <h1 className="text-2xl font-semibold">Estado</h1>

      <section aria-labelledby="sec-servicio">
        <h2 id="sec-servicio" className="mb-2 text-lg font-semibold">
          Servicio
        </h2>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1">
          <dt className="text-slate-400">Build desplegado</dt>
          <dd className="font-mono">{config.buildSha}</dd>
          <dt className="text-slate-400">API</dt>
          <dd role="status">
            {health.kind === 'loading' && 'Comprobando…'}
            {health.kind === 'ok' && <span className="text-emerald-300">Responde</span>}
            {health.kind === 'error' && <span className="text-rose-300">Sin respuesta ({health.message})</span>}
          </dd>
        </dl>
      </section>

      <section aria-labelledby="sec-integraciones">
        <h2 id="sec-integraciones" className="mb-2 text-lg font-semibold">
          Integraciones
        </h2>
        {status.kind === 'loading' && <p role="status">Cargando…</p>}
        {status.kind === 'error' && (
          <p role="alert" className="text-rose-300">
            {status.message}{' '}
            <button type="button" className="underline" onClick={() => void loadStatus()}>
              Reintentar
            </button>
          </p>
        )}
        {st && (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1">
            <dt className="text-slate-400">Dominio</dt>
            <dd>{st.deploy.verifiedAt ? `${st.deploy.origin ?? ''} (verificado)` : 'Sin verificar'}</dd>
            <dt className="text-slate-400">Último build visto</dt>
            <dd className="font-mono">{st.deploy.lastBuildSeen ?? '—'}</dd>
            <dt className="text-slate-400">Storage</dt>
            <dd>
              {st.storage.provider ?? 'Sin configurar'}
              {st.storage.verifiedAt ? ' (verificado)' : st.storage.provider ? ' (sin verificar)' : ''}
            </dd>
            <dt className="text-slate-400">Piso de Pruebas</dt>
            <dd>{st.clearance.granted ? <span className="text-emerald-300">Abierto</span> : 'Cerrado'}</dd>
          </dl>
        )}
      </section>

      <section aria-labelledby="sec-clearance" className="flex flex-col gap-3">
        <h2 id="sec-clearance" className="text-lg font-semibold">
          Revisión automática
        </h2>
        <div>
          <button
            type="button"
            onClick={() => void runCheck()}
            disabled={check?.kind === 'loading'}
            className="rounded bg-sky-300 px-4 py-2 font-medium text-slate-950 hover:bg-sky-200 disabled:opacity-70"
          >
            {check?.kind === 'loading' ? 'Revisando…' : 'Abrir el Piso de Pruebas'}
          </button>
        </div>
        <div aria-live="polite">
          {check?.kind === 'error' && <p className="text-rose-300">{check.message}</p>}
          {check?.kind === 'ok' && (
            <div className="flex flex-col gap-2">
              <p className={check.data.granted ? 'text-emerald-300' : 'text-amber-200'}>
                {check.data.granted ? 'Piso de Pruebas abierto.' : 'Todavía no pasan todas las comprobaciones.'}
              </p>
              <CheckList checks={check.data.checks} />
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="sec-caos" className="flex flex-col gap-2">
        <h2 id="sec-caos" className="text-lg font-semibold">
          Modo caos (para probar)
        </h2>
        <div className="flex items-center gap-3">
          <label htmlFor="chaos-level" className="text-slate-300">
            Nivel
          </label>
          <select
            id="chaos-level"
            value={chaos.level}
            onChange={(e) => setChaos((c) => ({ ...c, level: Number(e.target.value) }))}
            className="rounded border border-slate-600 bg-slate-900 px-2 py-1"
          >
            <option value={0}>0 · sin caos</option>
            <option value={1}>1 · como la evaluación</option>
            <option value={2}>2 · fuerte</option>
          </select>
          <button
            type="button"
            onClick={() => void applyChaos()}
            disabled={chaos.busy}
            className="rounded border border-slate-600 px-3 py-1 hover:border-sky-300 disabled:opacity-70"
          >
            {chaos.busy ? 'Aplicando…' : 'Aplicar'}
          </button>
        </div>
        {chaos.message && (
          <p role="status" className="text-sm text-slate-300">
            {chaos.message}
          </p>
        )}
      </section>
    </main>
  )
}
