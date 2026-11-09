import { Link } from 'react-router'

export default function NotFoundPage() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">404 · Esta sala no existe</h1>
      <Link to="/" className="mt-4 inline-block text-sky-300 underline">
        Volver al inicio
      </Link>
    </main>
  )
}
