import { Link } from 'react-router'
import type { Permission } from '../api/types'

export default function NoPermissionPage({ permission }: { permission: Permission }) {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Sin permiso</h1>
      <p className="mt-2 text-slate-300">
        Tu rol no tiene el permiso <code className="rounded bg-slate-800 px-1">{permission}</code> necesario para esta
        sala.
      </p>
      <Link to="/estado" className="mt-4 inline-block text-sky-300 underline">
        Ir al estado
      </Link>
    </main>
  )
}
