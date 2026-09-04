// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TripJamPanel from './TripJamPanel'
import type { TripJamApi } from '../jam/useTripJam'

vi.mock('../music/context', () => ({
  useMusicPlayer: () => ({
    state: {
      currentTime: 42,
      duration: 182,
      isPlaying: true,
      loading: false,
      jamMode: true,
      needsPlayPrompt: false,
    },
    current: {
      key: 'song-1:1',
      song: {
        id: 'song-1',
        videoId: 'vid-1',
        title: 'Sniper',
        artist: 'Speed Records',
        thumbnailUrl: null,
        duration: 182,
      },
    },
    resumePlay: vi.fn(),
  }),
}))

function makeJam(seek: (position: number) => Promise<void>): TripJamApi {
  return {
    ui: {
      phase: 'active',
      jam: {
        jamId: 'jam-1',
        tripId: 'trip-1',
        hostId: 'user-host',
        hostName: 'HF Deluxe',
        status: 'ACTIVE',
        isPlaying: true,
        position: 42,
        positionAt: Date.now(),
        stateVersion: 3,
        hostOnline: true,
        currentSong: {
          songId: 'song-1',
          youtubeVideoId: 'vid-1',
          title: 'Sniper',
          channelTitle: 'Speed Records',
          thumbnailUrl: null,
          durationSeconds: 182,
        },
        participants: [
          { userId: 'user-host', name: 'HF Deluxe', avatarUrl: null, joinedAt: new Date().toISOString() },
        ],
        serverTime: Date.now(),
      },
      connection: 'connected',
      syncing: false,
      skew: 0,
      notice: null,
      endedMessage: null,
      error: null,
    },
    isHost: true,
    isParticipant: true,
    createJam: () => Promise.resolve(),
    join: () => Promise.resolve(),
    leave: () => Promise.resolve(),
    deleteJam: () => Promise.resolve(),
    control: () => Promise.resolve(),
    seek,
  }
}

describe('TripJamPanel host seek bar', () => {
  afterEach(() => {
    cleanup()
  })

  beforeEach(() => {
    // jsdom has no pointer capture; the seek bar calls it when a drag starts.
    if (!window.HTMLElement.prototype.setPointerCapture) {
      window.HTMLElement.prototype.setPointerCapture = () => {}
    }
  })

  it('releases the drag preview on commit so live progress resumes', () => {
    const seek = vi.fn(() => Promise.resolve())
    render(<TripJamPanel jam={makeJam(seek)} />)

    // Live position is shown before any interaction.
    expect(screen.getByText('0:42')).toBeTruthy()

    const slider = screen.getByRole('slider', { name: 'Seek the Jam playback' })
    // jsdom reports a zero-size track, so any positive clientX drags to the end.
    fireEvent.pointerDown(slider, { clientX: 200, pointerId: 1 })
    // The drag preview shadows the live time while dragging.
    expect(screen.queryByText('0:42')).toBeNull()

    fireEvent.pointerUp(slider, { clientX: 200, pointerId: 1 })
    expect(seek).toHaveBeenCalledTimes(1)
    // The preview is released: the live position is shown again instead of
    // staying frozen at the dragged value.
    expect(screen.getByText('0:42')).toBeTruthy()
  })

  it('drops the drag preview when the Jam moves to another song', () => {    const seek = vi.fn(() => Promise.resolve())
    const jam = makeJam(seek)
    const { rerender } = render(<TripJamPanel jam={jam} />)

    const slider = screen.getByRole('slider', { name: 'Seek the Jam playback' })
    fireEvent.pointerDown(slider, { clientX: 200, pointerId: 1 })
    expect(screen.queryByText('0:42')).toBeNull()

    // The Host presses next while the stale preview exists: the new song's
    // live position must take over, not the old drag value.
    const nextJam = {
      ...jam.ui.jam!,
      currentSong: { ...jam.ui.jam!.currentSong!, songId: 'song-2', youtubeVideoId: 'vid-2' },
    }
    rerender(<TripJamPanel jam={{ ...jam, ui: { ...jam.ui, jam: nextJam } }} />)
    expect(screen.getByText('0:42')).toBeTruthy()
  })

  it('shows a compact end-Jam confirm below the buttons, not beside them', () => {
    const deleteJam = vi.fn(() => Promise.resolve())
    const jam = { ...makeJam(() => Promise.resolve()), deleteJam }
    const { container } = render(<TripJamPanel jam={jam} />)

    // Tapping End Jam swaps the button for a compact confirm block.
    fireEvent.click(screen.getByRole('button', { name: 'End the Jam' }))
    expect(screen.getByText('End the Jam for everyone?')).toBeTruthy()
    // The long description copy is gone and the End button left the row.
    expect(screen.queryByText(/remove all participants/i)).toBeNull()
    expect(screen.queryByRole('button', { name: 'End the Jam' })).toBeNull()

    // The confirm block sits outside/below the actions row.
    const actions = container.querySelector('.mt-4.flex')
    const confirm = screen.getByText('End the Jam for everyone?').closest('div')
    expect(actions).toBeTruthy()
    expect(confirm).toBeTruthy()
    expect(actions!.contains(confirm!)).toBe(false)

    // Cancel dismisses it; End confirms and dismisses it.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByText('End the Jam for everyone?')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'End the Jam' }))
    fireEvent.click(screen.getByRole('button', { name: 'End Jam' }))
    expect(deleteJam).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('End the Jam for everyone?')).toBeNull()
  })
})
