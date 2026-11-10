import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { request } from '../api/client'
import { ApiError, SESSION_DEAD_CODES } from '../api/errors'
import type { LoginResponse, Me, RegisterResponse } from '../api/types'
import { AuthContext, type AuthApi, type AuthState } from './authContext'
import { hasStoredSession, logout as endRemoteSession, onSessionEvent, startSession, type EndReason } from './session'

const NOTICES: Record<EndReason, string | null> = {
  LOGOUT: null,
  REFRESH_REUSED: 'Tu sesión se cerró por seguridad: se detectó un token de refresco reutilizado. Vuelve a iniciar sesión.',
  SESSION_REVOKED: 'Tu sesión fue revocada. Vuelve a iniciar sesión.',
  REFRESH_INVALID: 'Tu sesión expiró. Vuelve a iniciar sesión.',
  TOKEN_INVALID: 'Tu sesión ya no es válida. Vuelve a iniciar sesión.',
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setStateRaw] = useState<AuthState>(() =>
    hasStoredSession() ? { status: 'checking' } : { status: 'anonymous', notice: null },
  )
  const stateRef = useRef(state)
  const setState = useCallback((next: AuthState) => {
    stateRef.current = next
    setStateRaw(next)
  }, [])

  const loadMe = useCallback(async () => {
    try {
      const me = await request<Me>('/auth/me')
      setState({ status: 'authenticated', me })
    } catch (e) {
      if (e instanceof ApiError && (SESSION_DEAD_CODES.has(e.code) || e.status === 401)) {
        setState({ status: 'anonymous', notice: NOTICES[e.code as EndReason] ?? NOTICES.SESSION_REVOKED })
      } else {
        setState({ status: 'anonymous', notice: 'No se pudo restaurar la sesión. Inicia sesión de nuevo.' })
      }
    }
  }, [setState])

  // Restauración al cargar: sin mostrar el login mientras se verifica.
  useEffect(() => {
    if (stateRef.current.status === 'checking') void loadMe()
  }, [loadMe])

  useEffect(
    () =>
      onSessionEvent((ev) => {
        if (ev.kind === 'ended') {
          setState({ status: 'anonymous', notice: NOTICES[ev.reason] })
        } else if (stateRef.current.status === 'anonymous') {
          // Otra pestaña inició sesión: esta la adopta.
          setState({ status: 'checking' })
          void loadMe()
        }
      }),
    [loadMe, setState],
  )

  const login = useCallback(
    async (email: string, password: string) => {
      const pair = await request<LoginResponse>('/auth/login', {
        method: 'POST',
        auth: false,
        body: { email, password },
      })
      setState({ status: 'checking' })
      startSession(pair)
      await loadMe()
    },
    [loadMe, setState],
  )

  const register = useCallback(
    async (teamName: string, email: string, password: string) => {
      const pair = await request<RegisterResponse>('/auth/register', {
        method: 'POST',
        auth: false,
        body: { teamName, email, password },
      })
      setState({ status: 'checking' })
      startSession(pair)
      await loadMe()
    },
    [loadMe, setState],
  )

  const logout = useCallback(async () => {
    await endRemoteSession()
    setState({ status: 'anonymous', notice: null })
  }, [setState])

  const api = useMemo<AuthApi>(
    () => ({ state, login, register, logout, reloadMe: loadMe }),
    [state, login, register, logout, loadMe],
  )

  return <AuthContext.Provider value={api}>{children}</AuthContext.Provider>
}
