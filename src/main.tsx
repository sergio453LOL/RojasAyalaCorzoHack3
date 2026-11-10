import { StrictMode, type ComponentType } from 'react'
import { createRoot } from 'react-dom/client'
import { Navigate, RouterProvider, createBrowserRouter } from 'react-router'
import './index.css'
import { AuthProvider } from './auth/AuthProvider'
import { PublicOnly, RequireAuth, RequirePermission } from './auth/guards'
import { AppLayout } from './components/AppLayout'
import { HealthGate } from './components/HealthGate'
import ComingSoonPage from './pages/ComingSoonPage'
import RouteErrorPage from './pages/RouteErrorPage'

const page = (load: () => Promise<{ default: ComponentType }>) => async () => ({
  Component: (await load()).default,
})

const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <PublicOnly />,
        children: [
          { path: '/login', lazy: page(() => import('./pages/LoginPage')) },
          { path: '/register', lazy: page(() => import('./pages/RegisterPage')) },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppLayout />,
            errorElement: <RouteErrorPage />,
            children: [
              { index: true, element: <Navigate to="/files" replace /> },
              { path: '/estado', lazy: page(() => import('./pages/EstadoPage')) },
              {
                element: <RequirePermission permission="files:read" />,
                children: [{ path: '/files', element: <ComingSoonPage title="Archivos de datos" /> }],
              },
              {
                element: <RequirePermission permission="refiners:read" />,
                children: [{ path: '/refiners', element: <ComingSoonPage title="Expedientes" /> }],
              },
              {
                element: <RequirePermission permission="incidents:read" />,
                children: [{ path: '/incidents', element: <ComingSoonPage title="Incidencias" /> }],
              },
            ],
          },
        ],
      },
      { path: '*', lazy: page(() => import('./pages/NotFoundPage')) },
    ],
  },
])

const rootElement = document.getElementById('root')
if (!rootElement) throw new Error('No existe #root')

createRoot(rootElement).render(
  <StrictMode>
    <HealthGate>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </HealthGate>
  </StrictMode>,
)
