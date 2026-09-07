import type { GeoPoint, NavigationInstruction, NavigationProgress, RouteResult } from '../types'
import { projectOnRoute, remainingDurationSeconds, totalRouteLength } from '../utils/routeProgress'
import { clamp } from '../../live-map/utils/geo'

/** An instruction pinned to its distance-along-route for progress math. */
export interface InstructionAlongRoute {
  instruction: NavigationInstruction
  distanceAlongRouteMeters: number
}

/**
 * Resolve each instruction's coordinate onto the route polyline so we can ask
 * "how far along the route is the next turn?" without scanning the provider
 * steps on every GPS tick. Computed once per route, not per update.
 */
export function instructionsAlongRoute(route: RouteResult): InstructionAlongRoute[] {
  const coordinates = route.coordinates
  if (!coordinates || coordinates.length < 2) return []
  const instructions = route.instructions ?? []
  return instructions.map((instruction) => {
    const { distanceAlongRouteMeters } = projectOnRoute(
      { latitude: instruction.latitude, longitude: instruction.longitude },
      coordinates,
    )
    return { instruction, distanceAlongRouteMeters }
  })
}

/**
 * Turn-by-turn progress for a GPS position without recomputing the route.
 * `alongCache` is the precomputed instruction projection (pass the memoized
 * value from `instructionsAlongRoute`) so per-tick work stays O(polyline),
 * never O(provider-step-scan).
 */
export function computeNavigationProgress(
  route: RouteResult,
  position: GeoPoint,
  alongCache: InstructionAlongRoute[] | null,
  completionThresholdMeters: number,
  now = Date.now(),
): NavigationProgress {
  const coordinates = route.coordinates ?? []
  const cache = alongCache ?? instructionsAlongRoute(route)

  const { distanceAlongRouteMeters } =
    coordinates.length >= 2
      ? projectOnRoute(position, coordinates)
      : { distanceAlongRouteMeters: 0 }

  const totalMeters = coordinates.length >= 2 ? totalRouteLength(coordinates) : route.distanceMeters
  const distanceRemaining = Math.max(0, totalMeters - distanceAlongRouteMeters)
  const durationRemaining = remainingDurationSeconds(route, distanceRemaining)
  const routeProgressPercent =
    totalMeters > 0 ? clamp((distanceAlongRouteMeters / totalMeters) * 100, 0, 100) : 100

  // The current maneuver is the first one still ahead of the rider (beyond the
  // completion threshold). Once crossed, the next instruction takes over.
  let currentIndex = 0
  while (
    currentIndex < cache.length &&
    cache[currentIndex].distanceAlongRouteMeters <= distanceAlongRouteMeters + completionThresholdMeters
  ) {
    currentIndex++
  }
  if (currentIndex >= cache.length) currentIndex = Math.max(0, cache.length - 1)

  const current = cache[currentIndex] ?? null
  const next = currentIndex + 1 < cache.length ? cache[currentIndex + 1] : null
  const distanceToCurrent =
    current !== null ? Math.max(0, current.distanceAlongRouteMeters - distanceAlongRouteMeters) : null
  const distanceToNext =
    next !== null ? Math.max(0, next.distanceAlongRouteMeters - distanceAlongRouteMeters) : null

  return {
    distanceRemainingMeters: distanceRemaining,
    durationRemainingSeconds: durationRemaining,
    routeProgressPercent,
    currentInstructionIndex: currentIndex,
    currentInstruction: current?.instruction ?? null,
    nextInstruction: next?.instruction ?? null,
    distanceToCurrentInstructionMeters: distanceToCurrent,
    distanceToNextInstructionMeters: distanceToNext,
    etaEpochMs: now + durationRemaining * 1000,
  }
}