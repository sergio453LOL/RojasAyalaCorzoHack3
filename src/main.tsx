import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router'
import './index.css'
import RouteErrorPage from './pages/RouteErrorPage'

const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      { path: '/', lazy: async () => ({ Component: (await import('./pages/HomePage')).default }) },
      { path: '/estado', lazy: async () => ({ Component: (await import('./pages/EstadoPage')).default }) },
      { path: '*', lazy: async () => ({ Component: (await import('./pages/NotFoundPage')).default }) },
    ],
  },
])

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('No existe #root')

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
