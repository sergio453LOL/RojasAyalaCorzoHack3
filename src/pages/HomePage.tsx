import { Link } from 'react-router'

export default function HomePage() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-3xl font-semibold">Lumon · Macrodata Refinement</h1>
      <p className="mt-2 text-slate-300">El trabajo es misterioso e importante.</p>
      <Link to="/estado" className="mt-6 inline-block text-sky-300 underline">
        Ver estado
      </Link>
    </main>
  )
}
