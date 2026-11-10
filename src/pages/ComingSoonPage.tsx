export default function ComingSoonPage({ title }: { title: string }) {
  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-slate-300">En construcción.</p>
    </main>
  )
}
