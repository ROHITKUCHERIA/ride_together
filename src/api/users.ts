import { apiRequest } from '../lib/apiClient'
import type { User } from '../types/api'

export async function getMe(): Promise<User> {
  return apiRequest<User>('/api/users/me')
}

export interface UpdateProfileInput {
  name?: string
  avatarUrl?: string | null
}

export async function updateMe(input: UpdateProfileInput): Promise<User> {
  return apiRequest<User>('/api/users/me', {
    method: 'PUT',
    body: input,
  })
}