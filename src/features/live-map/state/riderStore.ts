import { ObservableStore } from './observable'
import type { RiderLocation, TripLocationState } from '../types'

class RiderStore extends ObservableStore<TripLocationState> {
  constructor() {
    super({ riders: [], updatedAt: 0 })
  }

  /** Upsert a single rider location. No GPS history is retained. */
  applyUpdate(rider: RiderLocation): void {
    const state = this.getState()
    const existing = state.riders.find((r) => r.userId === rider.userId)
    const next = existing
      ? state.riders.map((r) => (r.userId === rider.userId ? { ...r, ...rider } : r))
      : [...state.riders, rider]
    this.setState({ riders: next, updatedAt: Date.now() })
  }

  /** Replace the whole set (reconnect / initial sync). */
  setRiders(riders: RiderLocation[]): void {
    this.setState({ riders, updatedAt: Date.now() })
  }

  clear(): void {
    this.setState({ riders: [], updatedAt: 0 })
  }
}

export const riderStore = new RiderStore()
