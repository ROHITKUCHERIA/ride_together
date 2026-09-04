import { useCallback, useEffect, useRef } from 'react'
import { useMusicPlayer } from '../music/context'
import type { PlayerSong } from '../music/playerState'
import { useStore } from '../features/live-map/state/observable'
import { useConnection } from '../features/live-map/hooks/useLiveMap'
import { rideController } from '../features/live-map/services/rideController'
import { isApiError } from '../lib/errors'
import {
  createTripJam,
  deleteJam as apiDelete,
  getTripJam,
  jamControl as apiControl,
  joinJam as apiJoin,
  leaveJam as apiLeave,
} from '../api/jam'
import { jamStore } from './jamStore'
import type { JamUiState } from './jamStore'
import {
  computeServerSkew,
  driftAction,
  expectedPosition,
  isJamHost,
  isJamParticipant,
} from './jamSync'
import type {
  JamControlAction,
  JamControlInput,
  JamDeletedPayload,
  JamStatePayload,
} from '../types/jam'

const HOST_HEARTBEAT_MS = 15_000
const RESYNC_INTERVAL_MS = 5_000

export interface TripJamApi {
  ui: JamUiState
  isHost: boolean
  isParticipant: boolean
  createJam: () => Promise<void>
  join: () => Promise<void>
  leave: () => Promise<void>
  deleteJam: () => Promise<void>
  control: (action: JamControlAction, opts?: { songId?: string; position?: number }) => Promise<void>
  seek: (position: number) => Promise<void>
}

function errorMessage(err: unknown, fallback: string): string {
  return isApiError(err) ? err.message : fallback
}

function toPlayerSong(state: JamStatePayload): PlayerSong {
  const song = state.currentSong
  return {
    id: song!.songId,
    videoId: song!.youtubeVideoId,
    title: song!.title,
    artist: song!.channelTitle,
    thumbnailUrl: song!.thumbnailUrl,
    duration: song!.durationSeconds ?? undefined,
  }
}

/**
 * Central Jam sync engine. The server is the single source of truth: every
 * `jam:state` broadcast (from REST mutations + Socket.IO) is applied verbatim,
 * stale versions are dropped, and the local player is driven to the
 * skew-corrected server position. A lightweight periodic resync corrects drift
 * without spamming the network.
 *
 * The socket is the SHARED live-map connection (via rideController) — the Jam
 * never opens a second Socket.IO connection.
 */
export function useTripJam({
  tripId,
  userId,
}: {
  tripId?: string
  userId?: string
}): TripJamApi {
  const music = useMusicPlayer()
  const connection = useConnection()
  const ui = useStore(jamStore)

  const tripIdRef = useRef(tripId)
  tripIdRef.current = tripId
  const userIdRef = useRef(userId)
  userIdRef.current = userId
  const musicRef = useRef(music)
  musicRef.current = music

  const lastVersionRef = useRef(-1)
  const lastSongRef = useRef<string | null>(null)
  const lastSongPayloadRef = useRef<PlayerSong | null>(null)
  const skewRef = useRef(0)
  /** The song this user was listening to before the Jam took over their player,
   *  restored as "your last playing song" after leaving the Jam. */
  const preJamSnapshotRef = useRef<{ song: PlayerSong; position: number } | null>(null)
  const preJamCapturedRef = useRef(false)

  const jam = ui.jam
  const isHost = Boolean(userId && jam && isJamHost(jam, userId))
  const isParticipant = Boolean(
    userId && jam && isJamParticipant(jam.participants, userId),
  )

  /** Applies the authoritative state to the store + player (ignores stale). */
  const applyJamState = useCallback((state: JamStatePayload) => {
    if (state.stateVersion < lastVersionRef.current) return
    lastVersionRef.current = state.stateVersion
    skewRef.current = computeServerSkew(state.serverTime, Date.now())
    jamStore.update({
      phase: 'active',
      jam: state,
      endedMessage: null,
      notice: state.hostOnline ? null : 'The Host is currently disconnected.',
    })

    const me = userIdRef.current
    if (!me || !state.currentSong) return
    if (!isJamParticipant(state.participants, me)) return

    const song = toPlayerSong(state)
    const pos = expectedPosition(
      {
        position: state.position,
        positionAt: state.positionAt,
        isPlaying: state.isPlaying,
        duration: state.currentSong.durationSeconds,
        serverSkew: skewRef.current,
      },
      Date.now(),
    )
    lastSongPayloadRef.current = song
    if (song.videoId !== lastSongRef.current) {
      lastSongRef.current = song.videoId
    }
    // Remember the pre-Jam song the first time the Jam takes over this user's
    // player, so leaving the Jam can restore it as "your last playing song".
    const m = musicRef.current
    if (!preJamCapturedRef.current && !m.state.jamMode && m.current) {
      preJamSnapshotRef.current = {
        song: m.current.song,
        position: m.state.currentTime,
      }
      preJamCapturedRef.current = true
    }
    m.jamSync(song, pos, state.isPlaying)
  }, [])

  /** Exits the Jam player and restores the song the user was listening to
   *  before they joined (shown paused at the position where they left it). */
  const restorePreJam = useCallback(() => {
    const m = musicRef.current
    const snapshot = preJamSnapshotRef.current
    preJamSnapshotRef.current = null
    preJamCapturedRef.current = false
    lastSongRef.current = null
    lastSongPayloadRef.current = null
    if (snapshot) {
      m.restoreLastPlay(snapshot.song, snapshot.position)
    } else {
      m.jamEnd()
    }
  }, [])

  const refresh = useCallback(async () => {
    const t = tripIdRef.current
    if (!t) return
    try {
      const state = await getTripJam(t, { quiet: true })
      if (state) {
        applyJamState(state)
      } else {
        restorePreJam()
        jamStore.update({ phase: 'idle', jam: null, endedMessage: null, notice: null })
      }
    } catch {
      // Keep the current UI; the periodic resync/next reconnect will retry.
    }
  }, [applyJamState, restorePreJam])

  const handleJamDeleted = useCallback((_payload: JamDeletedPayload) => {
    lastVersionRef.current = -1
    restorePreJam()
    jamStore.update({
      phase: 'deleted',
      jam: null,
      endedMessage: 'The Jam has ended because the host ended the session.',
      notice: null,
    })
  }, [restorePreJam])

  // ---- connection + subscriptions on the SHARED socket ----
  useEffect(() => {
    if (!tripId || !userId) return
    let cancelled = false
    lastVersionRef.current = -1
    lastSongRef.current = null
    lastSongPayloadRef.current = null
    preJamSnapshotRef.current = null
    preJamCapturedRef.current = false
    skewRef.current = 0
    jamStore.update({ phase: 'loading', endedMessage: null, notice: null })

    void getTripJam(tripId, { quiet: true })
      .then((state) => {
        if (cancelled) return
        if (state) applyJamState(state)
        else jamStore.update({ phase: 'idle', jam: null })
      })
      .catch(() => {
        if (!cancelled) jamStore.update({ phase: 'idle' })
      })

    const subscribe = () => {
      const realtime = rideController.getSocketRealtime()
      if (!realtime) return null
      const offState = realtime.onJamState(applyJamState)
      const offDeleted = realtime.onJamDeleted(handleJamDeleted)
      const offError = realtime.onJamError((err) => {
        if (err?.code === 'JAM_ENDED') void refresh()
        else if (err?.message) jamStore.update({ notice: err.message })
      })
      return () => {
        offState()
        offDeleted()
        offError()
      }
    }

    // The live-map socket is created by useTripRealtime on mount; retry for a
    // short window in case the Jam effect runs before it exists.
    let unsubscribe: (() => void) | null = subscribe()
    const retry = window.setInterval(() => {
      if (unsubscribe) return
      unsubscribe = subscribe()
    }, 200)
    window.setTimeout(() => window.clearInterval(retry), 2_000)

    return () => {
      cancelled = true
      window.clearInterval(retry)
      unsubscribe?.()
      restorePreJam()
      jamStore.reset()
    }
  }, [tripId, userId, applyJamState, handleJamDeleted, refresh, restorePreJam])

  // Reflect the shared socket's connection state in the Jam UI. When the
  // transport re-establishes after a drop, re-sync from the server and re-join
  // if this client was already a participant (the server removes participants
  // whose socket disconnects) so a reconnect never silently kicks a rider out.
  const prevConnectionRef = useRef(connection)
  useEffect(() => {
    if (!tripId) return
    jamStore.update({ connection })
    const prev = prevConnectionRef.current
    prevConnectionRef.current = connection
    if (connection !== 'connected' || prev === 'connected') return
    const state = jamStore.getState().jam
    const me = userIdRef.current
    if (state && me && isJamParticipant(state.participants, me)) {
      void apiJoin(state.jamId)
        .then(applyJamState)
        .catch(() => void refresh())
    } else {
      void refresh()
    }
  }, [connection, tripId, applyJamState, refresh])

  // ---- Host presence heartbeat (silent unless the host returns online) ----
  useEffect(() => {
    if (!tripId || !userId || !isHost) return
    const realtime = rideController.getSocketRealtime()
    if (!realtime) return
    const beat = () => realtime.emitJamEvent('jam:heartbeat', { tripId })
    beat()
    const id = window.setInterval(beat, HOST_HEARTBEAT_MS)
    return () => window.clearInterval(id)
  }, [tripId, userId, isHost])

  // ---- periodic drift correction (never per-frame) ----
  useEffect(() => {
    if (!tripId) return
    const id = window.setInterval(() => {
      const state = jamStore.getState().jam
      const me = userIdRef.current
      if (
        !state ||
        state.status !== 'ACTIVE' ||
        !state.isPlaying ||
        !state.currentSong ||
        !me ||
        !isJamParticipant(state.participants, me)
      ) {
        return
      }
      const expected = expectedPosition(
        {
          position: state.position,
          positionAt: state.positionAt,
          isPlaying: state.isPlaying,
          duration: state.currentSong.durationSeconds,
          serverSkew: skewRef.current,
        },
        Date.now(),
      )
      const local = musicRef.current.getPlayerPosition()
      const action = driftAction(local, expected)
      if (action === 'hard') {
        const song = lastSongPayloadRef.current ?? toPlayerSong(state)
        musicRef.current.jamSync(song, expected, true)
      }
    }, RESYNC_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [tripId])

  // ---- actions ----
  const createJam = useCallback(async () => {
    const t = tripIdRef.current
    if (!t) return
    try {
      const state = await createTripJam(t)
      applyJamState(state)
      rideController.getSocketRealtime()?.emitJamEvent('jam:heartbeat', { tripId: t })
    } catch (err) {
      jamStore.update({ notice: errorMessage(err, 'Unable to start the Jam.') })
    }
  }, [applyJamState])

  const join = useCallback(async () => {
    const state = jamStore.getState().jam
    if (!state) return
    try {
      const fresh = await apiJoin(state.jamId)
      applyJamState(fresh)
    } catch (err) {
      if (isApiError(err) && err.status === 409) {
        // The Jam vanished while joining — resync with the server truth.
        void refresh()
      } else {
        jamStore.update({ notice: errorMessage(err, 'Unable to join the Jam.') })
      }
    }
  }, [applyJamState, refresh])

  const leave = useCallback(async () => {
    const state = jamStore.getState().jam
    if (!state) return
    try {
      const fresh = await apiLeave(state.jamId)
      // Stop following playback and restore the user's last playing song; the
      // fresh state still updates the participant list for everyone.
      restorePreJam()
      applyJamState(fresh)
    } catch (err) {
      jamStore.update({ notice: errorMessage(err, 'Unable to leave the Jam.') })
    }
  }, [applyJamState, restorePreJam])

  const deleteJam = useCallback(async () => {
    const state = jamStore.getState().jam
    if (!state) return
    try {
      await apiDelete(state.jamId)
      // The broadcast removes every participant; also clean up locally so the
      // Host's own UI closes even if the broadcast is momentarily delayed.
      handleJamDeleted({ jamId: state.jamId, tripId: state.tripId, reason: 'HOST_ENDED' })
    } catch (err) {
      jamStore.update({ notice: errorMessage(err, 'Unable to end the Jam.') })
    }
  }, [handleJamDeleted])

  const control = useCallback(
    async (action: JamControlAction, opts: { songId?: string; position?: number } = {}) => {
      const state = jamStore.getState().jam
      if (!state) return
      const input: JamControlInput = { action }
      if (opts.songId !== undefined) input.songId = opts.songId
      if (opts.position !== undefined) input.position = opts.position
      if (action === 'play' || action === 'pause') {
        input.position = opts.position ?? musicRef.current.getPlayerPosition()
      }
      try {
        const fresh = await apiControl(state.jamId, input)
        applyJamState(fresh)
      } catch (err) {
        jamStore.update({ notice: errorMessage(err, 'Playback control failed.') })
      }
    },
    [applyJamState],
  )

  const seek = useCallback(
    async (position: number) => {
      await control('seek', { position })
    },
    [control],
  )

  return { ui, isHost, isParticipant, createJam, join, leave, deleteJam, control, seek }
}
