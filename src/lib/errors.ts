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
    case 'MUSIC_QUERY_REQUIRED':
      return 'Type a song or artist to search.'
    case 'YOUTUBE_API_KEY_MISSING':
      return 'Music search is unavailable right now.'
    case 'YOUTUBE_API_ERROR':
      return 'Could not reach YouTube right now. Please try again shortly.'
    case 'YOUTUBE_VIDEO_NOT_FOUND':
      return "That song couldn't be found on YouTube."
    case 'SONG_ALREADY_ADDED':
      return "This song is already in the trip's music."
    case 'SONG_ALREADY_IN_PLAYLIST':
      return 'This song is already in that playlist.'
    case 'SONG_NOT_IN_PLAYLIST':
      return 'This song is not in that playlist.'
    case 'PLAYLIST_NOT_FOUND':
      return 'That playlist was not found. It may have been removed.'
    case 'PLAYLIST_PERMISSION_DENIED':
    case 'PLAYLIST_ACCESS_DENIED':
      return "You don't have permission to do that."
    case 'PLAYLIST_REORDER_MISMATCH':
      return 'The playlist changed before the reorder could be applied.'
    case 'JAM_NOT_FOUND':
      return "This Jam is no longer available."
    case 'JAM_ALREADY_ACTIVE':
      return 'A Jam is already active for this trip.'
    case 'JAM_ENDED':
      return 'This Jam is no longer active.'
    case 'JAM_NOT_HOST':
      return 'Only the Jam Host can control playback.'
    case 'JAM_ALREADY_JOINED':
      return 'You are already in this Jam.'
    case 'JAM_NOT_JOINED':
      return 'You are not in this Jam.'
    case 'JAM_INVALID_ACTION':
      return 'That playback action is not allowed right now.'
    case 'JAM_SONG_NOT_IN_TRIP':
      return "That song isn't in this trip's music library."
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
