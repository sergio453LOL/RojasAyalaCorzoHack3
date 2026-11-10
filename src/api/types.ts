export type Permission =
  | 'files:read'
  | 'files:refine'
  | 'refiners:read'
  | 'refiners:write'
  | 'media:upload'
  | 'incidents:read'
  | 'incidents:create'
  | 'team:manage'

export interface User {
  id: number
  email: string
  displayName: string
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

export interface LoginResponse extends TokenPair {
  user: User
}

export interface RegisterResponse extends TokenPair {
  user: User
  team: { code: string; name: string }
}

export interface ClearanceStatus {
  granted: boolean
  grantedAt: string | null
}

export interface Me {
  id: number
  email: string
  displayName: string
  team: { code: string; name: string }
  role: { code: string; name: string }
  permissions: Permission[]
  clearance: ClearanceStatus
}

export interface Check {
  name: string
  passed: boolean
  detail: string
}

export interface IntegrationStatus {
  deploy: {
    origin: string | null
    verifiedAt: string | null
    lastBuildSeen: string | null
    lastBuildSeenAt: string | null
  }
  storage: {
    provider: 'SUPABASE' | 'CLOUDINARY' | null
    verifiedAt: string | null
    checks: Check[]
  }
  clearance: ClearanceStatus
}

export interface ClearanceCheckResult {
  granted: boolean
  grantedAt: string | null
  checks: Check[]
}

export interface RosterMember {
  name: string
  code: string
}

export interface RoundInfo {
  number: number
  startsAt: string
  drawAt: string
}

export interface Clearance {
  granted: boolean
  grantedAt: string | null
  checks: Check[]
  checkedAt: string | null
  workspace: { kind: 'DEV' | 'EVAL'; chaosLevel: 0 | 1 | 2 }
  roster: { members: RosterMember[]; complete: boolean; locked: boolean }
  round: {
    approved: boolean
    approvedAt: string | null
    approvedRound: number | null
    nextRoundAt: string | null
    nextRound: RoundInfo | null
    drawnMember: { round: number; name: string; code: string; startsAt: string } | null
    attempts: {
      round: number
      startsAt: string
      member: RosterMember
      result: 'PASSED' | 'FAILED' | 'ABSENT' | null
      gradedAt: string | null
    }[]
  }
}

export interface ApiErrorBody {
  error: string
  message: string
  details: unknown
  requestId?: string
}
