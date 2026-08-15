import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import TripRoom from '../../components/TripRoom'
import FullPageLoader from '../../components/ui/FullPageLoader'
import ErrorState from '../../components/ui/ErrorState'
import Button from '../../components/ui/Button'
import { getTrip, getTripMembers } from '../../api/trips'
import { useAuth } from '../../auth/AuthContext'
import { toDemoTrip, tripMapRoute } from '../tripInfo'
import type { MemberRole, Trip, TripMember } from '../../types/api'

export default function TripRoomPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [trip, setTrip] = useState<Trip | null>(null)
  const [members, setMembers] = useState<TripMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!tripId) return
    setLoading(true)
    setError(null)
    try {
      const [t, m] = await Promise.all([getTrip(tripId), getTripMembers(tripId)])
      if (!t || !Array.isArray(m)) {
        throw new Error('Unable to load this trip.')
      }
      setTrip(t)
      setMembers(m)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load this trip.')
    } finally {
      setLoading(false)
    }
  }, [tripId])

  useEffect(() => {
    void load()
  }, [load])

  const refresh = useCallback(async () => {
    if (!tripId) return
    try {
      const [t, m] = await Promise.all([getTrip(tripId), getTripMembers(tripId)])
      if (!t || !Array.isArray(m)) {
        throw new Error('Unable to load this trip.')
      }
      setTrip(t)
      setMembers(m)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load this trip.')
    }
  }, [tripId])

  /* The backend broadcasts location events but not membership changes. Poll
     the member roster while the room is open so newly joined riders appear in
     the Riders list, online counts and trip info without a manual refresh. */
  const isEnded = trip?.status === 'COMPLETED' || trip?.status === 'CANCELLED'
  useEffect(() => {
    if (!tripId || isEnded) return
    const id = window.setInterval(() => {
      void refresh()
    }, 10000)
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
          <ErrorState title="Unable to load this trip" message={error ?? 'This trip is unavailable.'} onRetry={load} />
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