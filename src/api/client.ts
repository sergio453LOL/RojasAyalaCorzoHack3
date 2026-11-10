import { config } from '../lib/config'
import { endSession, getAccessToken, refreshAccess, restoreAccess, type EndReason } from '../auth/session'
import { ApiError } from './errors'
import type { ApiErrorBody } from './types'

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
  /** false para rutas públicas (sin Authorization). */
  auth?: boolean
  /** Reintentos ante 503 (con Retry-After y espera creciente). Por defecto 3 en GET, 0 en el resto. */
  retries503?: number
}

export interface RawResponse<T> {
  data: T
  status: number
  headers: Headers
}

function parseRetryAfter(res: Response): number | null {
  const v = res.headers.get('Retry-After')
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const t = window.setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      window.clearTimeout(t)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: ApiErrorBody | null = null
  try {
    body = (await res.json()) as ApiErrorBody
  } catch {
    /* cuerpo vacío o no JSON */
  }
  return new ApiError(res.status, body, parseRetryAfter(res))
}

async function send(path: string, opts: RequestOptions, token: string | null): Promise<Response> {
  const headers: Record<string, string> = { 'X-Lumon-Build': config.buildSha, ...opts.headers }
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`
  return fetch(`${config.apiBaseUrl}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    signal: opts.signal,
  })
}

/** Request a la API con X-Lumon-Build, Authorization y refresh coordinado ante TOKEN_EXPIRED (una sola vez). */
export async function requestRaw<T>(path: string, opts: RequestOptions = {}): Promise<RawResponse<T>> {
  const auth = opts.auth ?? true
  const maxRetries503 = opts.retries503 ?? ((opts.method ?? 'GET') === 'GET' ? 3 : 0)
  let token = auth ? (getAccessToken() ?? (await restoreAccess())) : null
  let refreshed = false
  let attempt503 = 0

  for (;;) {
    const res = await send(path, opts, token)
    if (res.ok) {
      const data = (res.status === 204 ? undefined : await res.json()) as T
      return { data, status: res.status, headers: res.headers }
    }
    const err = await toApiError(res)

    if (auth && err.status === 401) {
      if (err.code === 'TOKEN_EXPIRED' && !refreshed) {
        refreshed = true
        token = await refreshAccess(token)
        continue
      }
      if (err.code === 'SESSION_REVOKED' || err.code === 'TOKEN_INVALID') endSession(err.code as EndReason)
    }

    if (err.status === 503 && attempt503 < maxRetries503) {
      const backoff = 500 * 2 ** attempt503 + Math.random() * 250
      attempt503 += 1
      await sleep(Math.max((err.retryAfter ?? 0) * 1000, backoff), opts.signal)
      continue
    }
    throw err
  }
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return (await requestRaw<T>(path, opts)).data
}
