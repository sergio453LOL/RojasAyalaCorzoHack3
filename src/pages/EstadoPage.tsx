import { useCallback, useEffect, useState } from 'react'
import { request } from '../api/client'
import { errorMessage, isApiError } from '../api/errors'
import type { Check, Clearance, ClearanceCheckResult, IntegrationStatus } from '../api/types'
import { useAuth } from '../auth/authContext'
import { config } from '../lib/config'

type Load<T> = { kind: 'loading' } | { kind: 'ok'; data: T } | { kind: 'error'; message: string }

const fmt = (iso: string) => new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })

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

  const [clearance, setClearance] = useState<Load<Clearance>>({ kind: 'loading' })

  const loadStatus = useCallback(async (signal?: AbortSignal) => {
    setStatus({ kind: 'loading' })
    try {
      setStatus({ kind: 'ok', data: await request<IntegrationStatus>('/integrations/status', { signal }) })
    } catch (e) {
      if (!signal?.aborted) setStatus({ kind: 'error', message: errorMessage(e) })
    }
  }, [])

  const loadClearance = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await request<Clearance>('/clearance', { signal })
      setClearance({ kind: 'ok', data })
      setChaos((c) => ({ ...c, level: data.workspace.chaosLevel }))
    } catch (e) {
      if (!signal?.aborted) setClearance({ kind: 'error', message: errorMessage(e) })
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
    void loadClearance(controller.signal)
    return () => controller.abort()
  }, [loadStatus, loadClearance])

  async function runCheck() {
    setCheck({ kind: 'loading' })
    try {
      const result = await request<ClearanceCheckResult>('/clearance/check', { method: 'POST' })
      setCheck({ kind: 'ok', data: result })
      if (result.granted) void reloadMe()
      void loadClearance()
    } catch (e) {
      const msg =
        isApiError(e) && e.code === 'CHECK_FROM_APP_REQUIRED'
          ? 'La revisión solo cuenta desde la app desplegada en el dominio verificado (no desde localhost).'
          : errorMessage(e)
      setCheck({ kind: 'error', message: msg })
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
  const cl = clearance.kind === 'ok' ? clearance.data : null

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
          {!check && cl && (
            <div className="flex flex-col gap-2">
              <p className={cl.granted ? 'text-emerald-300' : 'text-slate-300'}>
                {cl.granted
                  ? `Piso de Pruebas abierto${cl.grantedAt ? ` desde ${fmt(cl.grantedAt)}` : ''}.`
                  : cl.checkedAt
                    ? `Última revisión: ${fmt(cl.checkedAt)}.`
                    : 'Todavía no se corrió la revisión.'}
              </p>
              <CheckList checks={cl.checks} />
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="sec-bienestar" className="flex flex-col gap-2">
        <h2 id="sec-bienestar" className="text-lg font-semibold">
          Sala de Bienestar
        </h2>
        {clearance.kind === 'loading' && <p role="status">Cargando…</p>}
        {clearance.kind === 'error' && (
          <p role="alert" className="text-rose-300">
            {clearance.message}{' '}
            <button type="button" className="underline" onClick={() => void loadClearance()}>
              Reintentar
            </button>
          </p>
        )}
        {cl && (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1">
            <dt className="text-slate-400">Ronda de control</dt>
            <dd className={cl.round.approved ? 'text-emerald-300' : undefined}>
              {cl.round.approved ? `Aprobada (ronda ${cl.round.approvedRound ?? '?'})` : 'Sin ronda aprobada'}
            </dd>
            <dt className="text-slate-400">Próxima ronda</dt>
            <dd>{cl.round.nextRound ? `N.º ${cl.round.nextRound.number}, ${fmt(cl.round.nextRound.startsAt)}` : '—'}</dd>
            <dt className="text-slate-400">Sorteado</dt>
            <dd>
              {cl.round.drawnMember
                ? `${cl.round.drawnMember.name} (${cl.round.drawnMember.code}), ronda ${cl.round.drawnMember.round}`
                : '—'}
            </dd>
            <dt className="text-slate-400">Integrantes</dt>
            <dd>
              {cl.roster.members.length > 0 ? cl.roster.members.map((m) => `${m.name} (${m.code})`).join(', ') : 'Sin inscribir'}
              {cl.roster.complete ? '' : ' · roster incompleto'}
            </dd>
            {cl.round.attempts.length > 0 && (
              <>
                <dt className="text-slate-400">Intentos</dt>
                <dd>
                  {cl.round.attempts
                    .map((a) => `Ronda ${a.round}: ${a.member.name} · ${a.result ?? 'pendiente'}`)
                    .join(' · ')}
                </dd>
              </>
            )}
            <dt className="text-slate-400">Workspace</dt>
            <dd>
              {cl.workspace.kind} · caos {cl.workspace.chaosLevel}
            </dd>
          </dl>
        )}
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
