// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import PlaylistDrawer from '../PlaylistDrawer'
import PlaylistDetail from './PlaylistDetail'
import AddToPlaylistModal from './AddToPlaylistModal'
import { ApiError } from '../../lib/errors'
import type { Playlist, PlaylistDetail as PlaylistDetailType, PlaylistSongItem } from '../../types/api'

const api = vi.hoisted(() => ({
  listMyPlaylists: vi.fn(),
  listTripPlaylists: vi.fn(),
  getPlaylist: vi.fn(),
  createPlaylist: vi.fn(),
  updatePlaylist: vi.fn(),
  deletePlaylist: vi.fn(),
  addSongToPlaylist: vi.fn(),
  removeSongFromPlaylist: vi.fn(),
  reorderPlaylistSongs: vi.fn(),
}))

const musicApi = vi.hoisted(() => ({
  playSongs: vi.fn(),
  openFullPlayer: vi.fn(),
  addToQueue: vi.fn(),
  togglePlay: vi.fn(),
  play: vi.fn(),
  state: { isPlaying: false },
  current: null,
}))

vi.mock('../../api/playlists', () => api)
vi.mock('../../music/context', () => ({
  useMusicPlayer: () => musicApi,
}))

const myPlaylists: Playlist[] = [
  {
    id: 'pl-1',
    name: 'My Ride Mix',
    description: null,
    isPublic: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    userId: 'u1',
    tripId: null,
    owner: { id: 'u1', name: 'Rohit', avatarUrl: null },
    trip: null,
    songCount: 2,
  },
  {
    id: 'pl-2',
    name: 'Chill Ride',
    description: null,
    isPublic: false,
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    userId: 'u1',
    tripId: null,
    owner: { id: 'u1', name: 'Rohit', avatarUrl: null },
    trip: null,
    songCount: 0,
  },
]

const tripPlaylists: Playlist[] = [
  {
    id: 'pl-3',
    name: 'Goa Road Trip Mix',
    description: null,
    isPublic: true,
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
    userId: 'u2',
    tripId: 'trip-1',
    owner: { id: 'u2', name: 'Mano', avatarUrl: null },
    trip: { id: 'trip-1', name: 'Goa Bike Trip' },
    songCount: 1,
  },
]

const songs: PlaylistSongItem[] = [
  {
    id: 'ps-1',
    playlistId: 'pl-1',
    position: 0,
    songId: 's-1',
    youtubeVideoId: 'vid-1',
    title: 'Safarnama',
    channelTitle: 'Lucky Ali',
    thumbnailUrl: 'thumb-1.jpg',
    durationSeconds: 282,
    addedBy: { id: 'u1', name: 'Rohit' },
    addedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'ps-2',
    playlistId: 'pl-1',
    position: 1,
    songId: 's-2',
    youtubeVideoId: 'vid-2',
    title: 'Ilahi',
    channelTitle: 'Arijit Singh',
    thumbnailUrl: 'thumb-2.jpg',
    durationSeconds: 240,
    addedBy: { id: 'u1', name: 'Rohit' },
    addedAt: '2026-01-01T00:00:00.000Z',
  },
]

const detail: PlaylistDetailType = {
  ...myPlaylists[0],
  songCount: songs.length,
  songs,
}

function installBrowserMocks() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => setTimeout(() => cb(0), 0)) as typeof window.requestAnimationFrame
  window.cancelAnimationFrame = (() => {}) as typeof window.cancelAnimationFrame
  window.confirm = vi.fn(() => true)
}

beforeEach(() => {
  installBrowserMocks()
  vi.clearAllMocks()
  api.listMyPlaylists.mockResolvedValue(myPlaylists)
  api.listTripPlaylists.mockResolvedValue(tripPlaylists)
  api.getPlaylist.mockResolvedValue(detail)
  api.createPlaylist.mockResolvedValue({ ...detail, id: 'pl-new', name: 'New Mix', songs: [], songCount: 0 })
  api.addSongToPlaylist.mockResolvedValue(songs[0])
  api.removeSongFromPlaylist.mockResolvedValue(undefined)
  api.reorderPlaylistSongs.mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
})

describe('PlaylistDrawer', () => {
  it('lists my playlists and trip playlists', async () => {
    render(<PlaylistDrawer open onClose={() => {}} tripId="trip-1" currentUserId="u1" />)

    expect(await screen.findByText('My Ride Mix')).toBeInTheDocument()
    expect(await screen.findByText('Chill Ride')).toBeInTheDocument()
    expect(await screen.findByText('Goa Road Trip Mix')).toBeInTheDocument()
    expect(await screen.findByText(/2 songs · Rohit/)).toBeInTheDocument()
    expect(await screen.findByText(/Goa Bike Trip/)).toBeInTheDocument()
    expect(api.listMyPlaylists).toHaveBeenCalled()
    expect(api.listTripPlaylists).toHaveBeenCalledWith('trip-1')
  })

  it('shows an empty state when there are no playlists', async () => {
    api.listMyPlaylists.mockResolvedValue([])
    api.listTripPlaylists.mockResolvedValue([])
    render(<PlaylistDrawer open onClose={() => {}} tripId="trip-1" currentUserId="u1" />)

    expect(await screen.findByText("You haven't created a playlist yet.")).toBeInTheDocument()
    expect(await screen.findByText('No trip playlists yet.')).toBeInTheDocument()
  })

  it('shows an error state and retries', async () => {
    api.listMyPlaylists.mockRejectedValue(new ApiError(0, 'NETWORK', 'Network down'))
    render(<PlaylistDrawer open onClose={() => {}} tripId="trip-1" currentUserId="u1" />)

    expect(await screen.findByText('Network down')).toBeInTheDocument()
    api.listMyPlaylists.mockResolvedValue(myPlaylists)
    api.listTripPlaylists.mockResolvedValue(tripPlaylists)
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('My Ride Mix')).toBeInTheDocument()
  })

  it('creates a playlist with a trimmed name', async () => {
    render(<PlaylistDrawer open onClose={() => {}} tripId="trip-1" currentUserId="u1" />)
    await screen.findByText('My Ride Mix')

    fireEvent.click(screen.getByRole('button', { name: /create playlist/i }))
    fireEvent.change(screen.getByLabelText(/playlist name/i), {
      target: { value: '  New Mix  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    await waitFor(() => {
      expect(api.createPlaylist).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Mix' }),
      )
    })
    expect(await screen.findByText('New Mix')).toBeInTheDocument()
  })
})

describe('PlaylistDetail', () => {
  it('shows songs with positions and metadata', async () => {
    render(<PlaylistDetail playlistId="pl-1" currentUserId="u1" onBack={() => {}} onDeleted={() => {}} />)

    expect(api.getPlaylist).toHaveBeenCalledWith('pl-1')
    expect(await screen.findByText('Safarnama')).toBeInTheDocument()
    expect(await screen.findByText('Ilahi')).toBeInTheDocument()
    expect(await screen.findByText('2 songs')).toBeInTheDocument()
  })

  it('shows the empty state', async () => {
    api.getPlaylist.mockResolvedValue({ ...detail, songs: [], songCount: 0 })
    render(<PlaylistDetail playlistId="pl-1" currentUserId="u1" onBack={() => {}} onDeleted={() => {}} />)

    expect(await screen.findByText('This playlist is empty.')).toBeInTheDocument()
  })

  it('plays all via the existing music player', async () => {
    render(<PlaylistDetail playlistId="pl-1" currentUserId="u1" onBack={() => {}} onDeleted={() => {}} />)
    await screen.findByText('Safarnama')

    fireEvent.click(screen.getByRole('button', { name: /play all/i }))

    expect(musicApi.playSongs).toHaveBeenCalledTimes(1)
    const args = musicApi.playSongs.mock.calls[0][0]
    expect(args.map((s: { videoId: string }) => s.videoId)).toEqual(['vid-1', 'vid-2'])
    expect(musicApi.openFullPlayer).toHaveBeenCalled()
  })

  it('removes a song and updates the count (owner only)', async () => {
    render(<PlaylistDetail playlistId="pl-1" currentUserId="u1" onBack={() => {}} onDeleted={() => {}} />)
    await screen.findByText('Safarnama')

    const row = screen.getByText('Safarnama').closest('li') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: /remove safarnama/i }))

    await waitFor(() => {
      expect(api.removeSongFromPlaylist).toHaveBeenCalledWith('pl-1', 's-1')
    })
    await waitFor(() => {
      expect(screen.queryByText('Safarnama')).not.toBeInTheDocument()
    })
  })

  it('hides remove/reorder controls for non-owners', async () => {
    render(<PlaylistDetail playlistId="pl-1" currentUserId="u-other" onBack={() => {}} onDeleted={() => {}} />)
    await screen.findByText('Safarnama')

    expect(screen.queryByRole('button', { name: /remove safarnama/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /delete playlist/i })).not.toBeInTheDocument()
  })

  it('reorders songs by sending the new full order', async () => {
    render(<PlaylistDetail playlistId="pl-1" currentUserId="u1" onBack={() => {}} onDeleted={() => {}} />)
    await screen.findByText('Safarnama')

    const firstRow = screen.getByText('Safarnama').closest('li') as HTMLElement
    fireEvent.click(within(firstRow).getByRole('button', { name: /move safarnama down/i }))

    await waitFor(() => {
      expect(api.reorderPlaylistSongs).toHaveBeenCalledWith('pl-1', ['s-2', 's-1'])
    })
  })

  it('handles a deleted playlist (404)', async () => {
    api.getPlaylist.mockRejectedValue(new ApiError(404, 'PLAYLIST_NOT_FOUND', 'not found'))
    render(<PlaylistDetail playlistId="pl-missing" currentUserId="u1" onBack={() => {}} onDeleted={() => {}} />)

    expect(await screen.findByText('This playlist no longer exists.')).toBeInTheDocument()
  })
})

describe('AddToPlaylistModal', () => {
  beforeEach(() => {
    api.listMyPlaylists.mockResolvedValue(myPlaylists)
    api.listTripPlaylists.mockResolvedValue(tripPlaylists)
  })

  it('marks a playlist that already contains the song as "Already in playlist"', async () => {
    api.getPlaylist.mockImplementation(async (id: string) =>
      id === 'pl-1'
        ? { ...detail, songs }
        : { ...detail, id, songs: [], songCount: 0 },
    )

    render(
      <AddToPlaylistModal open onClose={() => {}} songId="s-1" songTitle="Safarnama" tripId="trip-1" />,
    )

    expect(await screen.findByText('Already in playlist')).toBeInTheDocument()
    expect(screen.getByText('My Ride Mix')).toBeInTheDocument()
  })

  it('adds a song to a playlist and shows confirmation', async () => {
    api.getPlaylist.mockImplementation(async (id: string) =>
      id === 'pl-1'
        ? { ...detail, songs: [{ ...songs[0], songId: 's-other' }] }
        : { ...detail, id, songs: [], songCount: 0 },
    )

    render(
      <AddToPlaylistModal open onClose={() => {}} songId="s-1" songTitle="Safarnama" tripId="trip-1" />,
    )
    await screen.findByText('My Ride Mix')

    const row = screen.getByText('Chill Ride').closest('li') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: /add to chill ride/i }))

    await waitFor(() => {
      expect(api.addSongToPlaylist).toHaveBeenCalledWith('pl-2', 's-1')
    })
    expect(await screen.findByText(/Added to Chill Ride/)).toBeInTheDocument()
  })

  it('handles a duplicate add gracefully', async () => {
    api.getPlaylist.mockImplementation(async (id: string) => ({
      ...detail,
      id,
      songs: [],
      songCount: 0,
    }))
    api.addSongToPlaylist.mockRejectedValue(
      new ApiError(409, 'SONG_ALREADY_IN_PLAYLIST', 'dup'),
    )

    render(
      <AddToPlaylistModal open onClose={() => {}} songId="s-1" songTitle="Safarnama" tripId="trip-1" />,
    )
    await screen.findByText('My Ride Mix')

    const row = screen.getByText('My Ride Mix').closest('li') as HTMLElement
    fireEvent.click(within(row).getByRole('button', { name: /add to my ride mix/i }))

    expect(await screen.findByText(/already has this song/i)).toBeInTheDocument()
    expect(await screen.findByText('Already in playlist')).toBeInTheDocument()
  })
})