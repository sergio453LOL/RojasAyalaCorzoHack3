import { config } from './config'

/** fetch a la API de Lumon con la cabecera X-Lumon-Build obligatoria. */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('X-Lumon-Build', config.buildSha)
  return fetch(`${config.apiBaseUrl}${path}`, { ...init, headers })
}
