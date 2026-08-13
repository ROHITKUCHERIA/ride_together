import { Calendar, Flag, MapPin, Route, Settings } from 'lucide-react'
import Avatar from './Avatar'
import Button from './ui/Button'
import Drawer from './Drawer'
import ShareTrip from './ShareTrip'
import type { TripInfo } from '../types'
import type { MemberRole } from '../types/api'

interface TripInfoDrawerProps {
  open: boolean
  onClose: () => void
  trip: TripInfo
  role?: MemberRole
  canManage?: boolean
  onManage?: () => void
}

function roleLabel(role: MemberRole): string {
  if (role === 'OWNER') return 'Owner'
  if (role === 'ADMIN') return 'Admin'
  return 'Member'
}

export default function TripInfoDrawer({ open, onClose, trip, role, canManage, onManage }: TripInfoDrawerProps) {
  const creator = trip.riders.find((r) => r.isMe)

  return (
    <Drawer open={open} onClose={onClose} title={`${trip.destination} Road Trip`} eyebrow="Trip info">
      <div className="space-y-5">
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="grid size-11 place-items-center rounded-xl border border-white/10 bg-white/5 text-ember">
            <Route size={20} aria-hidden="true" />
          </div>
          <div>
            <p className="font-display text-base font-semibold text-bone">
              {trip.origin} → {trip.destination}
            </p>
            <p className="text-xs text-mist/70">{trip.distanceKm.toLocaleString('en-IN')} km of highway ahead</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
            <Calendar size={15} className="mx-auto mb-1 text-sunset" aria-hidden="true" />
            <p className="text-[11px] font-medium text-bone/85">{trip.startDate}</p>
            <p className="text-[10px] text-mist/50">Start</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
            <Flag size={15} className="mx-auto mb-1 text-ember" aria-hidden="true" />
            <p className="text-[11px] font-medium text-bone/85">{trip.days} days</p>
            <p className="text-[10px] text-mist/50">Duration</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
            <MapPin size={15} className="mx-auto mb-1 text-live" aria-hidden="true" />
            <p className="text-[11px] font-medium text-bone/85">{trip.riders.length}</p>
            <p className="text-[10px] text-mist/50">Riders</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-mist/50">Start</p>
            <p className="flex items-center gap-1.5 text-sm font-medium text-bone">
              <MapPin size={13} className="text-live" aria-hidden="true" />
              {trip.origin}
            </p>
            <p className="mt-1 text-[10px] text-mist/50">17.385°N · 78.486°E</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-mist/50">Destination</p>
            <p className="flex items-center gap-1.5 text-sm font-medium text-bone">
              <Flag size={13} className="text-ember" aria-hidden="true" />
              {trip.destination}
            </p>
            <p className="mt-1 text-[10px] text-mist/50">15.499°N · 73.828°E</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          {creator ? <Avatar name={creator.name} accent={creator.accent} size={38} /> : null}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-mist/50">Trip creator</p>
            <p className="font-display text-sm font-semibold text-bone">{trip.creator}</p>
          </div>
        </div>

        <ShareTrip trip={trip} />

        {role ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-mist/50">Your role</p>
              <p className="font-display text-sm font-semibold text-bone">{roleLabel(role)}</p>
            </div>
            {canManage && onManage ? (
              <Button variant="outline" size="sm" onClick={onManage}>
                <Settings size={14} aria-hidden="true" />
                Manage trip
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Drawer>
  )
}
