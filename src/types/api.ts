export type TripStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED'
export type MemberRole = 'OWNER' | 'ADMIN' | 'MEMBER'

export interface User {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  createdAt: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

export interface LoginResponse extends AuthTokens {
  user?: User
}

export interface RegisterResponse {
  user: User
  accessToken: string
  refreshToken: string
}

export interface Trip {
  id: string
  name: string
  description: string | null
  startLocation: string | null
  destination: string
  startLatitude: number | null
  startLongitude: number | null
  destinationLatitude: number | null
  destinationLongitude: number | null
  startDate: string
  endDate: string
  status: TripStatus
  inviteCode: string
  createdBy: string
  createdAt: string
  updatedAt: string
  _count: { members: number }
}

export interface TripMember {
  id: string
  name: string
  avatarUrl: string | null
  role: MemberRole
  joinedAt: string
}

export interface CreateTripInput {
  name: string
  description?: string
  startLocation?: string
  destination: string
  startLatitude?: number
  startLongitude?: number
  destinationLatitude?: number
  destinationLongitude?: number
  startDate: string
  endDate: string
}

export interface UpdateTripInput extends Partial<CreateTripInput> {}

export interface Paginated<T> {
  data: T[]
  meta: { page: number; limit: number; total: number }
}
