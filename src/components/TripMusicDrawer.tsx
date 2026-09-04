import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioLines, Check, Clock, Library, ListMusic, ListPlus, Music2, Pause, Play, Plus, Search, SkipForward, Trash2, User } from 'lucide-react'
import Drawer from './Drawer'
import Button from './ui/Button'
import Spinner from './ui/Spinner'
import EmptyState from './ui/EmptyState'
import ErrorState from './ui/ErrorState'
import AddToPlaylistModal from './playlists/AddToPlaylistModal'
import TripJamPanel from './TripJamPanel'
import { addTripSong, listTripMusic, removeTripSong, searchTripMusic } from '../api/music'
import { isApiError } from '../lib/errors'
import { useMusicPlayer } from '../music/context'
import { searchResultToPlayerSong, tripSongToPlayerSong } from '../music/mappers'
import type { TripJamApi } from '../jam/useTripJam'
import type { MemberRole, TripSongItem, YouTubeVideoResult } from '../types/api'

const SEARCH_DEBOUNCE_MS = 400

interface TripMusicDrawerProps {
  open: boolean
  onClose: () => void
  tripId: string
  role?: MemberRole
  currentUserId?: string
  /** Opens the shared playlists panel (used by mobile to surface playlists from Music). */
  onOpenPlaylists?: () => void
  /** Real-time Jam session for the trip (Host controls, participants follow). */
  jam?: TripJamApi
}

function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

function ResultThumb({ src }: { src: string | null }) {
  return src ? (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className="size-12 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
    />
  ) : (
    <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-white/5 ring-1 ring-white/10 text-mist/50">
      <Music2 size={16} aria-hidden="true" />
    </span>
  )
}

/**
 * Shared Trip Music library (Phase 3A). Search is backed by the official
 * YouTube Data API (server-side, cached); songs are shared across all members
 * of the trip. Removal follows role permissions (OWNER/ADMIN/own adds).
 */
export default function TripMusicDrawer({ open, onClose, tripId, role, currentUserId, onOpenPlaylists, jam }: TripMusicDrawerProps) {
  const music = useMusicPlayer()
  const jamActive = jam?.ui.phase === 'active'
  const jamHost = jam?.isHost === true
  const jamParticipant = jam?.isParticipant === true
  /** Participants follow the Jam (playback is locked for them); the Host may
   *  tap anything and it plays through the Jam; members with no active Jam
   *  keep normal local playback. */
  const jamLocksPlayback = jamActive && jamParticipant && !jamHost
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<YouTubeVideoResult[]>([])
  const [nextPageToken, setNextPageToken] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)

  const [library, setLibrary] = useState<TripSongItem[]>([])
  const [libraryLoading, setLibraryLoading] = useState(true)
  const [libraryError, setLibraryError] = useState<string | null>(null)

  const [adding, setAdding] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [addToPlaylist, setAddToPlaylist] = useState<{ songId: string; title: string } | null>(null)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tripIdRef = useRef(tripId)
  tripIdRef.current = tripId

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true)
    setLibraryError(null)
    try {
      setLibrary(await listTripMusic(tripIdRef.current, { quiet: true }))
    } catch (err) {
      setLibraryError(isApiError(err) ? err.message : 'Unable to load the trip music.')
    } finally {
      setLibraryLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setActionError(null)
      void loadLibrary()
    } else {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [open, loadLibrary])

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }, [])

  const runSearch = useCallback(async (pageToken?: string) => {
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setSearchError(null)
    try {
      const page = await searchTripMusic(tripIdRef.current, q, pageToken, { quiet: true })
      setResults((prev) => (pageToken ? [...prev, ...page.items] : page.items))
      setNextPageToken(page.nextPageToken)
      setSearched(true)
    } catch (err) {
      setSearchError(isApiError(err) ? err.message : 'Unable to search right now.')
    } finally {
      setSearching(false)
    }
  }, [query])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      if (query.trim()) void runSearch()
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, runSearch])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    void runSearch()
  }

  const clearSearch = () => {
    setQuery('')
    setResults([])
    setNextPageToken(null)
    setSearched(false)
    setSearchError(null)
  }

  const handleAdd = async (videoId: string) => {
    setActionError(null)
    setAdding(videoId)
    try {
      await addTripSong(tripIdRef.current, videoId)
      await loadLibrary()
    } catch (err) {
      setActionError(isApiError(err) ? err.message : 'Unable to add this song.')
    } finally {
      setAdding(null)
    }
  }

  const handleRemove = async (item: TripSongItem) => {
    setActionError(null)
    setRemoving(item.songId)
    try {
      await removeTripSong(tripIdRef.current, item.songId)
      setLibrary((prev) => prev.filter((s) => s.songId !== item.songId))
    } catch (err) {
      setActionError(isApiError(err) ? err.message : 'Unable to remove this song.')
    } finally {
      setRemoving(null)
    }
  }

  const canRemove = (item: TripSongItem) =>
    role === 'OWNER' || role === 'ADMIN' || item.addedBy.id === currentUserId

  const librarySongs = useMemo(() => library.map(tripSongToPlayerSong), [library])

  const handlePlaySong = (song: TripSongItem) => {
    // In an active Jam, only the Host drives playback for everyone. Members who
    // have NOT joined (like a visitor just browsing) keep normal local play.
    if (jam?.ui.jam && jam.isHost) {
      // Tapping the song already playing in the Jam toggles play/pause.
      if (jam.ui.jam.currentSong?.songId === song.songId) {
        void jam.control(jam.ui.jam.isPlaying ? 'pause' : 'play')
      } else {
        void jam.control('song_changed', { songId: song.songId })
      }
      return
    }
    const index = library.findIndex((s) => s.songId === song.songId)
    music.playSongs(librarySongs, index >= 0 ? index : 0)
    music.openFullPlayer()
  }

  const addedIds = new Set(library.map((s) => s.youtubeVideoId))
  const isManager = role === 'OWNER' || role === 'ADMIN'

  return (
    <>
      <Drawer open={open} onClose={onClose} title="Trip Music" eyebrow="Shared library">
      {actionError ? (
        <p role="alert" className="mb-4 rounded-xl border border-road/35 bg-road/10 px-3.5 py-2.5 text-sm text-road">
          {actionError}
        </p>
      ) : null}

      {/* realtime Jam — Host controls synchronized playback for every rider */}
      {jam ? <TripJamPanel jam={jam} /> : null}

      {/* now playing — quick transport without leaving the drawer (hidden
          while the user is inside a Jam; the Jam panel shows the current song) */}
      {music.current && !jamLocksPlayback ? (
        <section className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] p-3" aria-label="Now playing">
          <div className="flex items-center gap-3">
            {music.current.song.thumbnailUrl !== null ? (
              <img
                src={music.current.song.thumbnailUrl}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="size-12 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
              />
            ) : (
              <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-white/5 text-mist/50 ring-1 ring-white/10">
                <Music2 size={16} aria-hidden="true" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-accent">Now Playing</p>
              <p className="truncate font-display text-sm font-semibold text-bone">{music.current.song.title}</p>
              <p className="truncate text-xs text-mist/70">{music.current.song.artist}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label="Playback controls">
              <button
                type="button"
                onClick={music.togglePlay}
                aria-label={music.state.isPlaying ? 'Pause' : 'Play'}
                className="grid size-11 place-items-center rounded-full border border-white/12 bg-white/5 text-bone transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-accent active:scale-95"
              >
                {music.state.isPlaying ? <Pause size={16} fill="currentColor" aria-hidden="true" /> : <Play size={16} fill="currentColor" aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={music.next}
                aria-label="Next song"
                className="grid size-11 place-items-center rounded-full border border-white/12 bg-white/5 text-bone transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-accent active:scale-95"
              >
                <SkipForward size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => music.openFullPlayer()}
            className="mt-3 flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/5 text-xs font-semibold text-bone transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <AudioLines size={14} className="text-accent" aria-hidden="true" />
            Open full player
          </button>
        </section>
      ) : null}

      {/* playlist access — shared playlists in ≤2 taps from Music */}
      {onOpenPlaylists ? (
        <button
          type="button"
          onClick={onOpenPlaylists}
          aria-label="Open trip playlists"
          className="mb-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-bone transition hover:border-accent/45 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-accent"
        >
          <ListPlus size={16} className="text-accent" aria-hidden="true" />
          Trip Playlists
        </button>
      ) : null}

      {/* search */}
      <form onSubmit={handleSearchSubmit} className="mb-6" role="search">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist/50" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search songs or artists…"
            aria-label="Search YouTube songs"
            autoComplete="off"
            spellCheck={false}
            className="min-h-11 w-full rounded-xl border border-white/12 bg-night/60 pl-10 pr-10 text-sm text-bone outline-none transition placeholder:text-mist/40 focus:border-accent"
          />
          {searched ? (
            <Button type="button" variant="ghost" size="sm" onClick={clearSearch} className="absolute right-1.5 top-1/2 -translate-y-1/2 !min-h-8 !px-2.5">
              Clear
            </Button>
          ) : (
            <Button type="submit" variant="ghost" size="sm" className="absolute right-1.5 top-1/2 -translate-y-1/2 !min-h-8 !px-2.5">
              Search
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-[10px] text-mist/50">Search results come from YouTube. Searches are debounced and cached to save quota.</p>
      </form>

      {searchError ? <ErrorState message={searchError} onRetry={() => void runSearch()} /> : null}

      {searching ? <Spinner label="Searching YouTube…" /> : null}

      {!searching && searched && results.length === 0 ? (
        <EmptyState icon={<Music2 size={22} />} title="No results" description={`Nothing found for "${query.trim()}". Try a different song or artist.`} />
      ) : null}

      {/* search results */}
      {results.length > 0 ? (
        <section className="mb-8" aria-label="Search results">
          <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-mist/60">Search results</h3>
          <ul className="space-y-2">
            {results.map((r) => {
              const isAdded = addedIds.has(r.videoId)
              return (
                <li
                  key={r.videoId}
                  role="button"
                  tabIndex={jamLocksPlayback ? -1 : 0}
                  onClick={() => { if (!jamLocksPlayback) music.play(searchResultToPlayerSong(r)) }}
                  onKeyDown={(e) => {
                    if (!jamLocksPlayback && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault()
                      music.play(searchResultToPlayerSong(r))
                    }
                  }}
                  className={`flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 transition ${jamLocksPlayback ? 'opacity-90' : 'cursor-pointer hover:border-accent/40 hover:bg-white/[0.06]'}`}
                  title={jamLocksPlayback ? 'The Jam Host controls playback' : `Play ${r.title}`}
                >
                  <ResultThumb src={r.thumbnailUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-bone">{r.title}</p>
                    <p className="truncate text-[11px] text-mist/70">{r.channelTitle}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="!min-h-8 !gap-1 !px-2.5"
                    onClick={(e) => {
                      e.stopPropagation()
                      music.addToQueue(searchResultToPlayerSong(r))
                    }}
                    aria-label={`Add ${r.title} to the queue`}
                    title="Add to queue"
                  >
                    <ListPlus size={14} aria-hidden="true" />
                  </Button>
                  <Button
                    size="sm"
                    variant={isAdded ? 'outline' : 'accent'}
                    disabled={isAdded || adding === r.videoId}
                    loading={adding === r.videoId}
                    onClick={(e) => {
                      e.stopPropagation()
                      void handleAdd(r.videoId)
                    }}
                  >
                    {isAdded ? (
                      <>
                        <Check size={13} aria-hidden="true" /> Added
                      </>
                    ) : (
                      <>
                        <Plus size={13} aria-hidden="true" /> Add
                      </>
                    )}
                  </Button>
                </li>
              )
            })}
          </ul>
          {nextPageToken ? (
            <Button variant="outline" block size="sm" loading={searching} onClick={() => void runSearch(nextPageToken)} className="mt-3">
              Load more results
            </Button>
          ) : null}
        </section>
      ) : null}

      {/* library */}
      <section aria-label="Trip Music Library">
        <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-mist/60">Trip Music · {library.length}</h3>

        {libraryLoading ? <Spinner label="Loading trip music…" /> : null}

        {!libraryLoading && libraryError ? <ErrorState message={libraryError} onRetry={() => void loadLibrary()} /> : null}

        {!libraryLoading && !libraryError && library.length === 0 ? (
          <EmptyState
            icon={<ListMusic size={22} />}
            title="No songs yet"
            description="Search for a song and add it — every member of this trip sees the same library."
          />
        ) : null}

        {!libraryLoading && library.length > 0 ? (
          <ul className="space-y-2">
            {library.map((item) => {
              const canRemoveItem = canRemove(item)
              const duration = formatDuration(item.durationSeconds)
              const isCurrentSong = music.current?.song.videoId === item.youtubeVideoId
              return (
                <li
                  key={item.id}
                  role="button"
                  tabIndex={jamActive && jamParticipant && !jamHost ? -1 : 0}
                  onClick={() => handlePlaySong(item)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      handlePlaySong(item)
                    }
                  }}
                  className={`flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 transition ${jamActive && jamParticipant && !jamHost ? 'opacity-90' : 'cursor-pointer hover:border-accent/40 hover:bg-white/[0.06]'}`}
                  title={jamActive && jamParticipant && !jamHost ? 'The Jam Host controls playback' : `Play ${item.title}`}
                >
                  <ResultThumb src={item.thumbnailUrl} />
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
                    <p className="mt-0.5 flex items-center gap-1 text-[10px] text-mist/50">
                      <User size={9} aria-hidden="true" /> added by {item.addedBy.name}
                    </p>
                  </div>
                  {jamActive && jamParticipant && !jamHost ? (
                    isCurrentSong ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled
                        aria-label={`${item.title} is playing in the Jam`}
                        title="Playing in the Jam"
                      >
                        <AudioLines size={13} aria-hidden="true" />
                        <span className="hidden sm:inline">In Jam</span>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled
                        aria-label={`${item.title} cannot be played while a Jam is active`}
                        title="The Jam Host controls playback"
                      >
                        <Play size={13} aria-hidden="true" />
                        <span className="hidden sm:inline">In Jam</span>
                      </Button>
                    )
                  ) : isCurrentSong ? (
                    <Button
                      size="sm"
                      variant={music.state.isPlaying ? 'outline' : 'accent'}
                      loading={!!music.state.loading && music.state.isPlaying}
                      onClick={(e) => {
                        e.stopPropagation()
                        handlePlaySong(item)
                      }}
                      aria-label={music.state.isPlaying ? `Pause ${item.title}` : `Resume ${item.title}`}
                    >
                      {music.state.isPlaying ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
                      <span className="hidden sm:inline">{music.state.isPlaying ? 'Pause' : 'Play'}</span>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="accent"
                      onClick={(e) => {
                        e.stopPropagation()
                        handlePlaySong(item)
                      }}
                      aria-label={jamHost ? `Play ${item.title} in the Jam` : `Play ${item.title}`}
                      title={jamHost ? 'Play this song in the Jam for everyone' : undefined}
                    >
                      <Play size={13} aria-hidden="true" />
                      <span className="hidden sm:inline">Play</span>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="!min-h-8 !px-2.5"
                    onClick={(e) => {
                      e.stopPropagation()
                      setAddToPlaylist({ songId: item.songId, title: item.title })
                    }}
                    aria-label={`Add ${item.title} to a playlist`}
                    title="Add to playlist"
                  >
                    <Library size={14} aria-hidden="true" />
                  </Button>
                  {canRemoveItem ? (
                    <Button
                      size="sm"
                      variant="danger"
                      loading={removing === item.songId}
                      disabled={removing !== null}
                      onClick={(e) => {
                        e.stopPropagation()
                        void handleRemove(item)
                      }}
                      aria-label={`Remove ${item.title} from the trip`}
                    >
                      <Trash2 size={13} aria-hidden="true" />
                      <span className="hidden sm:inline">Remove</span>
                    </Button>
                  ) : (
                    <span className="shrink-0 text-[10px] uppercase tracking-wider text-mist/40">Shared</span>
                  )}
                </li>
              )
            })}
          </ul>
        ) : null}
      </section>

      <p className="mt-8 border-t border-white/8 pt-3 text-[10px] leading-relaxed text-mist/40">
        Music, thumbnails and search are provided by YouTube. {isManager ? 'OWNER/ADMIN can remove any song; members can remove their own.' : 'You can remove songs you added; trip owners and admins can remove any.'}
      </p>
    </Drawer>
    <AddToPlaylistModal
      open={addToPlaylist !== null}
      onClose={() => setAddToPlaylist(null)}
      songId={addToPlaylist?.songId ?? ''}
      songTitle={addToPlaylist?.title ?? ''}
      tripId={tripId}
    />
    </>
  )
}