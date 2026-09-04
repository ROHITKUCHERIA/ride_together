import { useCallback, useEffect, useState } from 'react'
import { Check, ListMusic, Lock, Plus } from 'lucide-react'
import Modal from '../ui/Modal'
import Button from '../ui/Button'
import Spinner from '../ui/Spinner'
import ErrorState from '../ui/ErrorState'
import {
  addSongToPlaylist,
  createPlaylist,
  getPlaylist,
  listMyPlaylists,
  listTripPlaylists,
} from '../../api/playlists'
import { isApiError } from '../../lib/errors'
import type { Playlist } from '../../types/api'

interface AddToPlaylistModalProps {
  open: boolean
  onClose: () => void
  songId: string
  songTitle: string
  tripId?: string
}

/**
 * "Add to Playlist" picker. Shows the user's playlists and marks the ones that
 * already contain this song as "Already in playlist". The backend unique
 * constraint is the final protection against duplicate adds.
 */
export default function AddToPlaylistModal({
  open,
  onClose,
  songId,
  songTitle,
  tripId,
}: AddToPlaylistModalProps) {
  const [myPlaylists, setMyPlaylists] = useState<Playlist[]>([])
  const [tripPlaylists, setTripPlaylists] = useState<Playlist[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [inPlaylist, setInPlaylist] = useState<Set<string>>(new Set())
  const [adding, setAdding] = useState<string | null>(null)
  const [addedTo, setAddedTo] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newTrip, setNewTrip] = useState(Boolean(tripId))
  const [newPublic, setNewPublic] = useState(true)
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setActionError(null)
    setAddedTo(null)
    try {
      const [mine, tripOnes] = await Promise.all([
        listMyPlaylists({ quiet: true }),
        tripId
          ? listTripPlaylists(tripId, { quiet: true }).catch(() => [])
          : Promise.resolve([]),
      ])
      setMyPlaylists(mine)
      setTripPlaylists(tripOnes)
      // Discover which playlists already contain the song so the UI can show
      // "Already in playlist" up-front. Degrades gracefully on failures.
      const all = dedupe([...mine, ...tripOnes])
      const contains = await Promise.all(
        all.map(async (p) => {
          try {
            const detail = await getPlaylist(p.id)
            return detail.songs.some((s) => s.songId === songId)
          } catch {
            return false
          }
        }),
      )
      setInPlaylist(new Set(all.filter((_, i) => contains[i]).map((p) => p.id)))
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Unable to load your playlists.')
    } finally {
      setLoading(false)
    }
  }, [songId, tripId])

  useEffect(() => {
    if (open) {
      void load()
    } else {
      setCreating(false)
      setNewName('')
      setCreateError(null)
    }
  }, [open, load])

  const handleAdd = async (playlist: Playlist) => {
    setActionError(null)
    setAddedTo(null)
    setAdding(playlist.id)
    try {
      await addSongToPlaylist(playlist.id, songId)
      setInPlaylist((prev) => new Set(prev).add(playlist.id))
      setAddedTo(playlist.name)
    } catch (err) {
      if (isApiError(err) && err.errorCode === 'SONG_ALREADY_IN_PLAYLIST') {
        setInPlaylist((prev) => new Set(prev).add(playlist.id))
        setActionError(`${playlist.name} already has this song.`)
      } else {
        setActionError(isApiError(err) ? err.message : 'Unable to add this song.')
      }
    } finally {
      setAdding(null)
    }
  }

  const handleCreateAndAdd = async () => {
    const name = newName.trim()
    if (!name) return
    setCreateBusy(true)
    setCreateError(null)
    try {
      const playlist = await createPlaylist({
        name,
        description: undefined,
        tripId: newTrip && tripId ? tripId : undefined,
        isPublic: newPublic,
      })
      await addSongToPlaylist(playlist.id, songId)
      setMyPlaylists((prev) => [playlist, ...prev])
      setInPlaylist((prev) => new Set(prev).add(playlist.id))
      setAddedTo(playlist.name)
      setCreating(false)
      setNewName('')
    } catch (err) {
      setCreateError(
        isApiError(err) && err.errorCode === 'SONG_ALREADY_IN_PLAYLIST'
          ? 'That playlist was created and already contains this song.'
          : isApiError(err)
            ? err.message
            : 'Unable to create the playlist.',
      )
    } finally {
      setCreateBusy(false)
    }
  }

  const sections: { title: string; items: Playlist[] }[] = []
  if (myPlaylists.length > 0) sections.push({ title: 'My Playlists', items: myPlaylists })
  if (tripPlaylists.length > 0)
    sections.push({ title: 'Trip Playlists', items: tripPlaylists })

  return (
    <Modal open={open} onClose={onClose} title="Add to Playlist" eyebrow={`Add “${songTitle}” to`}>
      {actionError ? (
        <p role="alert" className="mb-3 rounded-xl border border-road/35 bg-road/10 px-3.5 py-2.5 text-sm text-road">
          {actionError}
        </p>
      ) : addedTo ? (
        <p role="status" className="mb-3 flex items-center gap-2 rounded-xl border border-accent/35 bg-accent/10 px-3.5 py-2.5 text-sm text-accent">
          <Check size={14} aria-hidden="true" /> Added to {addedTo}
        </p>
      ) : null}

      {loading ? <Spinner label="Loading your playlists…" /> : null}

      {!loading && error ? <ErrorState message={error} onRetry={() => void load()} /> : null}

      {!loading && !error && sections.length === 0 && !creating ? (
        <div className="flex flex-col items-center py-10 text-center">
          <span className="mb-3 grid size-12 place-items-center rounded-2xl border border-white/10 bg-white/5 text-mist">
            <ListMusic size={20} aria-hidden="true" />
          </span>
          <p className="text-sm text-mist/70">No playlists yet — create one to start saving songs.</p>
        </div>
      ) : null}

      {!loading && !error ? (
        <div className="space-y-5">
          {sections.map((section) => (
            <section key={section.title}>
              <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-mist/60">
                {section.title}
              </h3>
              <ul className="space-y-1.5">
                {section.items.map((p) => {
                  const already = inPlaylist.has(p.id)
                  return (
                    <li key={p.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                      <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-sm">
                        {p.isPublic ? '🎵' : <Lock size={14} aria-hidden="true" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-bone">{p.name}</span>
                        <span className="block text-[11px] text-mist/60">
                          {p.songCount} songs{p.trip ? ` · ${p.trip.name}` : ''}
                        </span>
                      </span>
                      {already ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-accent">
                          <Check size={12} aria-hidden="true" /> Already in playlist
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="accent"
                          loading={adding === p.id}
                          disabled={adding !== null}
                          onClick={() => void handleAdd(p)}
                          aria-label={`Add to ${p.name}`}
                        >
                          <Plus size={13} aria-hidden="true" /> Add
                        </Button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}

          {creating ? (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void handleCreateAndAdd()
              }}
              className="rounded-xl border border-white/12 bg-white/[0.04] p-3"
            >
              <label htmlFor="add-playlist-name" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-mist/70">
                Playlist name
              </label>
              <input
                id="add-playlist-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="My Ride Mix"
                autoFocus
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-night/60 px-3 py-2 text-sm text-bone outline-none placeholder:text-mist/40 focus:border-accent"
              />
              {tripId ? (
                <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-mist/80">
                  <input
                    type="checkbox"
                    checked={newTrip}
                    onChange={(e) => setNewTrip(e.target.checked)}
                    className="size-4 accent-accent"
                  />
                  Link to this trip (Trip playlist)
                </label>
              ) : null}
              <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-mist/80">
                <input
                  type="checkbox"
                  checked={newPublic}
                  onChange={(e) => setNewPublic(e.target.checked)}
                  className="size-4 accent-accent"
                />
                Public
              </label>
              {createError ? <p className="mt-2 text-xs text-road">{createError}</p> : null}
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setCreating(false)
                    setNewName('')
                    setCreateError(null)
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" loading={createBusy} disabled={!newName.trim()}>
                  Create &amp; add
                </Button>
              </div>
            </form>
          ) : (
            <Button
              variant="outline"
              block
              onClick={() => setCreating(true)}
              className="border-dashed"
            >
              <Plus size={14} aria-hidden="true" /> Create Playlist
            </Button>
          )}
        </div>
      ) : null}
    </Modal>
  )
}

function dedupe(playlists: Playlist[]): Playlist[] {
  const seen = new Set<string>()
  const out: Playlist[] = []
  for (const p of playlists) {
    if (!seen.has(p.id)) {
      seen.add(p.id)
      out.push(p)
    }
  }
  return out
}