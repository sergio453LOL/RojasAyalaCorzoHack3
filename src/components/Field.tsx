import { useId, type InputHTMLAttributes } from 'react'

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

export function Field({ label, error, ...input }: FieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-slate-200">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="rounded border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-300/40 aria-invalid:border-rose-400"
        {...input}
      />
      {error && (
        <p id={errorId} className="text-sm text-rose-300">
          {error}
        </p>
      )}
    </div>
  )
}

export function SubmitButton({ busy, children }: { busy: boolean; children: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      aria-busy={busy}
      className="rounded bg-sky-300 px-4 py-2 font-medium text-slate-950 hover:bg-sky-200 disabled:cursor-wait disabled:opacity-70"
    >
      {busy ? 'Un momento…' : children}
    </button>
  )
}
