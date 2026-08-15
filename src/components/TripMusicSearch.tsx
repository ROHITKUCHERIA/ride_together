import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Music2, Pause, Play, Search, X } from 'lucide-react'
import { addTripSong, listTripMusic, searchTripMusic } from '../api/music'
import { isApiError } from '../lib/errors'
import { useMusicPlayer } from '../music/context'
import { searchResultToPlayerSong } from '../music/mappers'
import type { YouTubeVideoResult } from '../types/api'

const SEARCH_DEBOUNCE_MS = 400

interface TripMusicSearchProps {
  tripId: string
  /** floating = fixed pill over the Trip Room; inline = sits inside another panel (music player). */
  variant?: 'floating' | 'inline'
  /** replace = start fresh queue (Trip Room); enqueue = add to queue and play (music player). */
  playMode?: 'replace' | 'enqueue'
}

function ResultThumb({ src }: { src: string | null }) {
  return src ? (
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className="size-10 shrink-0 rounded-lg object-cover ring-1 ring-white/10"
    />
  ) : (
    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/5 text-mist/50 ring-1 ring-white/10">
      <Music2 size={14} aria-hidden="true" />
    </span>
  )
}

/**
 * Inline Trip music search. Typing searches YouTube (server-side, cached) and
 * showing results in a dropdown; clicking a result plays it immediately and —
 * following the shared-library flow — stores it in the trip's DB via
 * addTripSong (deduped by the already-added set). In the music player
 * (playMode="enqueue") picking a result also appends it to the play queue.
 */
export default function TripMusicSearch({
  tripId,
  variant = 'floating',
  playMode = 'replace',
}: TripMusicSearchProps) {
  const music = useMusicPlayer()

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<YouTubeVideoResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<string | null>(null)

  const boxRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /* Know which videos are already stored so playing doesn't re-add them. */
  useEffect(() => {
    let cancelled = false
    listTripMusic(tripId)
      .then((songs) => {
        if (!cancelled) setAddedIds(new Set(songs.map((s) => s.youtubeVideoId)))
      })
      .catch(() => {
        // Search still works without the library snapshot; saves may 409.
      })
    return () => {
      cancelled = true
    }
  }, [tripId])

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) {
      setResults([])
      setSearchError(null)
      return
    }
    setSearching(true)
    setSearchError(null)
    try {
      const page = await searchTripMusic(tripId, trimmed)
      setResults(page.items)
    } catch (err) {
      setResults([])
      setSearchError(isApiError(err) ? err.message : 'Unable to search right now.')
    } finally {
      setSearching(false)
    }
  }, [tripId])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void runSearch(query), SEARCH_DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, runSearch])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const handlePlay = async (r: YouTubeVideoResult) => {
    if (playMode === 'enqueue') {
      const inQueue = music.state.queue.findIndex((item) => item.song.videoId === r.videoId)
      if (inQueue >= 0) {
        music.playIndex(inQueue)
      } else {
        const index = music.state.queue.length
        music.addToQueue(searchResultToPlayerSong(r))
        music.playIndex(index)
      }
    } else {
      music.play(searchResultToPlayerSong(r))
    }
    setSaveError(null)
    if (addedIds.has(r.videoId)) return

    setSaving(r.videoId)
    try {
      await addTripSong(tripId, r.videoId)
      setAddedIds((prev) => new Set(prev).add(r.videoId))
    } catch (err) {
      if (isApiError(err) && err.errorCode === 'SONG_ALREADY_ADDED') {
        setAddedIds((prev) => new Set(prev).add(r.videoId))
      } else {
        setSaveError(isApiError(err) ? err.message : "Couldn't save this song to the trip.")
      }
    } finally {
      setSaving(null)
    }
  }

  const showDropdown = open && query.trim().length > 0

  const containerClass =
    variant === 'inline'
      ? 'relative w-full'
      : 'fixed left-1/2 z-[70] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 sm:top-20'
  const floatingTop = { top: 'calc(env(safe-area-inset-top, 0px) + 6.25rem)' } as const

  return (
    <div ref={boxRef} className={containerClass} style={variant === 'floating' ? floatingTop : undefined}>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist/50" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search music for this trip…"
          aria-label="Search music"
          aria-expanded={showDropdown}
          autoComplete="off"
          spellCheck={false}
          className="min-h-11 w-full rounded-full border border-white/12 bg-night/70 pl-10 pr-9 text-sm text-bone shadow-[0_12px_40px_-12px_rgba(0,0,0,0.8)] outline-none backdrop-blur-xl transition placeholder:text-mist/40 focus:border-accent/60 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('')
              setResults([])
              inputRef.current?.focus()
            }}
            aria-label="Clear search"
            className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-mist/60 transition hover:bg-white/10 hover:text-bone focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X size={14} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {showDropdown ? (
        <div className="absolute inset-x-0 top-full mt-2 max-h-[min(60vh,26rem)] overflow-y-auto rounded-2xl border border-white/12 bg-night/90 p-1.5 shadow-2xl backdrop-blur-xl">
          {searchError ? (
            <p role="alert" className="px-3 py-4 text-center text-[12px] text-road">{searchError}</p>
          ) : searching && results.length === 0 ? (
            <p className="flex items-center justify-center gap-2 px-3 py-6 text-[12px] text-mist/60">
              <span className="size-3 animate-spin rounded-full border-2 border-mist/30 border-t-accent" aria-hidden="true" />
              Searching…
            </p>
          ) : results.length === 0 && !searching ? (
            <p className="px-3 py-6 text-center text-[12px] text-mist/50">
              Nothing found for “{query.trim()}”.
            </p>
          ) : (
            <>
              {saveError ? (
                <p role="alert" className="border-b border-white/8 px-3 py-2 text-[11px] text-road">{saveError}</p>
              ) : null}
              <ul aria-label="Search results">
                {results.map((r) => {
                  const isCurrent = music.current?.song.videoId === r.videoId
                  const isAdded = addedIds.has(r.videoId)
                  const isSaving = saving === r.videoId
                  return (
                    <li key={r.videoId}>
                      <button
                        type="button"
                        onClick={() => void handlePlay(r)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            void handlePlay(r)
                          }
                        }}
                        className="group flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-accent"
                        aria-label={`Play ${r.title}`}
                      >
                        <ResultThumb src={r.thumbnailUrl} />
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-[13px] ${isCurrent ? 'font-medium text-accent' : 'text-bone'}`}>
                            {r.title}
                          </span>
                          <span className="block truncate text-[11px] text-mist/60">{r.channelTitle}</span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {isSaving ? (
                            <span className="grid size-7 place-items-center">
                              <span className="size-3 animate-spin rounded-full border-2 border-mist/30 border-t-accent" aria-hidden="true" />
                            </span>
                          ) : isAdded ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-accent">
                              <Check size={12} aria-hidden="true" /> Saved
                            </span>
                          ) : isCurrent ? (
                            <span className="grid size-7 place-items-center rounded-md bg-white/10 text-accent">
                              {music.state.isPlaying ? <Pause size={13} aria-hidden="true" /> : <Play size={13} aria-hidden="true" />}
                            </span>
                          ) : (
                            <span className="grid size-7 place-items-center rounded-md bg-white/5 text-mist/50 transition group-hover:bg-accent/15 group-hover:text-accent">
                              <Play size={13} aria-hidden="true" />
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
