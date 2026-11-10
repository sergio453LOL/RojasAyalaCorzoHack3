/**
 * Tokens de la sesión.
 *
 * - El access token vive SOLO en memoria (variable de este módulo).
 * - El refresh token (un solo uso) se guarda en localStorage para sobrevivir recargas y compartirse entre pestañas.
 * - Toda rotación de tokens pasa por un Web Lock: entre todas las pestañas, nunca hay dos refresh a la vez, y
 *   cada refresh usa el refresh token MÁS RECIENTE de localStorage. Así un token ya usado nunca se reenvía
 *   (eso provocaría REFRESH_REUSED y revocaría la sesión completa).
 * - BroadcastChannel reparte el access token nuevo y el logout a las demás pestañas.
 */
import { config } from '../lib/config'
import { ApiError, SESSION_DEAD_CODES } from '../api/errors'
import type { ApiErrorBody, TokenPair } from '../api/types'

const REFRESH_KEY = 'lumon.refresh'
const LOCK_NAME = 'lumon.refresh-lock'

type BusMessage =
  | { type: 'access'; accessToken: string }
  | { type: 'ended'; reason: EndReason }
  | { type: 'who-has-token' }

export type EndReason = 'LOGOUT' | 'REFRESH_REUSED' | 'SESSION_REVOKED' | 'REFRESH_INVALID' | 'TOKEN_INVALID'

type Listener = (event: { kind: 'access' } | { kind: 'ended'; reason: EndReason }) => void

let accessToken: string | null = null
let inflightRefresh: Promise<string> | null = null
const listeners = new Set<Listener>()

const bus: BroadcastChannel | null = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('lumon.auth')

function emit(event: Parameters<Listener>[0]) {
  for (const l of listeners) l(event)
}

function readRefresh(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY)
  } catch {
    return null
  }
}

function writeRefresh(token: string | null) {
  try {
    if (token) localStorage.setItem(REFRESH_KEY, token)
    else localStorage.removeItem(REFRESH_KEY)
  } catch {
    /* almacenamiento no disponible: la sesión no sobrevivirá a la recarga */
  }
}

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(LOCK_NAME, fn)
  }
  return fn()
}

function setAccess(token: string, broadcast: boolean) {
  accessToken = token
  if (broadcast) bus?.postMessage({ type: 'access', accessToken: token } satisfies BusMessage)
  emit({ kind: 'access' })
}

/** Termina la sesión en esta pestaña y avisa a las demás. */
export function endSession(reason: EndReason, broadcast = true) {
  const hadSession = accessToken !== null || readRefresh() !== null
  accessToken = null
  writeRefresh(null)
  if (broadcast) bus?.postMessage({ type: 'ended', reason } satisfies BusMessage)
  if (hadSession || !broadcast) emit({ kind: 'ended', reason })
}

export function getAccessToken(): string | null {
  return accessToken
}

export function hasStoredSession(): boolean {
  return readRefresh() !== null
}

/** Guarda un par recién emitido por login/registro. */
export function startSession(pair: TokenPair) {
  writeRefresh(pair.refreshToken)
  setAccess(pair.accessToken, true)
}

async function postRefresh(refreshToken: string): Promise<TokenPair> {
  const res = await fetch(`${config.apiBaseUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Lumon-Build': config.buildSha },
    body: JSON.stringify({ refreshToken }),
  })
  if (!res.ok) {
    let body: ApiErrorBody | null = null
    try {
      body = (await res.json()) as ApiErrorBody
    } catch {
      /* cuerpo vacío */
    }
    throw new ApiError(res.status, body, null)
  }
  return (await res.json()) as TokenPair
}

/**
 * Devuelve un access token válido distinto de `failedToken`.
 * Una sola rotación en vuelo por pestaña; entre pestañas, serializado con Web Locks.
 */
export function refreshAccess(failedToken: string | null): Promise<string> {
  if (accessToken && accessToken !== failedToken) return Promise.resolve(accessToken)
  if (inflightRefresh) return inflightRefresh

  inflightRefresh = withLock(async () => {
    // Otra pestaña pudo rotar mientras esperábamos el lock y mandarnos el token nuevo.
    if (accessToken && accessToken !== failedToken) return accessToken
    const refreshToken = readRefresh()
    if (!refreshToken) {
      endSession('SESSION_REVOKED', false)
      throw new ApiError(401, { error: 'SESSION_REVOKED', message: 'No hay sesión.', details: null }, null)
    }
    try {
      const pair = await postRefresh(refreshToken)
      writeRefresh(pair.refreshToken)
      setAccess(pair.accessToken, true)
      return pair.accessToken
    } catch (e) {
      if (e instanceof ApiError && SESSION_DEAD_CODES.has(e.code)) endSession(e.code as EndReason)
      throw e
    }
  }).finally(() => {
    inflightRefresh = null
  })
  return inflightRefresh
}

/** Al cargar la pestaña: pide el token a otra pestaña abierta; si ninguna responde, rota. */
export async function restoreAccess(): Promise<string> {
  if (accessToken) return accessToken
  if (bus) {
    const fromPeer = await new Promise<string | null>((resolve) => {
      const timer = window.setTimeout(() => resolve(null), 250)
      const unsubscribe = onSessionEvent((ev) => {
        if (ev.kind === 'access' && accessToken) {
          window.clearTimeout(timer)
          unsubscribe()
          resolve(accessToken)
        }
      })
      bus.postMessage({ type: 'who-has-token' } satisfies BusMessage)
    })
    if (fromPeer) return fromPeer
  }
  return refreshAccess(null)
}

export async function logout(): Promise<void> {
  const refreshToken = readRefresh()
  endSession('LOGOUT')
  if (!refreshToken) return
  try {
    await fetch(`${config.apiBaseUrl}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Lumon-Build': config.buildSha },
      body: JSON.stringify({ refreshToken }),
      keepalive: true,
    })
  } catch {
    /* la sesión local ya se cerró; el refresh token caduca solo */
  }
}

export function onSessionEvent(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

bus?.addEventListener('message', (ev: MessageEvent<BusMessage>) => {
  const msg = ev.data
  if (msg.type === 'access') {
    setAccess(msg.accessToken, false)
  } else if (msg.type === 'ended') {
    endSession(msg.reason, false)
  } else if (msg.type === 'who-has-token' && accessToken) {
    bus.postMessage({ type: 'access', accessToken } satisfies BusMessage)
  }
})

// Respaldo sin BroadcastChannel: si otra pestaña borra el refresh token, la sesión terminó.
window.addEventListener('storage', (ev) => {
  if (ev.key === REFRESH_KEY && ev.newValue === null && accessToken) endSession('LOGOUT', false)
})
