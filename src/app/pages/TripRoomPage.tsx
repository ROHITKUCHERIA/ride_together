import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import TripRoom from '../../components/TripRoom'
import FullPageLoader from '../../components/ui/FullPageLoader'
import ErrorState from '../../components/ui/ErrorState'
import Button from '../../components/ui/Button'
import { getTrip, getTripMembers } from '../../api/trips'
import { useAuth } from '../../auth/AuthContext'
import { toDemoTrip, tripMapRoute } from '../tripInfo'
import type { MemberRole, Trip, TripMember } from '../../types/api'

/** How often the member roster is re-fetched while the room is open. Set high
 *  enough that the free-tier backend is not hammered every few seconds. */
const MEMBER_POLL_MS = 30_000

export default function TripRoomPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [trip, setTrip] = useState<Trip | null>(null)
  const [members, setMembers] = useState<TripMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Guards against overlapping refresh requests when the backend is slow — a
  // poll tick is skipped while the previous one is still in flight.
  const inFlightRef = useRef(false)

  const fetchRoom = useCallback(async (): Promise<void> => {
    if (!tripId || inFlightRef.current) return
    inFlightRef.current = true
    try {
      // Reads are `quiet`: they skip the global loading overlay — this page
      // already shows its own loader for the first fetch, and the periodic
      // member poll must never flash a full-screen "Loading…" every cycle.
      const [t, m] = await Promise.all([
        getTrip(tripId, { quiet: true }),
        getTripMembers(tripId, { quiet: true }),
      ])
      if (t) setTrip(t)
      if (Array.isArray(m)) setMembers(m)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load this trip.')
    } finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }, [tripId])

  useEffect(() => {
    void fetchRoom()
  }, [fetchRoom])

  const refresh = fetchRoom

  /* The backend broadcasts location events but not membership changes. Poll
     the member roster while the room is open so newly joined riders appear in
     the Riders list, online counts and trip info without a manual refresh.
     The poll is quiet (never triggers the global loader), pauses when the tab
     is hidden or offline, and never overlaps itself. */
  const isEnded = trip?.status === 'COMPLETED' || trip?.status === 'CANCELLED'
  useEffect(() => {
    if (!tripId || isEnded) return
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return
      void refresh()
    }, MEMBER_POLL_MS)
    return () => window.clearInterval(id)
  }, [tripId, isEnded, refresh])

  const role = useMemo<MemberRole | undefined>(
    () => (members ?? []).find((m) => m.id === user?.id)?.role,
    [members, user?.id],
  )

  const derived = useMemo(
    () => (trip && user ? toDemoTrip(trip, members ?? [], user.id) : null),
    [trip, members, user],
  )

  const route = useMemo(() => (trip ? tripMapRoute(trip) : null), [trip])

  if (loading) return <FullPageLoader />

  if (error || !trip || !derived || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-night px-4">
        <div className="flex w-full max-w-md flex-col gap-3">
          <ErrorState title="Unable to load this trip" message={error ?? 'This trip is unavailable.'} onRetry={fetchRoom} />
          <Button variant="outline" block onClick={() => navigate('/app')}>
            Back to trips
          </Button>
        </div>
      </div>
    )
  }

  return (
    <TripRoom
      trip={derived}
      apiTrip={trip}
      role={role}
      members={members}
      currentUserId={user.id}
      tripId={trip.id}
      mapRoute={route ?? undefined}
      onBack={() => navigate('/app')}
      onRefresh={refresh}
      onDeleted={() => navigate('/app')}
    />
  )
}