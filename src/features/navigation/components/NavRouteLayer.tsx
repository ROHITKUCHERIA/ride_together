import { Marker, Polyline } from 'react-leaflet'
import { buildDestinationPin } from '../../live-map/components/markers'
import type { NavigationStatus, RouteResult } from '../types'

interface NavRouteLayerProps {
  route: RouteResult
  status: NavigationStatus
}

const ROUTE_COLOR = '#4a9eff'
const ROUTE_GLOW = 'rgba(74,158,255,0.25)'

/**
 * Draws the navigation route (solid blue — distinct from the group's dashed
 * orange trip line) plus the single destination pin. No origin pin: the blue
 * position dot sits exactly on the route start, so a pin there would only
 * stack a duplicate. Rendered alongside the rider markers; it never hides or
 * removes group ride content.
 */
export default function NavRouteLayer({ route, status }: NavRouteLayerProps) {
  const coordinates = route.coordinates
  if (coordinates.length < 2) return null

  const positions = coordinates.map(
    (c) => [c.latitude, c.longitude] as [number, number],
  )
  const destination = coordinates[coordinates.length - 1]
  const active = status === 'navigating' || status === 'completed'

  return (
    <>
      <Polyline
        positions={positions}
        interactive={false}
        pathOptions={{
          color: ROUTE_COLOR,
          weight: active ? 6 : 5,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      <Polyline
        positions={positions}
        interactive={false}
        pathOptions={{
          color: ROUTE_GLOW,
          weight: active ? 12 : 10,
          opacity: 0.35,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      <Marker
        position={[destination.latitude, destination.longitude]}
        icon={buildDestinationPin(active ? 'GO' : 'DEST')}
        interactive={false}
      />
    </>
  )
}