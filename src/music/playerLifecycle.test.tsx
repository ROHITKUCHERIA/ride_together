// @vitest-environment jsdom
import { StrictMode } from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MusicPlayerProvider } from './MusicPlayerProvider'

vi.mock('../auth/AuthContext', () => ({
  useAuth: () => ({ status: 'authenticated' }),
}))

// Mirrors the real YouTube IFrame API: creating a player replaces the given
// container element in-place with an <iframe>; destroy() removes that iframe.
class FakePlayer {
  private iframe: HTMLIFrameElement

  constructor(target: string | HTMLElement) {
    this.iframe = document.createElement('iframe')
    if (typeof target !== 'string') target.parentNode?.replaceChild(this.iframe, target)
  }

  destroy(): void {
    this.iframe.remove()
  }

  getPlayerState(): number {
    return 2
  }

  loadVideoById(): void {}
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

function mountPlayer() {
  render(
    <StrictMode>
      <MusicPlayerProvider>
        <div data-testid="child">child</div>
      </MusicPlayerProvider>
    </StrictMode>,
  )
}

function flush() {
  return act(async () => {})
}

describe('MusicPlayerProvider player container ownership', () => {
  beforeEach(() => {
    installFakeYoutube()
  })

  it('mount/unmount cycles under StrictMode never fight React over DOM nodes', async () => {
    for (let i = 0; i < 5; i++) {
      mountPlayer()
      await flush()

      expect(screen.getByTestId('child')).toBeTruthy()
      // The iframe (container swap) must live inside React's wrapper — exactly one.
      expect(document.querySelectorAll('iframe').length).toBe(1)

      cleanup()
      await flush()

      // No iframe or player container may survive React's unmount.
      expect(document.querySelectorAll('iframe').length).toBe(0)
      expect(document.querySelectorAll('div[style*="640px"]').length).toBe(0)
    }
  })
})