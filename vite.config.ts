import { execSync } from 'node:child_process'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// SHA corto del commit desplegado. En `vite` (dev) vale "dev".
function buildSha(command: 'build' | 'serve'): string {
  if (command === 'serve') return 'dev'
  const fromEnv =
    process.env.VERCEL_GIT_COMMIT_SHA ?? // Vercel
    process.env.COMMIT_REF ?? // Netlify
    process.env.CF_PAGES_COMMIT_SHA // Cloudflare Pages
  if (fromEnv) return fromEnv.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
  } catch {
    return 'dev'
  }
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha(command)),
  },
}))
