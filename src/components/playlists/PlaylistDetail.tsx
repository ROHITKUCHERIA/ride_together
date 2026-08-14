import { useCallback, useEffect, useState } from 'react'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Clock,
  ListMusic,
  ListPlus,
  Lock,
  Music2,
  Pause,
  Play,
  PlayCircle,
  Trash2,
  User,
} from 'lucide-react'
import Button from '../ui/Button'
import Spinner from '../ui/Spinner'
import EmptyState from '../ui/EmptyState'
import ErrorState from '../ui/ErrorState'
import {
  deletePlaylist,
  getPlaylist,
  removeSongFromPlaylist,
  reorderPlaylistSongs,
} from '../../api/playlists'
import { isApiError } from '../../lib/errors'
import { useMusicPlayer } from '../../music/context'
import { playlistSongToPlayerSong } from '../../music/mappers'
import type { PlaylistDetail, PlaylistSongItem } from '../../types/api'

interface PlaylistDetailProps {
  playlistId: string
  currentUserId?: string
  onBack: () => void
  onDeleted: () => void
  onChanged?: () => void
}

function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

/**
 * Playlist detail: songs, Play All, add-to-queue, and (owner only) reorder /
 * remove / delete. All playback goes through the existing MusicPlayerProvider.
 */
export default function PlaylistDetail({
  playlistId,
  currentUserId,
  onBack,
  onDeleted,
  onChanged,
}: PlaylistDetailProps) {
  const music = useMusicPlayer()

  const [playlist, setPlaylist] = useState<PlaylistDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setPlaylist(await getPlaylist(playlistId))
    } catch (err) {
      if (isApiError(err) && err.status === 404) {
        setError('This playlist no longer exists.')
      } else {
        setError(isApiError(err) ? err.message : 'Unable to load this playlist.')
      }
    } finally {
      setLoading(false)
    }
  }, [playlistId])

  useEffect(() => {
    void load()
  }, [load])

  const isOwner = playlist ? playlist.userId === currentUserId : false

  const handlePlayAll = () => {
    if (!playlist || playlist.songs.length === 0) return
    music.playSongs(playlist.songs.map(playlistSongToPlayerSong), 0)
    music.openFullPlayer()
  }

  const handleRemove = async (song: PlaylistSongItem) => {
    if (!playlist) return
    setActionError(null)
    setRemoving(song.songId)
    try {
      await removeSongFromPlaylist(playlist.id, song.songId)
      setPlaylist((prev) =>
        prev
          ? { ...prev, songs: prev.songs.filter((s) => s.songId !== song.songId), songCount: prev.songCount - 1 }
          : prev,
      )
      onChanged?.()
    } catch (err) {
      setActionError(isApiError(err) ? err.message : 'Unable to remove this song.')
    } finally {
      setRemoving(null)
    }
  }

  const handleMove = async (index: number, direction: -1 | 1) => {
    if (!playlist) return
    const target = index + direction
    if (target < 0 || target >= playlist.songs.length) return
    setActionError(null)
    setMoving(true)
    try {
      const next = [...playlist.songs]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      const songIds = next.map((s) => s.songId)
      await reorderPlaylistSongs(playlist.id, songIds)
      setPlaylist((prev) =>
        prev
          ? {
              ...prev,
              songs: next.map((s, i) => ({ ...s, position: i })),
            }
          : prev,
      )
      onChanged?.()
    } catch (err) {
      setActionError(isApiError(err) ? err.message : 'Unable to reorder the playlist.')
    } finally {
      setMoving(false)
    }
  }

  const handleDelete = async () => {
    if (!playlist) return
    if (!window.confirm(`Delete “${playlist.name}”? This cannot be undone.`)) return
    setActionError(null)
    setDeleting(true)
    try {
      await deletePlaylist(playlist.id)
      onDeleted()
    } catch (err) {
      setActionError(isApiError(err) ? err.message : 'Unable to delete this playlist.')
      setDeleting(false)
    }
  }

  if (loading) return <Spinner label="Loading playlist…" />

  if (error || !playlist) {
    return (
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} className="self-start">
          <ArrowLeft size={14} aria-hidden="true" /> Back to playlists
        </Button>
        <ErrorState message={error ?? 'This playlist is unavailable.'} onRetry={() => void load()} />
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-mist transition hover:bg-white/10 hover:text-bone focus-visible:outline-2 focus-visible:outline-ember"
      >
        <ArrowLeft size={13} aria-hidden="true" /> Back to playlists
      </button>

      <div className="mb-4">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-mist/70">
          {playlist.trip ? playlist.trip.name : 'Personal playlist'}
        </p>
        <div className="flex items-center gap-2">
          <h3 className="font-display text-xl font-bold text-bone">{playlist.name}</h3>
          <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-mist/70">
            {playlist.isPublic ? 'Public' : <Lock size={10} aria-hidden="true" />}
            {!playlist.isPublic ? 'Private' : ''}
          </span>
        </div>
        {playlist.description ? (
          <p className="mt-1 text-sm text-mist/70">{playlist.description}</p>
        ) : null}
        <p className="mt-1.5 flex items-center gap-2 text-[11px] text-mist/60">
          <span className="inline-flex items-center gap-1">
            <User size={10} aria-hidden="true" /> by {playlist.owner.name}
          </span>
          <span>·</span>
          <span>{playlist.songCount} songs</span>
        </p>
      </div>

      {actionError ? (
        <p role="alert" className="mb-3 rounded-xl border border-road/35 bg-road/10 px-3.5 py-2.5 text-sm text-road">
          {actionError}
        </p>
      ) : null}

      {playlist.songs.length > 0 ? (
        <Button variant="ember" block onClick={handlePlayAll} className="mb-5">
          <PlayCircle size={15} aria-hidden="true" /> Play All
        </Button>
      ) : null}

      {playlist.songs.length === 0 ? (
        <EmptyState
          icon={<ListMusic size={22} />}
          title="This playlist is empty."
          description="Add songs from the Trip Music library to start building this playlist."
        />
      ) : (
        <ul className="space-y-2">
          {playlist.songs.map((item, index) => {
            const duration = formatDuration(item.durationSeconds)
            const isCurrentSong = music.current?.song.videoId === item.youtubeVideoId
            return (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5"
              >
                <span className="w-4 shrink-0 text-center text-[11px] font-semibold text-mist/50">
                  {index + 1}
                </span>
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="size-10 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
                  />
                ) : (
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/5 text-mist/50 ring-1 ring-white/10">
                    <Music2 size={14} aria-hidden="true" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-bone">{item.title}</p>
                  <p className="flex items-center gap-2 truncate text-[11px] text-mist/70">
                    <span className="truncate">{item.channelTitle}</span>
                    {duration ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-mist/50">
                        <Clock size={10} aria-hidden="true" /> {duration}
                      </span>
                    ) : null}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={isCurrentSong ? 'outline' : 'ember'}
                  onClick={() => {
                    music.playSongs(
                      playlist.songs.map(playlistSongToPlayerSong),
                      index,
                    )
                    music.openFullPlayer()
                  }}
                  aria-label={`Play ${item.title}`}
                  title="Play"
                >
                  {isCurrentSong && music.state.isPlaying ? (
                    <Pause size={13} aria-hidden="true" />
                  ) : (
                    <Play size={13} aria-hidden="true" />
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => music.addToQueue(playlistSongToPlayerSong(item))}
                  aria-label={`Add ${item.title} to the queue`}
                  title="Add to queue"
                >
                  <ListPlus size={13} aria-hidden="true" />
                </Button>
                {isOwner ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={moving || index === 0}
                      onClick={() => void handleMove(index, -1)}
                      aria-label={`Move ${item.title} up`}
                      title="Move up"
                    >
                      <ArrowUp size={13} aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={moving || index === playlist.songs.length - 1}
                      onClick={() => void handleMove(index, 1)}
                      aria-label={`Move ${item.title} down`}
                      title="Move down"
                    >
                      <ArrowDown size={13} aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      loading={removing === item.songId}
                      disabled={removing !== null}
                      onClick={() => void handleRemove(item)}
                      aria-label={`Remove ${item.title}`}
                      title="Remove"
                    >
                      <Trash2 size={13} aria-hidden="true" />
                    </Button>
                  </>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}

      {isOwner ? (
        <div className="mt-8 border-t border-white/8 pt-4">
          <Button variant="danger" size="sm" loading={deleting} onClick={() => void handleDelete()}>
            <Trash2 size={13} aria-hidden="true" /> Delete Playlist
          </Button>
        </div>
      ) : null}
    </div>
  )
}