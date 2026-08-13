import { apiRequest } from '../lib/apiClient'
import { setTokens } from '../lib/tokens'
import type { AuthTokens, LoginResponse, RegisterResponse, User } from '../types/api'

export interface RegisterInput {
  name: string
  email: string
  password: string
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const data = await apiRequest<LoginResponse>('/api/auth/login', {
    method: 'POST',
    auth: false,
    retryOnAuth: false,
    body: { email, password },
  })
  setTokens(data.accessToken, data.refreshToken)
  return data
}

export async function register(input: RegisterInput): Promise<RegisterResponse> {
  const data = await apiRequest<RegisterResponse>('/api/auth/register', {
    method: 'POST',
    auth: false,
    retryOnAuth: false,
    body: input,
  })
  setTokens(data.accessToken, data.refreshToken)
  return data
}

export async function logout(refreshToken: string): Promise<void> {
  try {
    await apiRequest('/api/auth/logout', {
      method: 'POST',
      auth: false,
      body: { refreshToken },
      retryOnAuth: false,
    })
  } catch {
    // Best-effort revoke; local session is cleared by the caller regardless.
  }
}

export async function fetchMe(): Promise<User> {
  return apiRequest<User>('/api/auth/me')
}

export type { AuthTokens }
