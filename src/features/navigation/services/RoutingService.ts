import { apiRequest } from '../../../lib/apiClient'
import { getAccessToken } from '../../../lib/tokens'
import { fetchRoadRoute } from '../../live-map/services/routing'
import type { GeoPoint, NavigationInstruction, RouteResult } from '../types'
import type { RoadInstruction } from '../../live-map/services/routing'

export type RoutingErrorCode = 'INVALID_DESTINATION' | 'ROUTE_NOT_FOUND' | 'ROUTING_UNAVAILABLE'

/** User-facing routing error with a stable machine code. */
export class RoutingError extends Error {
  readonly code: RoutingErrorCode

  constructor(message: string, code: RoutingErrorCode = 'ROUTING_UNAVAILABLE') {
    super(message)
    this.name = 'RoutingError'
    this.code = code
  }
}

/**
 * Route calculation service. Accepts normalized points and returns a normalized
 * route — the caller never sees OSRM/GraphHopper response shapes.
 *
 * Authenticated sessions route through the RideTogether backend (POST
 * /api/navigation/route) so provider config + any keys stay server-side. The
 * unauthenticated demo path calls the keyless public OSRM endpoint directly,
 * isolated here so it can later be pointed at a self-hosted engine.
 */
export async function calculateRoute(
  origin: GeoPoint,
  destination: GeoPoint,
): Promise<RouteResult> {
  if (!origin || !destination || !isFinite(origin.latitude) || !isFinite(origin.longitude)) {
    throw new RoutingError('Choose a start point before navigating.', 'INVALID_DESTINATION')
  }
  if (!isFinite(destination.latitude) || !isFinite(destination.longitude)) {
    throw new RoutingError('Choose a valid destination to navigate to.', 'INVALID_DESTINATION')
  }

  if (hasSession()) {
    try {
      return await apiRequest<RouteResult>('/api/navigation/route', {
        method: 'POST',
        body: {
          origin: { latitude: origin.latitude, longitude: origin.longitude },
          destination: { latitude: destination.latitude, longitude: destination.longitude },
        },
        quiet: true,
      })
    } catch (err) {
      throw toRoutingError(err)
    }
  }
  return directRoute(origin, destination)
}

function toInstruction(step: RoadInstruction): NavigationInstruction {
  return {
    id: step.id,
    type: step.type as NavigationInstruction['type'],
    ...(step.modifier ? { modifier: step.modifier as NavigationInstruction['modifier'] } : {}),
    text: step.text,
    distanceMeters: step.distanceMeters,
    durationSeconds: step.durationSeconds,
    latitude: step.latitude,
    longitude: step.longitude,
    ...(step.roadName ? { roadName: step.roadName } : {}),
    ...(step.exitNumber !== undefined ? { exitNumber: step.exitNumber } : {}),
  }
}

async function directRoute(origin: GeoPoint, destination: GeoPoint): Promise<RouteResult> {
  const road = await fetchRoadRoute(
    [origin.latitude, origin.longitude],
    [destination.latitude, destination.longitude],
  )
  if (!road) {
    throw new RoutingError('No route could be found between these points. Try another destination.', 'ROUTE_NOT_FOUND')
  }
  return {
    coordinates: road.points.map(([latitude, longitude]) => ({ latitude, longitude })),
    distanceMeters: road.distanceMeters ?? 0,
    durationSeconds: road.durationSeconds ?? 0,
    geometry: undefined,
    instructions: (road.instructions ?? []).filter((s) => s.latitude !== 0 || s.longitude !== 0).map(toInstruction),
  }
}

/** No session (or storage unavailable, e.g. tests/SSR) → demo fallback path. */
function hasSession(): boolean {
  try {
    return !!getAccessToken()
  } catch {
    return false
  }
}

function toRoutingError(err: unknown): RoutingError {
  if (err instanceof RoutingError) return err
  const message = err instanceof Error && err.message ? err.message : 'Could not calculate a route. Try again in a moment.'
  const code: RoutingErrorCode = /no route|not found/i.test(message) ? 'ROUTE_NOT_FOUND' : 'ROUTING_UNAVAILABLE'
  return new RoutingError(message, code)
}