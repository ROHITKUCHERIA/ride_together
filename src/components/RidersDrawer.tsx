import { MapPin, Navigation } from 'lucide-react'
import Avatar from './Avatar'
import Drawer from './Drawer'
import type { Rider } from '../types'

interface RidersDrawerProps {
  open: boolean
  onClose: () => void
  riders: Rider[]
  onlineCount: number
}

function statusLine(rider: Rider): string {
  if (rider.status === 'offline') return `Offline · ${rider.lastUpdate}`
  if (rider.status === 'weak') return 'Weak connection'
  return 'Location sharing'
}

export default function RidersDrawer({ open, onClose, riders, onlineCount }: RidersDrawerProps) {
  const sorted = [...riders].sort((a, b) => {
    const rank = { online: 0, weak: 1, offline: 2 } as const
    return rank[a.status] - rank[b.status]
  })

  return (
    <Drawer open={open} onClose={onClose} title="Riders" eyebrow={`${onlineCount} online`}>
      {onlineCount === 0 ? (
        <div className="flex flex-col items-center py-14 text-center">
          <span className="mb-3 text-3xl" aria-hidden="true">🏍️</span>
          <p className="text-sm text-bone/80">You're the only rider online.</p>
        </div>
      ) : null}

      <ul className="space-y-1.5">
        {sorted.map((r) => {
          const online = r.status !== 'offline'
          return (
            <li key={r.id}>
              <div className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition hover:border-white/10 hover:bg-white/[0.05]">
                <Avatar name={r.name} accent={r.accent} size={42} status={r.status} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-display text-sm font-medium text-bone">
                    {r.name}
                    {r.isMe ? <span className="rounded-full border border-ember/40 bg-ember/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-ember">You</span> : null}
                  </p>
                  <p className="truncate text-[11px] text-mist/60">
                    {r.bike} · {statusLine(r)}
                  </p>
                </div>
                {online ? (
                  <div className="shrink-0 text-right">
                    <p className="flex items-center justify-end gap-1 font-display text-sm font-semibold text-bone/90">
                      <Navigation size={11} className="text-live" aria-hidden="true" />
                      {r.speed ?? 0} km/h
                    </p>
                    <p className="flex items-center justify-end gap-1 text-[10px] text-mist/60">
                      <MapPin size={10} aria-hidden="true" />
                      {r.distanceKm === 0 ? 'You' : `${r.distanceKm?.toFixed(1)} km away`}
                    </p>
                  </div>
                ) : (
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-mist/40">Offline</span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </Drawer>
  )
}
