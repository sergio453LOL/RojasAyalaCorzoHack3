import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { errorMessage, isApiError } from '../api/errors'
import { useAuth } from '../auth/authContext'
import { Field, SubmitButton } from '../components/Field'

export default function LoginPage() {
  const { state, login } = useAuth()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const notice = state.status === 'anonymous' ? state.notice : null
  const next = params.get('next')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFormError(null)
    setFieldErrors({})
    try {
      await login(email, password)
      // PublicOnly redirige a `next` en cuanto la sesión queda autenticada.
    } catch (err) {
      if (isApiError(err) && err.code === 'INVALID_CREDENTIALS') setFormError('Email o contraseña incorrectos.')
      else if (isApiError(err) && err.code === 'VALIDATION_ERROR') setFieldErrors(err.fieldErrors())
      else setFormError(`No se pudo iniciar sesión: ${errorMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Entrar al piso</h1>
        <p className="mt-1 text-sm text-slate-300">Lumon Industries · Macrodata Refinement</p>
      </div>
      {notice && (
        <p role="alert" className="rounded border border-amber-300/60 bg-amber-300/10 p-3 text-sm text-amber-100">
          {notice}
        </p>
      )}
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
        />
        <Field
          label="Contraseña"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />
        {formError && (
          <p role="alert" className="text-sm text-rose-300">
            {formError}
          </p>
        )}
        <SubmitButton busy={busy}>Iniciar sesión</SubmitButton>
      </form>
      <p className="text-sm text-slate-300">
        ¿Primera vez?{' '}
        <Link
          to={next ? `/register?next=${encodeURIComponent(next)}` : '/register'}
          className="text-sky-300 underline"
        >
          Registrar la cuadrilla
        </Link>
      </p>
    </main>
  )
}
