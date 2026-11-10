import type { ApiErrorBody } from './types'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown
  readonly retryAfter: number | null

  constructor(status: number, body: ApiErrorBody | null, retryAfter: number | null) {
    super(body?.message ?? `HTTP ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.code = body?.error ?? 'UNKNOWN'
    this.details = body?.details ?? null
    this.retryAfter = retryAfter
  }

  /** `details.fields` de VALIDATION_ERROR, o `{ [details.field]: message }` en conflictos. */
  fieldErrors(): Record<string, string> {
    const d = this.details
    if (d && typeof d === 'object') {
      if ('fields' in d && d.fields && typeof d.fields === 'object') {
        const out: Record<string, string> = {}
        for (const [k, v] of Object.entries(d.fields)) if (typeof v === 'string') out[k] = v
        return out
      }
      if ('field' in d && typeof d.field === 'string') return { [d.field]: this.message }
    }
    return {}
  }
}

/** Errores que significan "la sesión ya no sirve: al login". */
export const SESSION_DEAD_CODES = new Set([
  'REFRESH_REUSED',
  'REFRESH_INVALID',
  'SESSION_REVOKED',
  'TOKEN_INVALID',
])

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message
  if (e instanceof DOMException && e.name === 'AbortError') return 'Cancelado'
  if (e instanceof Error) return e.message
  return 'Error desconocido'
}
