// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MusicPlayerProvider } from './MusicPlayerProvider'
import { useMusicPlayer } from './context'
import type { MusicPlayerContextValue } from './context'

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ status: 'authenticated' }),
}))

let capturedEvents: YTPlayerEvents | null = null
const volumeCalls: number[] = []
const unmuteCalls: number[] = []
const muteCalls: number[] = []

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

  setVolume(v: number): void {
    volumeCalls.push(v)
  }

  mute(): void {
    muteCalls.push(1)
  }

  unMute(): void {
    unmuteCalls.push(1)
  }

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

describe('Jam playback volume', () => {
  it('defaults to full (device) volume and keeps it while a Jam owns the player', async () => {
    installFakeYoutube()
    volumeCalls.length = 0
    unmuteCalls.length = 0
    muteCalls.length = 0

    await bootPlayer()
    expect(probe?.state.ready).toBe(true)
    // On ready, no saved volume in localStorage → full device volume (100).
    expect(volumeCalls[0]).toBe(100)

    // A low saved setting must not starve the Jam: joining forces the player
    // to 100 and unmutes it, so every rider hears the shared music at the same
    // loudness and hardware volume keys control playback directly.
    await act(async () => {
      probe?.setVolume(20)
      probe?.toggleMute()
    })
    expect(probe?.state.volume).toBe(20)
    expect(probe?.state.muted).toBe(true)
    expect(muteCalls.length).toBeGreaterThan(0)

    await act(async () => {
      probe?.jamSync(
        { id: 's1', videoId: 'v1', title: 'T', artist: 'A', thumbnailUrl: null, duration: 100 },
        0,
        true,
      )
    })
    expect(probe?.state.jamMode).toBe(true)
    expect(volumeCalls[volumeCalls.length - 1]).toBe(100)
    expect(unmuteCalls.length).toBeGreaterThan(0)

    // Leaving the Jam restores the rider's own saved volume/mute.
    await act(async () => {
      probe?.jamEnd()
    })
    expect(probe?.state.jamMode).toBe(false)
    expect(volumeCalls[volumeCalls.length - 1]).toBe(20)
    expect(muteCalls.length).toBeGreaterThan(0)
  })
})