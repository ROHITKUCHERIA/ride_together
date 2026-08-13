export type ApiErrorKind =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'validation'
  | 'rate_limited'
  | 'server'
  | 'network'
  | 'unknown'

export interface ApiErrorBody {
  success: false
  message: string
  errorCode: string
}

export class ApiError extends Error {
  readonly status: number
  readonly errorCode: string
  readonly kind: ApiErrorKind

  constructor(status: number, errorCode: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errorCode = errorCode
    this.kind = kindForStatus(status)
  }
}

function kindForStatus(status: number): ApiErrorKind {
  switch (status) {
    case 401:
      return 'unauthorized'
    case 403:
      return 'forbidden'
    case 404:
      return 'not_found'
    case 409:
      return 'conflict'
    case 422:
      return 'validation'
    case 429:
      return 'rate_limited'
    default:
      if (status >= 500) return 'server'
      return 'unknown'
  }
}

/**
 * Maps a backend error to a short, user-friendly message. Business codes
 * (invite code, already member, etc.) map to specific copy; everything else
 * falls back to a generic message per status so raw backend errors are never
 * surfaced to the user.
 */
export function friendlyError(status: number, errorCode: string, _backendMessage: string): string {
  switch (errorCode) {
    case 'INVALID_CREDENTIALS':
      return 'Incorrect email or password.'
    case 'EMAIL_ALREADY_EXISTS':
      return 'An account with this email already exists. Try signing in instead.'
    case 'INVALID_INVITE_CODE':
      return "That invite code isn't valid. Double-check and try again."
    case 'TRIP_ENDED':
      return 'This trip is no longer accepting new riders.'
    case 'ALREADY_MEMBER':
      return 'You are already a member of this trip.'
    case 'OWNER_CANNOT_LEAVE':
      return 'Transfer ownership before leaving the trip.'
    case 'LAST_OWNER_REMOVAL':
      return 'The trip owner cannot be removed.'
    case 'INVALID_ROLE_TRANSITION':
      return 'That action is not allowed for the current trip status or role.'
    case 'TRIP_PERMISSION_DENIED':
    case 'TRIP_ACCESS_DENIED':
      return "You don't have permission to do that."
    case 'UNAUTHENTICATED':
    case 'TOKEN_EXPIRED':
    case 'INVALID_REFRESH_TOKEN':
    case 'REFRESH_TOKEN_REUSED':
      return 'Your session has expired. Please sign in again.'
    case 'USER_NOT_FOUND':
    case 'TRIP_NOT_FOUND':
      return 'That was not found. It may have been removed.'
    case 'RATE_LIMITED':
      return 'Too many attempts. Please wait a moment and try again.'
    case 'VALIDATION_ERROR':
      return 'Please check the details you entered and try again.'
    default:
      break
  }

  switch (kindForStatus(status)) {
    case 'unauthorized':
      return 'Your session has expired. Please sign in again.'
    case 'forbidden':
      return "You don't have permission to do that."
    case 'not_found':
      return 'That was not found. It may have been removed.'
    case 'conflict':
      return 'That action conflicts with the current state. Refresh and try again.'
    case 'validation':
      return 'Please check the details you entered and try again.'
    case 'rate_limited':
      return 'Too many attempts. Please wait a moment and try again.'
    case 'server':
      return 'Something went wrong on our end. Please try again shortly.'
    default:
      return 'Something went wrong. Please try again.'
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError
}

/** True when the error is a network/transport failure rather than an HTTP status. */
export function isNetworkError(err: unknown): boolean {
  return err instanceof TypeError
}
