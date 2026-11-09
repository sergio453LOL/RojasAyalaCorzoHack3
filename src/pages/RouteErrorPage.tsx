import { Link, isRouteErrorResponse, useRouteError } from 'react-router'

export default function RouteErrorPage() {
  const error = useRouteError()
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Error desconocido'

  return (
    <main role="alert" className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Algo salió mal</h1>
      <p className="mt-2 text-slate-300">{message}</p>
      <Link to="/" className="mt-4 inline-block text-sky-300 underline">
        Volver al inicio
      </Link>
    </main>
  )
}
