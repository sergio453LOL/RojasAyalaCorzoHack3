import { Navigate, Outlet, useLocation, useSearchParams } from 'react-router'
import type { Permission } from '../api/types'
import { Splash } from '../components/Splash'
import NoPermissionPage from '../pages/NoPermissionPage'
import { useAuth } from './authContext'

/** Solo rutas internas: evita redirecciones abiertas (`//evil.com`, `https://…`). */
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/'
  return raw
}

export function RequireAuth() {
  const { state } = useAuth()
  const location = useLocation()
  if (state.status === 'checking') return <Splash label="Verificando la sesión…" />
  if (state.status === 'anonymous') {
    const next = location.pathname + location.search
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  return <Outlet />
}

export function PublicOnly() {
  const { state } = useAuth()
  const [params] = useSearchParams()
  if (state.status === 'checking') return <Splash label="Verificando la sesión…" />
  if (state.status === 'authenticated') return <Navigate to={safeNext(params.get('next'))} replace />
  return <Outlet />
}

export function RequirePermission({ permission }: { permission: Permission }) {
  const { state } = useAuth()
  if (state.status !== 'authenticated') return null
  if (!state.me.permissions.includes(permission)) return <NoPermissionPage permission={permission} />
  return <Outlet />
}
