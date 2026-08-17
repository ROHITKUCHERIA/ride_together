/**
 * Pure, time-based Jam synchronization math. Kept dependency-free so the drift
 * / skew behavior is unit-testable without a player or socket.
 *
 * The server is the source of truth: it publishes `position` (seconds) captured
 * at `positionAt` on the SERVER clock. The client skew-corrects using
 * `serverTime` (the server epoch when the state was produced) and derives the
 * current position as `position + (serverNow - positionAt) / 1000` while
 * playing. Paused states hold a fixed position.
 */

export interface SyncPlayback {
  /** Authoritative position (seconds) captured at `positionAt`. */
  position: number
  /** Server epoch-millis when `position` was captured. */
  positionAt: number
  isPlaying: boolean
  duration: number | null
  /** Skew = serverTime - localReceiveTime (ms). Adds to Date.now() later. */
  serverSkew: number
}

/** Clamps seconds to [0, duration] when the duration is known. */
export function clampPosition(
  position: number,
  duration: number | null,
): number {
  if (!Number.isFinite(position) || position < 0) return 0
  if (duration != null && duration > 0) return Math.min(position, duration)
  return position
}

/** Server clock skew relative to the local clock at a given receive time. */
export function computeServerSkew(serverTime: number, receivedAt: number): number {
  return serverTime - receivedAt
}

/**
 * The position the player should show NOW on this device. Paused states never
 * advance; playing states advance from the skew-corrected server clock.
 */
export function expectedPosition(
  state: SyncPlayback,
  now = Date.now(),
): number {
  if (!state.isPlaying) return clampPosition(state.position, state.duration)
  const serverNow = now + state.serverSkew
  const elapsed = Math.max(0, (serverNow - state.positionAt) / 1000)
  return clampPosition(state.position + elapsed, state.duration)
}

export type DriftAction = 'none' | 'soft' | 'hard'

/**
 * How to react to a position drift between the local player and the
 * authoritative Jam position (thresholds in SECONDS). Below the soft threshold:
 * do nothing (avoids jitter). In the soft band: optionally nudge. Above the
 * hard threshold: seek to the authoritative position.
 */
export function driftAction(
  localPosition: number,
  expected: number,
  thresholds: { soft?: number; hard?: number } = {},
): DriftAction {
  // Positions are in seconds, so the thresholds are too: nothing < ~1.5s,
  // optional gentle band up to ~2.5s, hard seek beyond that.
  const soft = thresholds.soft ?? 1.5
  const hard = thresholds.hard ?? 2.5
  const drift = Math.abs(localPosition - expected)
  if (drift >= hard) return 'hard'
  if (drift >= soft) return 'soft'
  return 'none'
}

/** True when the participant list contains the given user. */
export function isJamParticipant(
  participants: { userId: string }[] | undefined,
  userId: string,
): boolean {
  return (participants ?? []).some((p) => p.userId === userId)
}

/** True when the given user is the Jam Host. */
export function isJamHost(jam: { hostId?: string }, userId: string): boolean {
  return jam.hostId === userId
}
