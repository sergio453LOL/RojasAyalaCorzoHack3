import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import type { Permission } from '../api/types'
import { useAuth, useMe } from '../auth/authContext'

const NAV: { to: string; label: string; permission: Permission | null }[] = [
  { to: '/files', label: 'Archivos', permission: 'files:read' },
  { to: '/refiners', label: 'Expedientes', permission: 'refiners:read' },
  { to: '/incidents', label: 'Incidencias', permission: 'incidents:read' },
  { to: '/estado', label: 'Estado', permission: null },
]

export function AppLayout() {
  const me = useMe()
  const { logout } = useAuth()
  const [leaving, setLeaving] = useState(false)

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="font-semibold">Lumon · MDR</span>
          <nav aria-label="Principal" className="flex flex-wrap gap-4">
            {NAV.filter((item) => item.permission === null || me.permissions.includes(item.permission)).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  isActive ? 'text-sky-300 underline underline-offset-4' : 'text-slate-200 hover:text-sky-300'
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-slate-300">
              {me.displayName} · {me.team.code} · {me.role.name}
            </span>
            <button
              type="button"
              disabled={leaving}
              onClick={() => {
                setLeaving(true)
                void logout()
              }}
              className="rounded border border-slate-600 px-3 py-1 hover:border-sky-300 disabled:opacity-70"
            >
              {leaving ? 'Saliendo…' : 'Cerrar sesión'}
            </button>
          </div>
        </div>
      </header>
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  )
}
