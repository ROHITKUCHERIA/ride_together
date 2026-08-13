import { useCallback, useEffect, useState } from 'react'
import { MapPinPlus, TicketPlus, Compass, Plus } from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AppHeader from '../AppHeader'
import Button from '../../components/ui/Button'
import Spinner from '../../components/ui/Spinner'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import TripCard from '../components/TripCard'
import TripFormModal from '../components/TripFormModal'
import JoinTripModal from '../components/JoinTripModal'
import { createTrip, joinTrip, listTrips } from '../../api/trips'
import { useAuth } from '../../auth/AuthContext'
import type { CreateTripInput, Trip } from '../../types/api'

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; trips: Trip[] }

export default function Dashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const inviteParam = searchParams.get('invite') ?? ''
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [createOpen, setCreateOpen] = useState(false)
  const [joinOpen, setJoinOpen] = useState(!!inviteParam)

  const load = useCallback(async () => {
    setState({ kind: 'loading' })
    try {
      const page = await listTrips(1, 50)
      setState({ kind: 'ready', trips: page.data })
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : 'Unable to load your trips.',
      })
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const closeJoin = () => {
    setJoinOpen(false)
    if (inviteParam) setSearchParams({}, { replace: true })
  }

  const handleCreate = async (input: CreateTripInput) => {
    const trip = await createTrip(input)
    setCreateOpen(false)
    navigate(`/app/trips/${trip.id}`)
  }

  const handleJoin = async (inviteCode: string) => {
    const trip = await joinTrip(inviteCode)
    setJoinOpen(false)
    navigate(`/app/trips/${trip.id}`)
  }

  return (
    <div className="min-h-dvh bg-night text-bone">
      <AppHeader
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => setJoinOpen(true)}>
              <TicketPlus size={14} aria-hidden="true" />
              <span className="hidden sm:inline">Join</span>
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus size={14} aria-hidden="true" />
              <span className="hidden sm:inline">New Trip</span>
            </Button>
          </>
        }
      />

      <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8 sm:px-6">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-mist/60">Dashboard</p>
            <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-bone sm:text-3xl">
              {user?.name ? `Hey ${user.name.split(' ')[0]},` : 'My trips'}
            </h1>
          </div>
          <div className="hidden gap-2 sm:flex">
            <Button variant="outline" onClick={() => setJoinOpen(true)}>
              <TicketPlus size={15} aria-hidden="true" /> Join Trip
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <MapPinPlus size={15} aria-hidden="true" /> Create Trip
            </Button>
          </div>
        </div>

        {state.kind === 'loading' ? (
          <Spinner label="Loading your trips..." />
        ) : state.kind === 'error' ? (
          <ErrorState message={state.message} onRetry={load} />
        ) : state.trips.length === 0 ? (
          <EmptyState
            icon={<Compass size={26} />}
            title="No trips yet"
            description="Start a new ride or join one with an invite code."
            action={
              <>
                <Button variant="outline" onClick={() => setJoinOpen(true)}>
                  <TicketPlus size={15} aria-hidden="true" /> Join Trip
                </Button>
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus size={15} aria-hidden="true" /> Create Trip
                </Button>
              </>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {state.trips.map((trip) => (
              <TripCard key={trip.id} trip={trip} isCreator={trip.createdBy === user?.id} />
            ))}
          </div>
        )}
      </main>

      <TripFormModal open={createOpen} onClose={() => setCreateOpen(false)} mode="create" onSubmit={handleCreate} />
      <JoinTripModal open={joinOpen} onClose={closeJoin} onSubmit={handleJoin} initialCode={inviteParam} />
    </div>
  )
}