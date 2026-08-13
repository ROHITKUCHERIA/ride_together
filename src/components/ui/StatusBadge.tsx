import type { TripStatus } from '../../types/api'

const STATUS_META: Record<TripStatus, { label: string; dot: string; text: string; badge: string }> = {
  PLANNED: { label: 'Planned', dot: 'bg-sunset', text: 'text-sunset', badge: 'border-sunset/35 bg-sunset/10' },
  ACTIVE: { label: 'Active', dot: 'bg-live', text: 'text-live', badge: 'border-live/35 bg-live/10' },
  COMPLETED: { label: 'Completed', dot: 'bg-mist/60', text: 'text-mist', badge: 'border-white/15 bg-white/5' },
  CANCELLED: { label: 'Cancelled', dot: 'bg-road', text: 'text-road', badge: 'border-road/35 bg-road/10' },
}

export function TripStatusBadge({ status }: { status: TripStatus }) {
  const meta = STATUS_META[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${meta.badge} ${meta.text}`}
    >
      <span className={`size-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
      {meta.label}
    </span>
  )
}

export function MemberRoleBadge({ role }: { role: 'OWNER' | 'ADMIN' | 'MEMBER' }) {
  const meta =
    role === 'OWNER'
      ? { label: 'Owner', badge: 'border-ember/40 bg-ember/10 text-ember' }
      : role === 'ADMIN'
        ? { label: 'Admin', badge: 'border-sunset/35 bg-sunset/10 text-sunset' }
        : { label: 'Member', badge: 'border-white/12 bg-white/5 text-mist' }
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${meta.badge}`}>
      {meta.label}
    </span>
  )
}