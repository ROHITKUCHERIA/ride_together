import { useCallback, useEffect, useRef, useState } from 'react'
import type { Map as LeafletMap } from 'leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import { useNavigation } from '../hooks/useNavigation'
import { useGroupNavDriving } from '../hooks/useGroupNavDriving'
import { useGroupNav } from '../state/groupNavStore'
import { mapCamera } from '../../live-map/services/mapCamera'
import { FOLLOW_MIN_MOVE_METERS, NAV_CAMERA_PITCH_DEG } from '../../live-map/config'
import { NAV_GPS_POOR_ACCURACY_METERS } from '../config'
import NavigationHeader from './NavigationHeader'
import NavigationBottomSheet from './NavigationBottomSheet'
import NavigationBanner from './NavigationBanner'
import RecenterButton from './RecenterButton'

interface NavigationOverlayProps {
  onClose: () => void
  getMap: () => LeafletMap | null
  online: number
  total: number
}

/**
 * Full navigation chrome layered over the live map: maneuver header, follow +
 * recenter, status banner and the mobile-first bottom sheet. Riders, their
 * markers and the realtime store keep running underneath — group tracking
 * continues untouched.
 *
 * Follow behavior: while navigating the map pans with the rider. Any manual
 * pan/zoom cancels follow; ◎ Recenter resumes it.
 */
export default function NavigationOverlay({ onClose, getMap, online, total }: NavigationOverlayProps) {
  const nav = useNavigation()
  const group = useGroupNav()
  useGroupNavDriving()
  const fittedKeyRef = useRef<string | null>(null)
  const followRef = useRef(false)
  const [following, setFollowing] = useState(false)

  // Entering navigation requests location through the existing shared GPS
  // watcher (permission/error handling is already in the live-map flow).
  useEffect(() => {
    nav.openNavigation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Follow the rider while actively navigating.
  const isNavigating = nav.status === 'navigating'
  const pos = nav.position

  useEffect(() => {
    if (!isNavigating) {
      followRef.current = false
      setFollowing(false)
      return
    }
  }, [isNavigating])

  useEffect(() => {
    if (!pos || !followRef.current || !isNavigating) return
    // Google Maps style follow: the controller moves the Leaflet camera AND
    // applies heading-up bearing + tilt pitch in the same cycle (single source).
    const mode = mapCamera.getFollowMode()
    const wantHeadingUp = mode === 'heading-up' && nav.heading != null && !nav.gpsLost
    const poor = nav.gpsAccuracy != null && nav.gpsAccuracy > NAV_GPS_POOR_ACCURACY_METERS
    const bearing = wantHeadingUp && !poor ? mapCamera.headingToBearing(nav.heading as number) : 0
    const pitch = mode === 'heading-up' && !poor ? NAV_CAMERA_PITCH_DEG : 0
    const map = getMap()
    mapCamera.followLocation({
      center: [pos.latitude, pos.longitude],
      bearing,
      pitch,
      zoom: map?.getZoom(),
      minMoveMeters: FOLLOW_MIN_MOVE_METERS,
    })
  }, [pos, isNavigating, getMap, nav.heading, nav.gpsLost, nav.gpsAccuracy])

  // Manual map interaction cancels navigation follow (single source via controller).
  useEffect(() => {
    const map = getMap()
    if (!map) return
    const cancelFollow = () => {
      if (!followRef.current) return
      followRef.current = false
      setFollowing(false)
      mapCamera.setFollowMode('free')
    }
    map.on('dragstart', cancelFollow)
    map.on('zoomstart', cancelFollow)
    return () => {
      map.off('dragstart', cancelFollow)
      map.off('zoomstart', cancelFollow)
    }
  }, [getMap])

  const handleRecenter = useCallback(() => {
    followRef.current = true
    setFollowing(true)
    const pos = nav.position
    if (pos) {
      const poor = nav.gpsAccuracy != null && nav.gpsAccuracy > NAV_GPS_POOR_ACCURACY_METERS
      const wantHeadingUp = nav.heading != null && !nav.gpsLost && !poor
      // Restore follow + heading + tilt for THIS fix — subsequent GPS updates keep
      // the camera moving because the controller follow mode is active again.
      mapCamera.setFollowMode(wantHeadingUp ? 'heading-up' : 'follow')
      mapCamera.followLocation({
        center: [pos.latitude, pos.longitude],
        bearing: wantHeadingUp ? mapCamera.headingToBearing(nav.heading as number) : 0,
        pitch: wantHeadingUp ? NAV_CAMERA_PITCH_DEG : 0,
        zoom: getMap()?.getZoom(),
      })
    } else {
      nav.recenter(getMap())
    }
    // getMap is a stable module-level ref accessor from the map owner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nav])

  const handleClose = useCallback(() => {
    followRef.current = false
    onClose()
  }, [onClose])

  // Fit the map to the computed route once per DESTINATION (initial preview
  // only — a reroute never steals the navigation camera). While actively
  // navigating this same effect engages Google-style follow, which the
  // followLocation effect above keeps alive on every GPS tick.
  useEffect(() => {
    if (nav.status !== 'ready' && nav.status !== 'navigating') return
    const coords = nav.route?.coordinates
    if (!coords || coords.length < 2) return

    // Key on the destination so reroutes (same dest, new route) never re-fit.
    const key = nav.destination
      ? `${nav.destination.latitude.toFixed(5)},${nav.destination.longitude.toFixed(5)}`
      : null
    if (key && fittedKeyRef.current !== key) {
      fittedKeyRef.current = key
      const bounds: LatLngBoundsExpression = [
        [Math.min(...coords.map((c) => c.latitude)), Math.min(...coords.map((c) => c.longitude))],
        [Math.max(...coords.map((c) => c.latitude)), Math.max(...coords.map((c) => c.longitude))],
      ]
      const map = getMap()
      if (map) {
        map.fitBounds(bounds, {
          paddingTopLeft: [70, nav.status === 'navigating' ? 150 : 130],
          paddingBottomRight: [70, nav.status === 'navigating' ? 240 : 340],
          maxZoom: 14,
        })
      }
    }

    if (nav.status === 'navigating') {
      followRef.current = true
      setFollowing(true)
      mapCamera.setFollowMode(
        nav.heading != null && !nav.gpsLost ? 'heading-up' : 'follow',
      )
    }
  }, [nav.status, nav.route, nav.destination, nav.heading, nav.gpsLost, getMap])

  const currentInstruction =
    nav.status === 'navigating' && nav.progress?.currentInstruction
      ? nav.progress.currentInstruction
      : null
  const distanceToInstructionMeters =
    nav.progress?.distanceToCurrentInstructionMeters ?? null

  return (
    <div className="pointer-events-none absolute inset-0 z-[6]">
      <NavigationHeader
        online={online}
        total={total}
        status={nav.status}
        instruction={currentInstruction}
        distanceToInstructionMeters={distanceToInstructionMeters}
        voiceEnabled={nav.voiceEnabled}
        voiceSupported={nav.voiceSupported}
        onToggleVoice={nav.toggleVoice}
        onBack={handleClose}
      />

      <div className="pointer-events-auto absolute right-[max(env(safe-area-inset-right,0px),0.75rem)] top-1/2 z-[6] -translate-y-1/2 sm:right-[max(env(safe-area-inset-right,0px),1.25rem)]">
        <RecenterButton onRecenter={handleRecenter} following={following} />
      </div>

      {nav.status === 'navigating' ? (
        <NavigationBanner
          offRoute={nav.offRoute}
          rerouting={nav.rerouting}
          routeUpdated={nav.routeUpdated}
          gpsLost={nav.gpsLost}
          notice={nav.notice}
          onReroute={nav.reroute}
        />
      ) : null}

      <div className="absolute inset-x-0 bottom-0 z-[7] px-2 pb-[max(env(safe-area-inset-bottom,0px),0.5rem)] sm:px-4 sm:pb-3">
        <NavigationBottomSheet
          status={nav.status}
          destination={nav.destination}
          route={nav.route}
          error={nav.error}
          remainingDistanceMeters={nav.remainingDistanceMeters}
          remainingDurationSeconds={nav.remainingDurationSeconds}
          progress={nav.progress}
          groupDestination={group.destination}
          onUseGroupDestination={(d) =>
            nav.setDestination({ latitude: d.latitude, longitude: d.longitude, name: d.name })
          }
          onSelectDestination={(d) => nav.setDestination(d)}
          onClearDestination={nav.clearDestination}
          onStart={nav.startNavigation}
          onStop={nav.stopNavigation}
          onReroute={nav.reroute}
        />
      </div>
    </div>
  )
}