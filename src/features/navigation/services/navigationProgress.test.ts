import { describe, expect, it } from 'vitest'
import { computeNavigationProgress, instructionsAlongRoute } from './navigationProgress'
import type { GeoPoint, NavigationInstruction, RouteResult } from '../types'

function instruction(id: string, lat: number, lng: number, type: NavigationInstruction['type'] = 'turn'): NavigationInstruction {
  return {
    id,
    type,
    text: `step ${id}`,
    distanceMeters: 100,
    durationSeconds: 10,
    latitude: lat,
    longitude: lng,
    roadName: undefined,
  }
}

function makeRoute(): RouteResult {
  // Straight north-south polyline at lng 78.4867 from lat 17.385 → 17.394.
  // Four equal segments of ~250m: vertices at idx 0..4.
  const delta = (17.394 - 17.385) / 4
  const coordinates = [0, 1, 2, 3, 4].map((i) => ({
    latitude: 17.385 + delta * i,
    longitude: 78.4867,
  }))
  return {
    coordinates,
    distanceMeters: 1000,
    durationSeconds: 600,
    instructions: [
      instruction('step-0', coordinates[0].latitude, 78.4867, 'depart'),
      instruction('step-1', coordinates[1].latitude, 78.4867), // ~250m along.
      instruction('step-2', coordinates[2].latitude, 78.4867), // ~500m along.
      instruction('step-3', coordinates[4].latitude, 78.4867, 'arrive'), // ~1000m.
    ],
  }
}

describe('navigationProgress', () => {
  it('pins instructions to their distance along the route once', () => {
    const route = makeRoute()
    const cache = instructionsAlongRoute(route)
    const distances = cache.map((c) => c.distanceAlongRouteMeters)
    expect(distances[0]).toBeCloseTo(0, -1)
    expect(distances[1]).toBeCloseTo(250, -1)
    expect(distances[2]).toBeCloseTo(500, -1)
    expect(distances[3]).toBeCloseTo(1000, -1)
  })

  it('selects the first upcoming maneuver and reports the distance to it', () => {
    const route = makeRoute()
    const cache = instructionsAlongRoute(route)
    const atStart: GeoPoint = { latitude: 17.385, longitude: 78.4867 }
    const p = computeNavigationProgress(route, atStart, cache, 40)
    expect(p.currentInstruction?.id).toBe('step-1')
    expect(p.distanceToCurrentInstructionMeters).toBeCloseTo(250, -1)
    expect(p.nextInstruction?.id).toBe('step-2')
    expect(p.routeProgressPercent).toBeCloseTo(0)
    expect(p.distanceRemainingMeters).toBeCloseTo(1000, -2)
  })

  it('the distance to the maneuver shrinks as the rider advances', () => {
    const route = makeRoute()
    const cache = instructionsAlongRoute(route)
    const far: GeoPoint = { latitude: 17.3856, longitude: 78.4867 } // ~133m along (~117m to turn).
    const close: GeoPoint = { latitude: 17.3868, longitude: 78.4867 } // ~200m along (~50m to turn).
    const a = computeNavigationProgress(route, far, cache, 40)
    const b = computeNavigationProgress(route, close, cache, 40)
    expect(b.distanceToCurrentInstructionMeters as number).toBeLessThan(a.distanceToCurrentInstructionMeters as number)
  })

  it('completes a maneuver and promotes the next one', () => {
    const route = makeRoute()
    const cache = instructionsAlongRoute(route)
    // Well before step-1's 250m marker (over the 40m completion threshold out).
    const before: GeoPoint = { latitude: 17.3858, longitude: 78.4867 } // ~90m along.
    expect(computeNavigationProgress(route, before, cache, 40).currentInstruction?.id).toBe('step-1')
    // At the marker (within completion threshold) → next instruction promotes.
    const at: GeoPoint = { latitude: 17.38725, longitude: 78.4867 }
    const p = computeNavigationProgress(route, at, cache, 40)
    expect(p.currentInstruction?.id).toBe('step-2')
    expect(p.nextInstruction?.id).toBe('step-3')
  })

  it('handles a route with no instructions defensively', () => {
    const route = makeRoute()
    const cache = instructionsAlongRoute({ ...route, instructions: [] })
    const p = computeNavigationProgress({ ...route, instructions: [] }, { latitude: 17.385, longitude: 78.4867 }, cache, 40)
    expect(p.currentInstruction).toBeNull()
    expect(p.nextInstruction).toBeNull()
    expect(p.distanceToCurrentInstructionMeters).toBeNull()
    expect(p.distanceRemainingMeters).toBeCloseTo(1000, -2)
  })

  it('computes remaining duration + a projected ETA', () => {
    const route = makeRoute()
    const cache = instructionsAlongRoute(route)
    const p = computeNavigationProgress(route, makeRoute().coordinates[0], cache, 40, Date.UTC(2026, 8, 5, 10, 0))
    expect(p.durationRemainingSeconds).toBeCloseTo(600, -2)
    expect(p.etaEpochMs).toBeCloseTo(Date.UTC(2026, 8, 5, 10, 10), -3)
  })

  it('reports full progress at the destination', () => {
    const route = makeRoute()
    const cache = instructionsAlongRoute(route)
    const end: GeoPoint = { latitude: 17.394, longitude: 78.4867 }
    const p = computeNavigationProgress(route, end, cache, 40)
    expect(p.distanceRemainingMeters).toBeLessThan(1)
    expect(p.routeProgressPercent).toBeGreaterThan(99.9)
  })
})