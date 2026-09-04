// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MusicPlayerProvider } from './MusicPlayerProvider'
import { useMusicPlayer } from './context'
import type { JamHostTransport, MusicPlayerContextValue } from './context'
import type { PlayerSong } from './playerState'

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ status: 'authenticated' }),
}))

let capturedEvents: YTPlayerEvents | null = null

class FakePlayer {
  private iframe: HTMLIFrameElement

  constructor(target: string | HTMLElement, opts?: YTPlayerOptions) {
    capturedEvents = opts?.events ?? null
    this.iframe = document.createElement('iframe')
    if (typeof target !== 'string') target.parentNode?.replaceChild(this.iframe, target)
  }

  destroy(): void {
    this.iframe.remove()
  }

  getPlayerState(): number {
    return 2
  }

  loadVideoById(): Promise<void> {
    return Promise.resolve()
  }

  cueVideoById(): void {}
  playVideo(): void {}
  pauseVideo(): void {}
  seekTo(): void {}
  getCurrentTime(): number {
    return 0
  }

  getDuration(): number {
    return 0
  }

  setVolume(): void {}
  mute(): void {}
  unMute(): void {}
  isMuted(): boolean {
    return false
  }
}

function installFakeYoutube(): void {
  window.YT = {
    Player: FakePlayer,
    PlayerState: { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 },
  }
}

let probe: MusicPlayerContextValue | null = null
function Probe() {
  probe = useMusicPlayer()
  return null
}

async function bootPlayer() {
  render(
    <MusicPlayerProvider>
      <Probe />
    </MusicPlayerProvider>,
  )
  await act(async () => {})
  await act(async () => {
    capturedEvents?.onReady?.({ target: undefined as never })
  })
}

const songA: PlayerSong = { id: 'library-a', videoId: 'vA', title: 'A', artist: 'Aa', thumbnailUrl: null }
const songB: PlayerSong = { id: 'library-b', videoId: 'vB', title: 'B', artist: 'Bb', thumbnailUrl: null }

describe('Jam Host transport delegation', () => {
  it('routes Host transport actions to the Jam instead of the local player', async () => {
    installFakeYoutube()
    // Clean state for a normal (non-Jam) playback check first.
    await bootPlayer()

    // Outside a Jam: local playback works as usual.
    await act(async () => {
      probe?.play(songA)
    })
    expect(probe?.current?.song.videoId).toBe('vA')

    // A Jam takes over the player (this user is the Host).
    await act(async () => {
      probe?.jamSync(songA, 0, true)
    })
    expect(probe?.state.jamMode).toBe(true)

    // Register the Jam transport: every local action must now delegate.
    const calls: string[] = []
    const transport: JamHostTransport = {
      playSong: (song) => calls.push(`play:${song.id}`),
      togglePlay: () => calls.push('toggle'),
      next: () => calls.push('next'),
      prev: () => calls.push('prev'),
      seek: (s) => calls.push(`seek:${Math.round(s)}`),
    }
    await act(async () => {
      probe?.setJamHostTransport(transport)
    })

    await act(async () => {
      probe?.play(songB)
      probe?.togglePlay()
      probe?.next()
      probe?.prev()
      probe?.seek(42)
    })

    expect(calls).toEqual(['play:library-b', 'toggle', 'next', 'prev', 'seek:42'])
    // The local player state was NOT touched by the delegated actions.
    expect(probe?.current?.song.videoId).toBe('vA')
    expect(probe?.state.currentTime).toBe(0)

    // playSongs/playIndex also delegate (playlists / full-player queue taps).
    calls.length = 0
    await act(async () => {
      probe?.playSongs([songA, songB], 1)
      probe?.playIndex(0)
    })
    expect(calls).toEqual(['play:library-b', 'play:library-a'])

    // Removing the transport restores the Jam lock: actions are inert, not local.
    calls.length = 0
    await act(async () => {
      probe?.setJamHostTransport(null)
      probe?.play(songB)
      probe?.seek(10)
    })
    expect(calls).toEqual([])
    expect(probe?.current?.song.videoId).toBe('vA')
  })
})