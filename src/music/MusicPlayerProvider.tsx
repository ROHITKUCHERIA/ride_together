import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '../auth/AuthContext'
import { MusicPlayerContext } from './context'
import type { MusicPlayerContextValue } from './context'
import { currentItem, initialMusicState } from './playerState'
import { musicReducer } from './playerState'
import type { PlayerSong } from './playerState'
import { loadYouTubeIframeApi, resolveAutoplayState, ytErrorToMessage } from './youtube'

const VOLUME_KEY = 'rt.music.volume'
const MUTE_KEY = 'rt.music.muted'
const AUTOPLAY_GRACE_MS = 2_500
const PROGRESS_INTERVAL_MS = 500

function makeInitialState(): ReturnType<typeof initialMusicState> {
  let volume = 80
  let muted = false
  try {
    const saved = Number(window.localStorage.getItem(VOLUME_KEY))
    if (Number.isFinite(saved) && saved >= 0 && saved <= 100) volume = saved
    muted = window.localStorage.getItem(MUTE_KEY) === '1'
  } catch {
    // localStorage is unavailable (private mode etc.) — use defaults.
  }
  return initialMusicState(volume, muted)
}

/**
 * Owns the single application-wide YouTube iframe player and exposes a
 * declarative API to the rest of the app. It lives at the app root so
 * playback continues across route changes; the iframe is created exactly once
 * and destroyed on unmount.
 */
export function MusicPlayerProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(musicReducer, undefined, makeInitialState)

  const { status: authStatus } = useAuth()

  const playerElRef = useRef<HTMLDivElement | null>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const loadedVideoIdRef = useRef<string | null>(null)
  const autoplayTimerRef = useRef<number | null>(null)
  const progressTimerRef = useRef<number | null>(null)
  const seekHandledRef = useRef(state.seekNonce)
  const replayHandledRef = useRef(state.replayNonce)
  const retryHandledRef = useRef(state.retryNonce)

  const stateRef = useRef(state)
  stateRef.current = state

  const clearAutoplayTimer = useCallback(() => {
    if (autoplayTimerRef.current !== null) {
      window.clearTimeout(autoplayTimerRef.current)
      autoplayTimerRef.current = null
    }
  }, [])

  const markAutoplayBlocked = useCallback(() => {
    dispatch({ type: 'SET_AUTOPLAY_BLOCKED', blocked: true })
    dispatch({ type: 'SET_PLAYING', playing: false })
  }, [])

  const checkAutoplay = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    const resolution = resolveAutoplayState(player.getPlayerState())
    if (resolution === 'playing') {
      clearAutoplayTimer()
      return
    }
    if (resolution === 'buffering') {
      autoplayTimerRef.current = window.setTimeout(checkAutoplay, AUTOPLAY_GRACE_MS)
      return
    }
    markAutoplayBlocked()
  }, [clearAutoplayTimer, markAutoplayBlocked])

  const scheduleAutoplayCheck = useCallback(() => {
    clearAutoplayTimer()
    autoplayTimerRef.current = window.setTimeout(checkAutoplay, AUTOPLAY_GRACE_MS)
  }, [checkAutoplay, clearAutoplayTimer])

  const attemptPlay = useCallback(() => {
    const player = playerRef.current
    if (!player) return
    const result = player.playVideo()
    // Rejections are surfaced by the autoplay grace timer — do not mark the
    // video as blocked merely because playVideo() was called early.
    if (result && typeof result.catch === 'function') {
      result.catch(() => {
        // no-op: the scheduled check decides whether autoplay is blocked
      })
    }
  }, [])

  const loadAndPlay = useCallback(
    (videoId: string) => {
      const player = playerRef.current
      if (!player) return
      loadedVideoIdRef.current = videoId
      dispatch({ type: 'SET_LOADING', loading: true })
      dispatch({ type: 'SET_ERROR', error: null })
      dispatch({ type: 'SET_AUTOPLAY_BLOCKED', blocked: false })
      const loaded = player.loadVideoById({ videoId, startSeconds: 0 })
      if (loaded && typeof loaded.catch === 'function') {
        loaded.catch(() => {
          loadedVideoIdRef.current = null
        })
      }
      attemptPlay()
      scheduleAutoplayCheck()
    },
    [attemptPlay, scheduleAutoplayCheck],
  )

  // Create the single player instance on mount; destroy it on unmount.
  useEffect(() => {
    let cancelled = false
    loadYouTubeIframeApi()
      .then((yt) => {
        if (cancelled) return
        const el = playerElRef.current
        if (!el) return
        const player = new yt.Player(el, {
          height: 360,
          width: 640,
          playerVars: {
            playsinline: 1,
            rel: 0,
            controls: 0,
            disablekb: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              const ytPlayer = playerRef.current
              if (ytPlayer) {
                ytPlayer.setVolume(stateRef.current.volume)
                if (stateRef.current.muted) ytPlayer.mute()
              }
              dispatch({ type: 'SET_READY', ready: true })
            },
            onStateChange: (event) => {
              switch (event.data) {
                case yt.PlayerState.PLAYING:
                  clearAutoplayTimer()
                  dispatch({ type: 'SET_LOADING', loading: false })
                  dispatch({ type: 'SET_AUTOPLAY_BLOCKED', blocked: false })
                  dispatch({ type: 'SET_PLAYING', playing: true })
                  break
                case yt.PlayerState.PAUSED:
                  dispatch({ type: 'SET_LOADING', loading: false })
                  dispatch({ type: 'SET_PLAYING', playing: false })
                  break
                case yt.PlayerState.BUFFERING:
                  dispatch({ type: 'SET_LOADING', loading: true })
                  break
                case yt.PlayerState.ENDED:
                  clearAutoplayTimer()
                  dispatch({ type: 'SONG_ENDED' })
                  break
                default:
                  break
              }
            },
            onError: (event) => {
              loadedVideoIdRef.current = null
              clearAutoplayTimer()
              dispatch({ type: 'SET_ERROR', error: ytErrorToMessage(event.data) })
            },
            onPlaybackQualityChange: () => {
              // Quality is managed automatically by YouTube — nothing to do.
            },
          },
        })
        playerRef.current = player
      })
      .catch(() => {
        if (cancelled) return
        dispatch({ type: 'SET_ERROR', error: 'YouTube playback is unavailable right now.' })
      })

    return () => {
      cancelled = true
      if (autoplayTimerRef.current !== null) window.clearTimeout(autoplayTimerRef.current)
      if (progressTimerRef.current !== null) window.clearInterval(progressTimerRef.current)
      try {
        playerRef.current?.destroy()
      } catch {
        // Player may have already been torn down.
      }
      playerRef.current = null
      loadedVideoIdRef.current = null
    }
  }, [clearAutoplayTimer])

  const currentVideoId = currentItem(state)?.song.videoId ?? null

  // Load the right video whenever the current song, readiness or retry changes.
  useEffect(() => {
    if (!state.ready) return
    if (!currentVideoId) {
      playerRef.current?.pauseVideo()
      return
    }
    if (state.retryNonce !== retryHandledRef.current) {
      retryHandledRef.current = state.retryNonce
      loadAndPlay(currentVideoId)
      return
    }
    if (currentVideoId !== loadedVideoIdRef.current) {
      loadAndPlay(currentVideoId)
    }
  }, [state.ready, currentVideoId, state.retryNonce, loadAndPlay])

  // Drive play/pause from state changes.
  useEffect(() => {
    if (!state.ready || !currentVideoId) return
    const player = playerRef.current
    if (!player) return
    if (state.isPlaying) {
      attemptPlay()
      scheduleAutoplayCheck()
    } else {
      player.pauseVideo()
      clearAutoplayTimer()
    }
  }, [state.ready, currentVideoId, state.isPlaying, attemptPlay, scheduleAutoplayCheck, clearAutoplayTimer])

  // Replay the same video (prev/next wrap on a single-song queue).
  useEffect(() => {
    if (!state.ready || !currentVideoId) return
    if (state.replayNonce === replayHandledRef.current) return
    replayHandledRef.current = state.replayNonce
    if (currentVideoId !== loadedVideoIdRef.current) return
    const player = playerRef.current
    if (!player) return
    player.seekTo(0, true)
    if (state.isPlaying) attemptPlay()
  }, [state.ready, currentVideoId, state.replayNonce, state.isPlaying, attemptPlay])

  // Seek requests.
  useEffect(() => {
    if (!state.ready || !currentVideoId) return
    if (state.seekNonce === seekHandledRef.current) return
    seekHandledRef.current = state.seekNonce
    playerRef.current?.seekTo(state.currentTime, true)
  }, [state.ready, currentVideoId, state.seekNonce, state.currentTime])

  // Volume / mute.
  useEffect(() => {
    const player = playerRef.current
    if (!player || !state.ready) return
    player.setVolume(state.volume)
    if (state.muted) player.mute()
    else player.unMute()
  }, [state.ready, state.volume, state.muted])

  // Progress polling while playing.
  useEffect(() => {
    if (!state.ready || !currentVideoId || !state.isPlaying) return
    progressTimerRef.current = window.setInterval(() => {
      const player = playerRef.current
      if (!player) return
      dispatch({ type: 'SET_TIME', seconds: player.getCurrentTime() })
      const duration = player.getDuration()
      if (duration > 0) dispatch({ type: 'SET_DURATION', seconds: duration })
    }, PROGRESS_INTERVAL_MS)
    return () => {
      if (progressTimerRef.current !== null) {
        window.clearInterval(progressTimerRef.current)
        progressTimerRef.current = null
      }
    }
  }, [state.ready, currentVideoId, state.isPlaying])

  // Persist volume/mute.
  useEffect(() => {
    try {
      window.localStorage.setItem(VOLUME_KEY, String(state.volume))
    } catch {
      // ignore
    }
  }, [state.volume])

  useEffect(() => {
    try {
      window.localStorage.setItem(MUTE_KEY, state.muted ? '1' : '0')
    } catch {
      // ignore
    }
  }, [state.muted])

  // Pause music when leaving the authenticated area.
  useEffect(() => {
    if (authStatus !== 'authenticated') {
      dispatch({ type: 'SET_PLAYING', playing: false })
      dispatch({ type: 'CLOSE_FULL' })
    }
  }, [authStatus])

  const playSongs = useCallback((items: PlayerSong[], startIndex = 0) => {
    dispatch({ type: 'PLAY_SONGS', items, startIndex })
  }, [])

  const play = useCallback((song: PlayerSong) => {
    dispatch({ type: 'PLAY_SONGS', items: [song], startIndex: 0 })
  }, [])

  const playIndex = useCallback((index: number) => {
    dispatch({ type: 'PLAY_AT', index })
  }, [])

  const togglePlay = useCallback(() => {
    dispatch({ type: 'TOGGLE_PLAY' })
  }, [])

  const next = useCallback(() => {
    dispatch({ type: 'NEXT' })
  }, [])

  const prev = useCallback(() => {
    dispatch({ type: 'PREV' })
  }, [])

  const seek = useCallback((seconds: number) => {
    dispatch({ type: 'SEEK', seconds })
  }, [])

  const setVolume = useCallback((volume: number) => {
    dispatch({ type: 'SET_VOLUME', volume })
  }, [])

  const toggleMute = useCallback(() => {
    dispatch({ type: 'TOGGLE_MUTE' })
  }, [])

  const addToQueue = useCallback((song: PlayerSong) => {
    dispatch({ type: 'ADD_TO_QUEUE', song })
  }, [])

  const playSongNext = useCallback((song: PlayerSong) => {
    dispatch({ type: 'INSERT_NEXT', song })
  }, [])

  const removeFromQueue = useCallback((key: string) => {
    dispatch({ type: 'REMOVE_FROM_QUEUE', key })
  }, [])

  const clearQueue = useCallback(() => {
    dispatch({ type: 'CLEAR_QUEUE' })
  }, [])

  const retryCurrent = useCallback(() => {
    dispatch({ type: 'RETRY_CURRENT' })
  }, [])

  const resumePlay = useCallback(() => {
    dispatch({ type: 'RESUME_PLAY' })
  }, [])

  const openFullPlayer = useCallback(() => {
    dispatch({ type: 'OPEN_FULL' })
  }, [])

  const closeFullPlayer = useCallback(() => {
    dispatch({ type: 'CLOSE_FULL' })
  }, [])

  const value = useMemo<MusicPlayerContextValue>(
    () => ({
      state,
      current: currentItem(state),
      playSongs,
      play,
      playIndex,
      togglePlay,
      next,
      prev,
      seek,
      setVolume,
      toggleMute,
      addToQueue,
      playSongNext,
      removeFromQueue,
      clearQueue,
      retryCurrent,
      resumePlay,
      openFullPlayer,
      closeFullPlayer,
    }),
    [
      state,
      playSongs,
      play,
      playIndex,
      togglePlay,
      next,
      prev,
      seek,
      setVolume,
      toggleMute,
      addToQueue,
      playSongNext,
      removeFromQueue,
      clearQueue,
      retryCurrent,
      resumePlay,
      openFullPlayer,
      closeFullPlayer,
    ],
  )

  return (
    <MusicPlayerContext.Provider value={value}>
      {children}
      <div
        aria-hidden="true"
        ref={playerElRef}
        style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: 640, height: 360, pointerEvents: 'none' }}
      />
    </MusicPlayerContext.Provider>
  )
}