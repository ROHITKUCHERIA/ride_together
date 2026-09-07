import { useNavigation } from '../hooks/useNavigation'
import DestinationClickCatcher from './DestinationClickCatcher'
import NavigationPositionMarker from './NavigationPositionMarker'
import NavRouteLayer from './NavRouteLayer'

/**
 * Map-level children for navigation mode — renders inside the Leaflet
 * MapContainer alongside the existing RouteLayer and rider markers so the live
 * group map and navigation coexist on the same canvas.
 */
export default function NavigationMapLayers() {
  const nav = useNavigation()

  const pickEnabled =
    nav.status === 'idle' ||
    nav.status === 'locating' ||
    nav.status === 'ready' ||
    nav.status === 'error'

  return (
    <>
      <DestinationClickCatcher enabled={pickEnabled} onPick={nav.handleMapClick} />
      {nav.route && nav.route.coordinates.length >= 2 ? (
        <NavRouteLayer
          route={nav.route}
          status={nav.status}
        />
      ) : null}
      {nav.position ? <NavigationPositionMarker position={nav.position} heading={nav.heading} /> : null}
    </>
  )
}