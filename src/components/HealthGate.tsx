import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { request } from '../api/client'

const MAX_DELAY_S = 30
const TIMEOUT_MS = 15000

type GateState = { kind: 'checking'; attempt: number } | { kind: 'ok' } | { kind: 'down'; attempt: number; retryAt: number }

/** Si /meta/health no responde, muestra "Conectando con Lumon…" y reintenta con espera creciente. */
export function HealthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>({ kind: 'checking', attempt: 0 })
  const [now, setNow] = useState(() => Date.now())
  const timer = useRef<number | null>(null)

  const check = useCallback(async (attempt: number) => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    setState({ kind: 'checking', attempt })
    try {
      await request('/meta/health', { auth: false, retries503: 0, signal: AbortSignal.timeout(TIMEOUT_MS) })
      setState({ kind: 'ok' })
    } catch {
      const delayS = Math.min(MAX_DELAY_S, 2 ** attempt)
      const retryAt = Date.now() + delayS * 1000
      setState({ kind: 'down', attempt, retryAt })
      timer.current = window.setTimeout(() => void check(attempt + 1), delayS * 1000)
    }
  }, [])

  useEffect(() => {
    void check(0)
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [check])

  useEffect(() => {
    if (state.kind !== 'down') return
    const id = window.setInterval(() => setNow(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [state.kind])

  if (state.kind === 'ok') return <>{children}</>

  const seconds = state.kind === 'down' ? Math.max(0, Math.ceil((state.retryAt - now) / 1000)) : 0
  return (
    <main className="grid min-h-screen place-items-center p-8">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <h1 className="text-xl font-semibold">Conectando con Lumon…</h1>
        <p role="status" aria-live="polite" className="text-slate-300">
          {state.kind === 'checking'
            ? state.attempt === 0
              ? 'Comprobando el servicio. La primera conexión puede tardar unos segundos.'
              : `Reintentando (intento ${state.attempt + 1})…`
            : `El servicio no responde. Nuevo intento en ${seconds} s.`}
        </p>
        {state.kind === 'down' && (
          <button
            type="button"
            onClick={() => void check(state.attempt + 1)}
            className="rounded bg-sky-300 px-4 py-2 font-medium text-slate-950 hover:bg-sky-200"
          >
            Reintentar ahora
          </button>
        )}
      </div>
    </main>
  )
}
