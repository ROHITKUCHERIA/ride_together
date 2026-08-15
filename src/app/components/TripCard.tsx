import { CalendarRange, Crown, MapPin, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { TripStatusBadge } from '../../components/ui/StatusBadge'
import { formatTripDate } from '../tripInfo'
import type { Trip } from '../../types/api'

export default function TripCard({ trip, isCreator = false }: { trip: Trip; isCreator?: boolean }) {
  return (
    <Link
      to={`/app/trips/${trip.id}`}
      className="group flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition hover:border-ember/40 hover:bg-white/[0.06] focus-visible:outline-2 focus-visible:outline-ember sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-display text-lg font-bold text-bone">{trip.name}</h3>
          <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-mist/75">
            <MapPin size={13} className="shrink-0 text-ember" aria-hidden="true" />
            {trip.startLocation || 'Start'} → {trip.destination}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <TripStatusBadge status={trip.status} />
          {isCreator ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-ember/40 bg-ember/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-ember">
              <Crown size={10} aria-hidden="true" />
              Owner
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-white/8 pt-3.5 text-xs text-mist/70">
        <span className="inline-flex items-center gap-1.5 [overflow-wrap:anywhere]">
          <CalendarRange size={13} className="shrink-0 text-sunset" aria-hidden="true" />
          <span className="min-w-0">
            {formatTripDate(trip.startDate)} – {formatTripDate(trip.endDate)}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Users size={13} className="shrink-0 text-mist/60" aria-hidden="true" />
          {trip._count.members} {trip._count.members === 1 ? 'rider' : 'riders'}
        </span>
      </div>
    </Link>
  )
}