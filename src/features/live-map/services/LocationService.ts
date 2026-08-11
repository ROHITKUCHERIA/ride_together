import type { GpsError, GpsErrorKind, LocationUpdate } from '../types'
import {
  GPS_MAXIMUM_AGE_MS,
  GPS_TIMEOUT_MS,
  LOCATION_UPDATE_INTERVAL_MS,
  MIN_ACCURACY_METERS,
  MIN_DISTANCE_METERS,
} from '../config'

const ERROR_MESSAGES: Record<GpsErrorKind, string> = {
  permission_denied:
    'Location access was denied. Enable location for this site in your browser settings to share your position.',
  position_unavailable:
    'Your position could not be determined. Check your GPS signal and try again.',
  timeout:
    'Timed out waiting for a GPS fix. Move to an open area and try again.',
  network: 'You are offline. Your position will sync once the connection returns.',
  unsupported:
    'This browser does not support location sharing. Try a modern browser to join the live map.',
}

export interface LocationService {
  start(callbacks: {
    onUpdate: (update: LocationUpdate) => void
    onError: (error: GpsError) => void
  }): () => void
}

/**
 * Browser-geolocation based service. Client-side throttling is only for UX —
 * the future backend enforces its own limits. Frontend never trusts the
 * userId/tripId embedded in a payload.
 */
export class BrowserLocationService implements LocationService {
  private lastSent: LocationUpdate | null = null
  private lastSentAt = 0
  private watchId: number | null = null
  private enabled = false

  start({ onUpdate, onError }: { onUpdate: (update: LocationUpdate) => void; onError: (error: GpsError) => void }): () => void {
    const geo = navigator.geolocation
    if (!geo) {
      onError({ kind: 'unsupported', message: ERROR_MESSAGES.unsupported })
      return () => {}
    }

    this.enabled = true
    this.lastSent = null
    this.lastSentAt = 0

    const send = (pos: GeolocationPosition) => {
      if (!this.enabled) return
      const update: LocationUpdate = {
        userId: '', // injected by the controller from trusted app state
        tripId: '',
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        speed: pos.coords.speed ?? null,
        heading: pos.coords.heading ?? null,
        timestamp: pos.timestamp,
      }

      const now = Date.now()
      const withinInterval = now - this.lastSentAt < LOCATION_UPDATE_INTERVAL_MS
      const movedEnough =
        !this.lastSent ||
        calculateDistance(
          this.lastSent.latitude,
          this.lastSent.longitude,
          update.latitude,
          update.longitude,
        ) >= MIN_DISTANCE_METERS
      const accurateEnough = update.accuracy <= MIN_ACCURACY_METERS

      if (withinInterval && !movedEnough) return

      if (accurateEnough) {
        this.lastSent = update
        this.lastSentAt = now
      }
      onUpdate(update)
    }

    const fail = (kind: GpsErrorKind) => {
      if (!this.enabled) return
      onError({ kind, message: ERROR_MESSAGES[kind] })
    }

    this.watchId = geo.watchPosition(
      send,
      (err) => {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            fail('permission_denied')
            break
          case err.POSITION_UNAVAILABLE:
            fail('position_unavailable')
            break
          case err.TIMEOUT:
            fail('timeout')
            break
          default:
            fail('position_unavailable')
        }
      },
      { enableHighAccuracy: true, timeout: GPS_TIMEOUT_MS, maximumAge: GPS_MAXIMUM_AGE_MS },
    )

    return () => {
      this.enabled = false
      if (this.watchId !== null) geo.clearWatch(this.watchId)
      this.watchId = null
    }
  }
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const R = 6_371_000
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
