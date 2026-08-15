import { useCallback, useEffect, useState } from 'react'
import { ListMusic, Lock, Music2, Plus } from 'lucide-react'
import Drawer from './Drawer'
import Button from './ui/Button'
import Spinner from './ui/Spinner'
import EmptyState from './ui/EmptyState'
import ErrorState from './ui/ErrorState'
import PlaylistDetail from './playlists/PlaylistDetail'
import {
  createPlaylist,
  listMyPlaylists,
  listTripPlaylists,
} from '../api/playlists'
import { isApiError } from '../lib/errors'
import type { Playlist } from '../types/api'

interface PlaylistDrawerProps {
  open: boolean
  onClose: () => void
  tripId?: string
  currentUserId?: string
}

/**
 * Real persistent playlists (Phase 3C). Lists "My Playlists" and (when inside
 * a trip) the trip's playlists, lets you create a playlist, and drills into a
 * detail view backed by the real APIs — no mock data.
 */
export default function PlaylistDrawer({
  open,
  onClose,
  tripId,
  currentUserId,
}: PlaylistDrawerProps) {
  const [myPlaylists, setMyPlaylists] = useState<Playlist[]>([])
  const [tripPlaylists, setTripPlaylists] = useState<Playlist[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [linkToTrip, setLinkToTrip] = useState(Boolean(tripId))
  const [isPublic, setIsPublic] = useState(true)
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [mine, tripOnes] = await Promise.all([
        listMyPlaylists(),
        tripId
          ? listTripPlaylists(tripId).catch(() => [])
          : Promise.resolve([]),
      ])
      setMyPlaylists(mine)
      setTripPlaylists(tripOnes)
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Unable to load your playlists.')
    } finally {
      setLoading(false)
    }
  }, [tripId])

  useEffect(() => {
    if (open) {
      setSelectedId(null)
      setCreating(false)
      setCreateError(null)
      void load()
    }
  }, [open, load])

  const handleCreate = async () => {
    const trimmed = name.trim()
    if (!trimmed) return
    setCreateBusy(true)
    setCreateError(null)
    try {
      const playlist = await createPlaylist({
        name: trimmed,
        description: description.trim() || undefined,
        tripId: tripId && linkToTrip ? tripId : undefined,
        isPublic,
      })
      if (playlist.tripId) {
        setTripPlaylists((prev) => [playlist, ...prev])
      } else {
        setMyPlaylists((prev) => [playlist, ...prev])
      }
      setName('')
      setDescription('')
      setCreating(false)
    } catch (err) {
      setCreateError(isApiError(err) ? err.message : 'Unable to create the playlist.')
    } finally {
      setCreateBusy(false)
    }
  }

  const closeDetail = useCallback(() => {
    setSelectedId(null)
  }, [])

  const handleDetailChanged = useCallback(() => {
    void load()
  }, [load])

  const renderRow = (p: Playlist) => (
    <li key={p.id}>
      <button
        type="button"
        onClick={() => setSelectedId(p.id)}
        className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition hover:border-white/10 hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-ember"
        aria-label={`Open playlist ${p.name}`}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-mist/70">
          {p.isPublic ? <Music2 size={16} aria-hidden="true" /> : <Lock size={15} aria-hidden="true" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-sm font-medium text-bone">{p.name}</span>
          <span className="block truncate text-[11px] text-mist/60">
            {p.songCount} songs · {p.owner.name}
            {p.trip ? ` · ${p.trip.name}` : ''}
            {p.isPublic ? '' : ' · Private'}
          </span>
        </span>
      </button>
    </li>
  )

  return (
    <Drawer open={open} onClose={onClose} title="Playlists" eyebrow="Music">
      {selectedId ? (
        <PlaylistDetail
          playlistId={selectedId}
          currentUserId={currentUserId}
          onBack={closeDetail}
          onDeleted={closeDetail}
          onChanged={handleDetailChanged}
        />
      ) : (
        <>
          {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}

          {loading ? <Spinner label="Loading playlists…" /> : null}

          {!loading && !error ? (
            <>
              <section className="mb-6">
                <h3 className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.26em] text-mist/60">
                  My Playlists
                  <span className="text-mist/40">{myPlaylists.length}</span>
                </h3>
                {myPlaylists.length === 0 ? (
                  <EmptyState
                    icon={<ListMusic size={20} />}
                    title="You haven't created a playlist yet."
                    description="Create one and add songs from the Trip Music library."
                  />
                ) : (
                  <ul className="space-y-1.5">{myPlaylists.map(renderRow)}</ul>
                )}
              </section>

              {tripId ? (
                <section className="mb-6">
                  <h3 className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.26em] text-mist/60">
                    Trip Playlists
                    <span className="text-mist/40">{tripPlaylists.length}</span>
                  </h3>
                  {tripPlaylists.length === 0 ? (
                    <EmptyState
                      icon={<Music2 size={20} />}
                      title="No trip playlists yet."
                      description="Trip playlists your group creates will show up here."
                    />
                  ) : (
                    <ul className="space-y-1.5">{tripPlaylists.map(renderRow)}</ul>
                  )}
                </section>
              ) : null}

              {creating ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    void handleCreate()
                  }}
                  className="rounded-xl border border-white/12 bg-white/[0.04] p-3"
                >
                  <label htmlFor="playlist-name" className="text-[11px] font-semibold uppercase tracking-[0.18em] text-mist/70">
                    Playlist name
                  </label>
                  <input
                    id="playlist-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="My Highway Mix"
                    autoFocus
                    maxLength={80}
                    className="mt-1.5 w-full rounded-lg border border-white/10 bg-night/60 px-3 py-2 text-sm text-bone outline-none placeholder:text-mist/40 focus:border-accent"
                  />
                  <label htmlFor="playlist-description" className="mt-3 block text-[11px] font-semibold uppercase tracking-[0.18em] text-mist/70">
                    Description (optional)
                  </label>
                  <textarea
                    id="playlist-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is this mix for?"
                    rows={2}
                    maxLength={500}
                    className="mt-1.5 w-full resize-none rounded-lg border border-white/10 bg-night/60 px-3 py-2 text-sm text-bone outline-none placeholder:text-mist/40 focus:border-accent"
                  />
                  {tripId ? (
                    <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-mist/80">
                      <input
                        type="checkbox"
                        checked={linkToTrip}
                        onChange={(e) => setLinkToTrip(e.target.checked)}
                        className="size-4 accent-accent"
                      />
                      Link to this trip (Trip playlist)
                    </label>
                  ) : null}
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-mist/80">
                    <input
                      type="checkbox"
                      checked={isPublic}
                      onChange={(e) => setIsPublic(e.target.checked)}
                      className="size-4 accent-ember"
                    />
                    Public
                  </label>
                  {createError ? (
                    <p role="alert" className="mt-2 text-xs text-road">
                      {createError}
                    </p>
                  ) : null}
                  <div className="mt-3 flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCreating(false)
                        setCreateError(null)
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" size="sm" loading={createBusy} disabled={!name.trim()}>
                      Create
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
                  <Plus size={15} aria-hidden="true" /> Create Playlist
                </Button>
              )}
            </>
          ) : null}
        </>
      )}
    </Drawer>
  )
}