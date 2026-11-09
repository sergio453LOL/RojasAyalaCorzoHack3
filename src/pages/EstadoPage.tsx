import { useEffect, useState } from 'react'
import { config } from '../lib/config'
import { apiFetch } from '../lib/http'

type Health = { kind: 'loading' } | { kind: 'ok'; body: string } | { kind: 'error'; message: string }

export default function EstadoPage() {
  const [health, setHealth] = useState<Health>({ kind: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    apiFetch('/meta/health', { signal: controller.signal })
      .then(async (res) => {
        const body = await res.text()
        setHealth(res.ok ? { kind: 'ok', body } : { kind: 'error', message: `HTTP ${res.status}` })
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setHealth({ kind: 'error', message: err instanceof Error ? err.message : 'Error de red' })
      })
    return () => controller.abort()
  }, [])

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Estado</h1>
      <dl className="mt-6 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2">
        <dt className="text-slate-400">Build</dt>
        <dd className="font-mono">{config.buildSha}</dd>
        <dt className="text-slate-400">API</dt>
        <dd role="status">
          {health.kind === 'loading' && 'Comprobando…'}
          {health.kind === 'ok' && <span className="text-emerald-300">Responde</span>}
          {health.kind === 'error' && <span className="text-rose-300">Sin respuesta ({health.message})</span>}
        </dd>
      </dl>
      {health.kind === 'ok' && (
        <pre className="mt-4 overflow-x-auto rounded bg-slate-900 p-3 text-xs">{health.body}</pre>
      )}
    </main>
  )
}
