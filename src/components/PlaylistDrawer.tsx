import { useState } from 'react'
import { Plus } from 'lucide-react'
import Drawer from './Drawer'
import type { Playlist } from '../types'

interface PlaylistDrawerProps {
  open: boolean
  onClose: () => void
  playlists: Playlist[]
  onCreate: (name: string) => void
}

function PlaylistSection({ title, items }: { title: string; items: Playlist[] }) {
  if (items.length === 0) return null
  return (
    <div className="mb-6">
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.26em] text-mist/60">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition hover:border-white/10 hover:bg-white/[0.05] focus-visible:outline-2 focus-visible:outline-ember"
              aria-label={`Open playlist ${p.name}`}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-lg">{p.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-sm font-medium text-bone">{p.name}</span>
                <span className="block text-[11px] text-mist/60">
                  {p.owner} · {p.songCount} songs
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function PlaylistDrawer({ open, onClose, playlists, onCreate }: PlaylistDrawerProps) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onCreate(trimmed)
    setName('')
    setCreating(false)
  }

  const my = playlists.filter((p) => p.scope === 'my')
  const tripPls = playlists.filter((p) => p.scope === 'trip')

  return (
    <Drawer open={open} onClose={onClose} title="Playlists" eyebrow="Music">
      {playlists.length === 0 ? (
        <div className="flex flex-col items-center py-14 text-center">
          <span className="mb-3 text-3xl" aria-hidden="true">🎵</span>
          <p className="text-sm text-bone/80">No playlists yet.</p>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/5 px-4 py-2 text-xs font-medium text-bone transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-ember"
          >
            <Plus size={14} /> Create Playlist
          </button>
        </div>
      ) : (
        <>
          <PlaylistSection title="My Playlists" items={my} />
          <PlaylistSection title="Trip Playlists" items={tripPls} />
        </>
      )}

      {creating ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
          className="mb-6 rounded-xl border border-white/12 bg-white/[0.04] p-3"
        >
          <label htmlFor="playlist-name" className="sr-only">
            Playlist name
          </label>
          <input
            id="playlist-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New playlist name"
            autoFocus
            className="w-full rounded-lg border border-white/10 bg-night/60 px-3 py-2 text-sm text-bone outline-none placeholder:text-mist/50 focus:border-ember"
          />
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setCreating(false)
                setName('')
              }}
              className="rounded-lg px-3 py-1.5 text-xs text-mist transition hover:text-bone focus-visible:outline-2 focus-visible:outline-ember"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="rounded-lg bg-bone px-3 py-1.5 text-xs font-semibold text-night transition hover:bg-white disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ember"
            >
              Create
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/20 px-4 py-3 text-sm font-medium text-mist transition hover:border-ember/50 hover:text-bone focus-visible:outline-2 focus-visible:outline-ember"
        >
          <Plus size={15} /> Create Playlist
        </button>
      )}
    </Drawer>
  )
}
