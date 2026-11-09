function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Falta la variable de entorno ${name}`)
  return value.replace(/\/+$/, '')
}

export const config = {
  apiBaseUrl: required('VITE_API_BASE_URL', import.meta.env.VITE_API_BASE_URL),
  wsBaseUrl: required('VITE_WS_BASE_URL', import.meta.env.VITE_WS_BASE_URL),
  buildSha: __BUILD_SHA__,
} as const
