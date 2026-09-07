import type { LocationUpdate, RiderLocation, RealtimeConnection } from '../types'
import type { LocationService } from './LocationService'
import type {
  GroupDestination,
  NavigationSessionPayload,
} from '../../navigation/types'

export interface DestinationUpdatedPayload {
  tripId: string
  destination: GroupDestination | null
}

export interface RealtimeService {
  connect(tripId?: string): void
  disconnect(): void
  onRiderLocations(listener: (riders: RiderLocation[]) => void): () => void
  onConnectionState(listener: (state: RealtimeConnection) => void): () => void
  publishLocation(update: LocationUpdate): void
  /** Stop sharing the current rider's location (backend marks them offline). */
  stopSharing(): void

  /** Fires on every `navigation:*` group-nav broadcast (same trip room). */
  onGroupNavEvent(listener: (event: string, payload: NavigationSessionPayload) => void): () => void
  /** Fires when the Host sets/updates/clears the shared trip destination. */
  onTripDestination(listener: (payload: DestinationUpdatedPayload) => void): () => void

  readonly locationService: LocationService
}

export type { LocationService }