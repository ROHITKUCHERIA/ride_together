import { useEffect, useRef, useState } from 'react'
import { Loader2, MapPin, Search, X } from 'lucide-react'
import { searchPlaces } from '../services/GeocodingService'
import { NAV_SEARCH_DEBOUNCE_MS } from '../config'
import type { NavigationDestination } from '../types'

interface DestinationSearchProps {
  onSelect: (destination: NavigationDestination) => void
  /** Disable while a route is loading/navigating. */
  disabled?: boolean
}

interface Suggestion {
  name: string
  latitude: number
  longitude: number
}

/** Debounced place search. Selecting a suggestion pins it as the destination. */
export default function DestinationSearch({ onSelect, disabled }: DestinationSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    const q = query.trim()
    if (q.length < 2) {
      setResults([])
      setLoading(false)
      setSearched(false)
      return
    }
    setLoading(true)
    debounceRef.current = window.setTimeout(async () => {
      const found = await searchPlaces(q, 6)
      setResults(found)
      setLoading(false)
      setSearched(true)
    }, NAV_SEARCH_DEBOUNCE_MS)

    return () => {
      if (debounceRef.current !== null) window.clearTimeout(debounceRef.current)
    }
  }, [query])

  const pick = (latitude: number, longitude: number, name: string) => {
    onSelect({ latitude, longitude, name })
    setQuery('')
    setResults([])
    setSearched(false)
  }

  const showEmpty = searched && !loading && results.length === 0 && query.trim().length >= 2

  return (
    <div className="w-full">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist/70" aria-hidden="true" />
        <input
          type="text"
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter picks the top suggestion when available.
            if (e.key === 'Enter' && results[0]) pick(results[0].latitude, results[0].longitude, results[0].name)
          }}
          placeholder="Search destination (city, landmark…)"
          aria-label="Search destination"
          className="w-full rounded-xl border border-white/12 bg-white/5 py-2.5 pl-9 pr-9 text-[15px] text-bone placeholder:text-mist/60 focus:border-ember/60 focus:outline-2 focus:outline-ember disabled:opacity-50"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setQuery('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-mist transition hover:bg-white/10 hover:text-bone"
          >
            <X size={14} aria-hidden="true" />
          </button>
        ) : null}
        {loading ? (
          <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-ember" aria-hidden="true" />
        ) : null}
      </div>

      {results.length > 0 ? (
        <ul className="rt-scroll mt-2 max-h-44 overflow-y-auto rounded-xl border border-white/10 bg-charcoal/85 backdrop-blur-xl">
          {results.map((r, i) => (
            <li key={`${r.latitude},${r.longitude},${i}`}>
              <button
                type="button"
                onClick={() => pick(r.latitude, r.longitude, r.name)}
                className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-ember"
              >
                <MapPin size={14} className="mt-0.5 shrink-0 text-ember" aria-hidden="true" />
                <span className="min-w-0 text-[13px] leading-snug text-bone/90">{r.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {showEmpty ? (
        <p className="mt-2 text-center text-[11px] text-mist/70">No places found. Try another search or tap the map.</p>
      ) : null}
    </div>
  )
}