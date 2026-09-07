import type { GpsError, LocationUpdate } from '../types'
import { gpsStore } from '../state/gpsStore'
import { riderStore } from '../state/riderStore'
import { connectionStore } from '../state/connectionStore'
import { groupNavStore } from '../../navigation/state/groupNavStore'
import type { RealtimeService } from './RealtimeService'
import { MockRealtimeService } from './MockRealtimeService'
import { SocketRealtimeService } from './SocketRealtimeService'
import { USE_REALTIME_BACKEND } from '../config'
import { trip } from '../../../data/mockData'

/**
 * Owns the live map services. Authenticated trips always talk to the Socket.IO
 * backend with the signed-in user's JWT. The in-browser mock is only used for
 * the demo route (unless VITE_USE_REALTIME_BACKEND=true opts the demo into the
 * backend too). Identity never comes from inbound payloads — it is stamped by
 * the trusted backend context (mock mode stamps trusted demo ids).
 *
 * Group navigation mirrors ride the SAME connection: destination and per-rider
 * session broadcasts land directly in `groupNavStore`, so every feature on the
 * map (ETA strip, rider badges) reads the store, never the socket.
 */
class RideController {
  private realtime: RealtimeService | null = null
  private stopLocation: (() => void) | null = null
  private activeTripId: string | null = null

  init(tripId?: string, opts: { backend?: boolean } = {}): void {
    if (this.realtime) {
      // The same controller instance already targets this trip.
      if (this.activeTripId === (tripId ?? null)) return
      this.dispose()
    }
    this.activeTripId = tripId ?? null
    const useBackend = !!(opts.backend || USE_REALTIME_BACKEND)
    this.realtime = useBackend
      ? new SocketRealtimeService({ tripId })
      : new MockRealtimeService()

    this.realtime.onConnectionState((state) => connectionStore.set(state))
    this.realtime.onRiderLocations((riders) => {
      riderStore.setRiders(riders)
      gpsStore.setAccuracy(riders.find((r) => r.isMe)?.accuracy ?? null)
    })
    this.realtime.onGroupNavEvent((event, payload) => {
      groupNavStore.applyNavEvent(event, payload)
    })
    this.realtime.onTripDestination((payload) => {
      groupNavStore.applyDestination(payload.tripId, payload.destination)
    })

    this.realtime.connect(tripId)
  }

  startSharingLocation(): void {
    if (!this.realtime) return
    // Already watching (either a confirmed fix or a pending first fix) — do not
    // create a second watch or steal `stopLocation`.
    const mode = gpsStore.getState().mode
    if (mode === 'active' || mode === 'starting') return
    gpsStore.setMode('starting')
    this.stopLocation = this.realtime.locationService.start({
      onUpdate: (update) => {
        const id = this.identity()
        if (!id || !this.realtime) return
        // userId/tripId come from trusted app state, never from the payload.
        const trusted: LocationUpdate = {
          ...update,
          userId: id.userId,
          tripId: id.tripId,
        }
        gpsStore.setMode('active')
        gpsStore.setError(null)
        this.realtime.publishLocation(trusted)
      },
      onError: (error: GpsError) => {
        if (error.kind === 'network') {
          gpsStore.setMode('paused')
          gpsStore.setError(error.message)
          return
        }
        if (error.kind === 'permission_denied') {
          gpsStore.setMode('denied')
        } else if (error.kind === 'unsupported') {
          gpsStore.setMode('unsupported')
        } else {
          gpsStore.setMode('error')
        }
        gpsStore.setError(error.message)
      },
    })
  }

  pauseLocationSharing(): void {
    this.stopLocation?.()
    this.stopLocation = null
    this.realtime?.stopSharing()
    gpsStore.setMode('paused')
  }

  /** Exposes the Socket.IO transport when the room runs on the real backend,
   *  so other features (e.g. the Jam) subscribe/emit on the SAME socket instead
   *  of opening a second connection. Mock mode returns null (no Jam). */
  getSocketRealtime(): SocketRealtimeService | null {
    return this.realtime instanceof SocketRealtimeService ? this.realtime : null
  }

  dispose(): void {
    this.pauseLocationSharing()
    this.realtime?.disconnect()
    this.realtime = null
    this.activeTripId = null
    riderStore.clear()
    groupNavStore.reset()
    connectionStore.set('connected')
    gpsStore.setMode('inactive')
  }

  private identity(): { userId: string; tripId: string } | null {
    if (this.realtime instanceof SocketRealtimeService) {
      return this.realtime.identity
    }
    const me = trip.riders.find((r) => r.isMe)
    return { userId: me?.id ?? '', tripId: trip.id }
  }
}

export const rideController = new RideController()
