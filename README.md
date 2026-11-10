# Lumon MDR Console — Cuadrilla PEKKA (TEAM-036)

Consola de **Macrodata Refinement** para la hackathon de frontend "Lumon Industries".
El enunciado original está en [`docs/ENUNCIADO.md`](docs/ENUNCIADO.md).

**Producción:** https://rojas-ayala-corzo-hack3.vercel.app

## Integrantes

| Nombre | Código |
|:--|:--|
| Sergio Rojas | 202410758 |
| Ernesto Corzo | 202310441 |
| Valeria Ayala | 202310180 |

## Stack

React 19 · TypeScript estricto · Vite · React Router · Tailwind CSS · Fetch API.
Sin librerías de componentes, de datos, de virtualización, de drag and drop ni de WebSocket/SSE.

## Cómo ejecutar

Requisitos: Node 24 LTS y npm.

```bash
npm install
cp .env.example .env   # y completar los valores
npm run dev            # http://localhost:5173
npm run build          # verificación de tipos + build de producción
```

### Variables de entorno

| Variable | Valor |
|:--|:--|
| `VITE_API_BASE_URL` | `https://lumon-api.vercel.app/api/v1` |
| `VITE_WS_BASE_URL` | `wss://lumon-api.vercel.app/api/v1` |
| `VITE_SUPABASE_URL` | URL del proyecto de Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Clave **publicable** (`sb_publishable_…`). Nunca la secreta ni `service_role`. |
| `VITE_SUPABASE_BUCKET` | `lumon-media` |

`X-Lumon-Build` no es una variable: se inyecta en tiempo de build (`vite.config.ts`). En `npm run dev` vale `dev`;
en producción es el SHA corto del commit (`VERCEL_GIT_COMMIT_SHA`).

## Despliegue (Vercel)

1. Proyecto de Vercel importado desde este repositorio; preset **Vite**; rama de producción `main`.
2. Las variables de entorno de la tabla anterior, cargadas en *Settings → Environment Variables*.
3. [`vercel.json`](vercel.json):
   - rewrite de toda ruta a `index.html` (abrir o recargar cualquier ruta funciona; los archivos estáticos
     como `/.well-known/lumon-verification.txt` se sirven antes que el rewrite);
   - cabeceras `Content-Security-Policy` (sin `unsafe-eval`, `script-src 'self'`, `connect-src` limitado a la API y a
     Supabase), `X-Content-Type-Options: nosniff` y `Referrer-Policy`.
4. Dominio verificado con `POST /integrations/deploy/challenge` → token publicado en
   [`public/.well-known/lumon-verification.txt`](public/.well-known/lumon-verification.txt) → `POST /integrations/deploy/verify`.

## Storage (Supabase)

- Bucket **público para lectura** `lumon-media`, solo `image/webp`, hasta 300 KB.
- Política RLS: el rol `anon` solo puede **insertar** dentro de la carpeta `TEAM-036/`. Sin `UPDATE` ni `DELETE`.

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('lumon-media', 'lumon-media', true, 307200, array['image/webp']);

create policy "anon inserta solo en TEAM-036"
on storage.objects for insert to anon
with check (bucket_id = 'lumon-media' and (storage.foldername(name))[1] = 'TEAM-036');
```

- Registrado y verificado con `PUT /integrations/storage`.

## Arquitectura

| Área | Dónde | Notas |
|:--|:--|:--|
| Cliente HTTP | `src/api/client.ts` | `X-Lumon-Build`, `Authorization`, refresh ante `TOKEN_EXPIRED` (una vez), reintento de `503` con `Retry-After`. |
| Sesión | `src/auth/session.ts` | Access token solo en memoria; refresh token (un solo uso) en `localStorage`; rotación bajo **Web Lock** para que ninguna pestaña reuse un refresh token; **BroadcastChannel** para compartir el token nuevo y el logout. |
| Rutas | `src/main.tsx`, `src/auth/guards.tsx` | Rutas privadas con `?next=`, permisos por `permissions`, páginas "sin permiso" y 404, error boundary. |
| Archivos | `src/pages/FilesPage.tsx` | Paginación, filtro, búsqueda con debounce y orden en la URL; respuestas viejas canceladas. |
| Grilla | `src/files/` | `TileStore` (caché, sin duplicados en vuelo, cancelación, `429`/`503`), `Grid` virtualizada en el DOM (≤ 2 500 celdas, ARIA grid, teclado), `groups.ts` (componentes conexos según las reglas del archivo). |
| Refinar | `src/pages/RefinePage.tsx` | Una `Idempotency-Key` por intención (grupo + caja), reusada en reintentos y doble clic. |
| Estado | `src/pages/EstadoPage.tsx` | Build, API, integraciones, revisión automática, Sala de Bienestar y modo caos. |
