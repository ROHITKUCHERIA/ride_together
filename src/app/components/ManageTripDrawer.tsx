import { useState } from 'react'
import {
  AlertTriangle,
  CalendarX2,
  CheckCircle2,
  Crown,
  DoorOpen,
  Flag,
  Pencil,
  Play,
  Trash2,
  UserMinus,
  Copy,
  Check,
  Loader2,
} from 'lucide-react'
import Drawer from '../../components/Drawer'
import Button from '../../components/ui/Button'
import Avatar from '../../components/Avatar'
import { MemberRoleBadge, TripStatusBadge } from '../../components/ui/StatusBadge'
import TripFormModal from './TripFormModal'
import {
  cancelTrip,
  completeTrip,
  deleteTrip,
  leaveTrip,
  removeMember,
  startTrip,
  transferOwnership,
  updateMemberRole,
  updateTrip,
} from '../../api/trips'
import { isApiError } from '../../lib/errors'
import type { CreateTripInput, MemberRole, Trip, TripMember } from '../../types/api'

interface ManageTripDrawerProps {
  open: boolean
  onClose: () => void
  trip: Trip
  role: MemberRole | undefined
  members: TripMember[]
  currentUserId: string
  onRefresh: () => Promise<void>
  onDeleted: () => void
}

const ACCENTS = ['#ff6b2c', '#3ddc84', '#4dc4ff', '#ffb14d', '#e0242f', '#c084fc', '#34d399', '#22d3ee', '#f472b6']

function accentFor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h << 5) - h + id.charCodeAt(i)
  return ACCENTS[Math.abs(h) % ACCENTS.length]
}

export default function ManageTripDrawer({
  open,
  onClose,
  trip,
  role,
  members,
  currentUserId,
  onRefresh,
  onDeleted,
}: ManageTripDrawerProps) {
  const isOwner = role === 'OWNER'
  const isAdmin = role === 'ADMIN'
  const canManage = isOwner || isAdmin

  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const run = async (action: string, fn: () => Promise<void>, refresh = true) => {
    setBusy(action)
    setError(null)
    try {
      await fn()
      if (refresh) await onRefresh()
    } catch (err) {
      setError(isApiError(err) ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(null)
      setConfirming(null)
    }
  }

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(trip.inviteCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard unavailable */
    }
  }

  const statusActions: { label: string; icon: typeof Play; action: string; fn: () => Promise<void> }[] = []
  if (canManage) {
    if (trip.status === 'PLANNED') {
      statusActions.push({ label: 'Start trip', icon: Play, action: 'status:start', fn: () => startTrip(trip.id) })
      statusActions.push({ label: 'Cancel trip', icon: CalendarX2, action: 'status:cancel', fn: () => cancelTrip(trip.id) })
    } else if (trip.status === 'ACTIVE') {
      statusActions.push({ label: 'Complete trip', icon: CheckCircle2, action: 'status:complete', fn: () => completeTrip(trip.id) })
      statusActions.push({ label: 'Cancel trip', icon: CalendarX2, action: 'status:cancel', fn: () => cancelTrip(trip.id) })
    }
  }

  const canManageMember = (m: TripMember): boolean => {
    if (m.id === currentUserId) return false
    if (m.role === 'OWNER') return false
    if (isOwner) return true
    if (isAdmin) return m.role === 'MEMBER'
    return false
  }

  const handleRoleChange = (m: TripMember, next: MemberRole) => {
    void run(`role:${m.id}`, () => updateMemberRole(trip.id, m.id, next))
  }

  const handleDelete = () => {
    if (confirming !== 'delete') {
      setConfirming('delete')
      return
    }
    void run(
      'delete',
      async () => {
        await deleteTrip(trip.id)
        onDeleted()
      },
      false,
    )
  }

  const handleLeave = () => {
    if (confirming !== 'leave') {
      setConfirming('leave')
      return
    }
    void run(
      'leave',
      async () => {
        await leaveTrip(trip.id)
        onDeleted()
      },
      false,
    )
  }

  const handleTransfer = (m: TripMember) => {
    if (confirming !== `transfer:${m.id}`) {
      setConfirming(`transfer:${m.id}`)
      return
    }
    void run(`transfer:${m.id}`, () => transferOwnership(trip.id, m.id))
  }

  return (
    <Drawer open={open} onClose={onClose} title="Manage trip" eyebrow="Trip controls">
      <div className="flex flex-col gap-6">
        {error ? (
          <p role="alert" className="rounded-xl border border-road/35 bg-road/10 px-3.5 py-2.5 text-sm text-road">
            {error}
          </p>
        ) : null}

        {/* summary */}
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="min-w-0">
            <p className="truncate font-display text-base font-bold text-bone">{trip.name}</p>
            <p className="mt-0.5 truncate text-xs text-mist/70">
              {trip.startLocation || 'Start'} → {trip.destination}
            </p>
          </div>
          <TripStatusBadge status={trip.status} />
        </div>

        {/* invite code */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-mist/60">Invite code</p>
          <button
            type="button"
            onClick={copyInvite}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/12 bg-night/60 px-4 py-3 text-left transition hover:border-ember/40 focus-visible:outline-2 focus-visible:outline-ember"
            aria-label="Copy invite code"
          >
            <span className="font-display text-lg font-bold tracking-[0.2em] text-ember">{trip.inviteCode}</span>
            {copied ? <Check size={16} className="text-live" aria-hidden="true" /> : <Copy size={16} className="text-mist/60" aria-hidden="true" />}
          </button>
        </div>

        {/* status actions */}
        {statusActions.length > 0 ? (
          <div>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-mist/60">Trip status</p>
            <div className="grid grid-cols-2 gap-2">
              {statusActions.map((action) => {
                const Icon = action.icon
                return (
                  <Button
                    key={action.action}
                    variant={action.label.startsWith('Cancel') ? 'danger' : 'ember'}
                    loading={busy === action.action}
                    disabled={busy !== null && busy !== action.action}
                    onClick={() => void run(action.action, action.fn)}
                  >
                    <Icon size={15} aria-hidden="true" />
                    {action.label}
                  </Button>
                )
              })}
            </div>
          </div>
        ) : null}

        {/* edit */}
        {canManage ? (
          <div>
            <Button variant="outline" block onClick={() => setEditOpen(true)}>
              <Pencil size={15} aria-hidden="true" />
              Edit trip details
            </Button>
          </div>
        ) : null}

        {/* members */}
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-mist/60">
            Members · {members.length}
          </p>
          <ul className="space-y-2">
            {members.map((m) => {
              const isMe = m.id === currentUserId
              const manageable = canManageMember(m)
              const transferPending = confirming === `transfer:${m.id}`
              const busyRole = busy === `role:${m.id}`
              const busyRemove = busy === `remove:${m.id}`
              return (
                <li key={m.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <Avatar name={m.name} accent={accentFor(m.id)} size={40} />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 font-display text-sm font-medium text-bone">
                        <span className="truncate">{m.name}</span>
                        {isMe ? <span className="rounded-full border border-ember/40 bg-ember/15 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-ember">You</span> : null}
                        {m.role === 'OWNER' ? <Crown size={13} className="shrink-0 text-ember" aria-hidden="true" /> : null}
                      </p>
                      <MemberRoleBadge role={m.role} />
                    </div>
                    {manageable ? (
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <select
                          aria-label={`Change ${m.name}'s role`}
                          value={m.role}
                          disabled={busy !== null}
                          onChange={(e) => handleRoleChange(m, e.target.value as MemberRole)}
                          className="min-h-9 rounded-lg border border-white/12 bg-night/60 px-2 text-xs font-medium text-bone outline-none transition focus:border-ember disabled:opacity-50"
                        >
                          <option value="MEMBER">Member</option>
                          <option value="ADMIN">Admin</option>
                        </select>
                        {isOwner ? (
                          <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => handleTransfer(m)}
                            className={`inline-flex min-h-9 items-center gap-1 rounded-lg border px-2.5 text-[10px] font-semibold uppercase tracking-wider transition focus-visible:outline-2 focus-visible:outline-ember disabled:opacity-50 ${
                              transferPending ? 'border-ember/50 bg-ember/15 text-ember' : 'border-white/12 bg-white/5 text-mist hover:text-bone'
                            }`}
                            aria-label={transferPending ? `Confirm transfer to ${m.name}` : `Transfer ownership to ${m.name}`}
                          >
                            <Crown size={12} aria-hidden="true" />
                            {transferPending ? 'Confirm' : 'Owner'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void run(`remove:${m.id}`, () => removeMember(trip.id, m.id))}
                          className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-white/12 bg-white/5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-mist transition hover:border-road/40 hover:text-road focus-visible:outline-2 focus-visible:outline-road disabled:opacity-50"
                          aria-label={`Remove ${m.name}`}
                        >
                          {busyRemove ? (
                            <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                          ) : (
                            <UserMinus size={12} aria-hidden="true" />
                          )}
                          Remove
                        </button>
                      </div>
                    ) : isMe && !isOwner ? (
                      <span className="shrink-0 text-[10px] uppercase tracking-wider text-mist/40">You</span>
                    ) : null}
                  </div>
                  {busyRole ? (
                    <p className="mt-2 text-[11px] text-mist/60">Updating role…</p>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>

        {/* danger zone */}
        <div className="flex flex-col gap-3 border-t border-white/8 pt-5">
          {isOwner ? (
            <Button
              variant="danger"
              block
              loading={busy === 'delete'}
              disabled={busy !== null && busy !== 'delete'}
              onClick={handleDelete}
            >
              {confirming === 'delete' ? (
                <>
                  <AlertTriangle size={15} aria-hidden="true" />
                  Confirm delete? This can't be undone.
                </>
              ) : (
                <>
                  <Trash2 size={15} aria-hidden="true" />
                  Delete trip
                </>
              )}
            </Button>
          ) : (
            <Button
              variant="danger"
              block
              loading={busy === 'leave'}
              disabled={busy !== null && busy !== 'leave'}
              onClick={handleLeave}
            >
              {confirming === 'leave' ? (
                <>
                  <AlertTriangle size={15} aria-hidden="true" />
                  Confirm leave?
                </>
              ) : (
                <>
                  <DoorOpen size={15} aria-hidden="true" />
                  Leave trip
                </>
              )}
            </Button>
          )}
          {!isOwner ? (
            <p className="text-center text-[11px] text-mist/50">
              {isAdmin ? 'Admins can manage members and trip status.' : 'As a member you can view the trip and the live map.'}
            </p>
          ) : (
            <p className="flex items-center justify-center gap-1.5 text-[11px] text-mist/50">
              <Flag size={11} aria-hidden="true" />
              Owner — transfer ownership to hand over the trip.
            </p>
          )}
        </div>
      </div>

      <TripFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        mode="edit"
        initial={trip}
        onSubmit={async (input: CreateTripInput) => {
          await updateTrip(trip.id, input)
          setEditOpen(false)
        }}
      />
    </Drawer>
  )
}