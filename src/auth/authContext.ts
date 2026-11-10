import { createContext, useContext } from 'react'
import type { Me, Permission } from '../api/types'

export type AuthState =
  | { status: 'checking' }
  | { status: 'anonymous'; notice: string | null }
  | { status: 'authenticated'; me: Me }

export interface AuthApi {
  state: AuthState
  login: (email: string, password: string) => Promise<void>
  register: (teamName: string, email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  reloadMe: () => Promise<void>
}

export const AuthContext = createContext<AuthApi | null>(null)

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth fuera de AuthProvider')
  return ctx
}

export function useMe(): Me {
  const { state } = useAuth()
  if (state.status !== 'authenticated') throw new Error('useMe sin sesión')
  return state.me
}

export function useCan(permission: Permission): boolean {
  const { state } = useAuth()
  return state.status === 'authenticated' && state.me.permissions.includes(permission)
}
