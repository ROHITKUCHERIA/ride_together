import type { LocationUpdate, RiderLocation, RealtimeConnection } from '../types'
import type { LocationService } from './LocationService'

export interface RealtimeService {
  connect(tripId?: string): void
  disconnect(): void
  onRiderLocations(listener: (riders: RiderLocation[]) => void): () => void
  onConnectionState(listener: (state: RealtimeConnection) => void): () => void
  publishLocation(update: LocationUpdate): void
  /** Stop sharing the current rider's location (backend marks them offline). */
  stopSharing(): void
  readonly locationService: LocationService
}

export type { LocationService }
