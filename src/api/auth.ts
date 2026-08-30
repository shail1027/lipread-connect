import { apiRequest } from './client'

export type User = {
  user_id: number
  username: string
  display_name: string
}

export type UserRole = 'PATIENT' | 'STAFF'

export type SignupInput = {
  username: string
  password: string
  display_name: string
}

export type LoginInput = {
  username: string
  password: string
}

export type LoginSession = {
  session_token: string
  expires_at: string
}

type StoredSession = {
  token: string
  expiresAt: string
  role: UserRole
}

const SESSION_STORAGE_KEY = 'lipread-connect-session'

export const signup = (input: SignupInput) =>
  apiRequest<User>('/api/v1/auth/signup', {
    method: 'POST',
    body: JSON.stringify(input),
  })

export const login = (input: LoginInput) =>
  apiRequest<LoginSession>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })

export const getCurrentUser = (sessionToken: string) =>
  apiRequest<User>('/api/v1/auth/me', { sessionToken })

export const logout = (sessionToken: string) =>
  apiRequest<{ message: string }>('/api/v1/auth/logout', {
    method: 'POST',
    sessionToken,
  })

export function saveSession(session: LoginSession, role: UserRole = 'PATIENT'): void {
  const storedSession: StoredSession = {
    token: session.session_token,
    expiresAt: session.expires_at,
    role,
  }
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(storedSession))
}

export function loadSession(): StoredSession | null {
  const rawSession = window.sessionStorage.getItem(SESSION_STORAGE_KEY)
  if (!rawSession) return null

  try {
    const session = JSON.parse(rawSession) as Partial<StoredSession>
    if (
      typeof session.token !== 'string' ||
      typeof session.expiresAt !== 'string' ||
      new Date(session.expiresAt).getTime() <= Date.now()
    ) {
      clearSession()
      return null
    }
    const role: UserRole = session.role === 'STAFF' ? 'STAFF' : 'PATIENT'
    return { token: session.token, expiresAt: session.expiresAt, role }
  } catch {
    clearSession()
    return null
  }
}

export function clearSession(): void {
  window.sessionStorage.removeItem(SESSION_STORAGE_KEY)
}
