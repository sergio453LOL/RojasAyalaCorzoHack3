import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { errorMessage, isApiError } from '../api/errors'
import { useAuth } from '../auth/authContext'
import { Field, SubmitButton } from '../components/Field'

function validate(teamName: string, email: string, password: string): Record<string, string> {
  const errors: Record<string, string> = {}
  const name = teamName.trim()
  if (name.length < 3 || name.length > 40) errors.teamName = 'Entre 3 y 40 caracteres.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'Email inválido.'
  if (password.length < 8 || password.length > 72) errors.password = 'Entre 8 y 72 caracteres.'
  return errors
}

export default function RegisterPage() {
  const { register } = useAuth()
  const [teamName, setTeamName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const local = validate(teamName, email, password)
    setFieldErrors(local)
    if (Object.keys(local).length > 0) return
    setBusy(true)
    try {
      await register(teamName.trim(), email.trim(), password)
    } catch (err) {
      const fields = isApiError(err) ? err.fieldErrors() : {}
      if (isApiError(err) && err.code === 'EMAIL_TAKEN') fields.email = 'Ese email ya está registrado.'
      if (isApiError(err) && err.code === 'TEAM_NAME_TAKEN') fields.teamName = 'Ese nombre de cuadrilla ya existe.'
      setFieldErrors(fields)
      if (fields._) setFormError(fields._)
      else if (Object.keys(fields).length === 0) setFormError(`No se pudo registrar: ${errorMessage(err)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Registrar la cuadrilla</h1>
        <p className="mt-1 text-sm text-slate-300">Se crea la cuenta y entras directo al piso.</p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field
          label="Nombre de la cuadrilla"
          autoComplete="organization"
          required
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          error={fieldErrors.teamName}
        />
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
          autoComplete="new-password"
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
        <SubmitButton busy={busy}>Registrar y entrar</SubmitButton>
      </form>
      <p className="text-sm text-slate-300">
        ¿Ya tienen cuenta?{' '}
        <Link to="/login" className="text-sky-300 underline">
          Iniciar sesión
        </Link>
      </p>
    </main>
  )
}
