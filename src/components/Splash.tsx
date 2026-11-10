export function Splash({ label }: { label: string }) {
  return (
    <main className="grid min-h-screen place-items-center p-8" aria-busy="true">
      <p role="status" className="flex items-center gap-3 text-slate-300">
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-sky-300 border-t-transparent motion-reduce:animate-none"
        />
        {label}
      </p>
    </main>
  )
}
