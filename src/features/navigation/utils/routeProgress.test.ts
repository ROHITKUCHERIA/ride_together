import { describe, expect, it } from 'vitest'
import {
  isArrived,
  isOffRoute,
  projectOnRoute,
  remainingDurationSeconds,
  remainingRouteMeters,
  totalRouteLength,
} from './routeProgress'
import type { RouteResult } from '../types'

const ROUTE: RouteResult = {
  coordinates: [
    { latitude: 17.385, longitude: 78.4867 },
    { latitude: 17.3895, longitude: 78.4867 },
    { latitude: 17.394, longitude: 78.4867 },
  ],
  distanceMeters: 1000,
  durationSeconds: 900,
  instructions: [],
}

describe('routeProgress', () => {
  it('computes total route length from the polyline', () => {
    const total = totalRouteLength(ROUTE.coordinates)
    expect(total).toBeGreaterThan(0)
    expect(total).toBeCloseTo(ROUTE.distanceMeters, -2)
  })

  it('projects a point on the route with ~0 distance to route', () => {
    const on = projectOnRoute(ROUTE.coordinates[0], ROUTE.coordinates)
    expect(on.distanceToRouteMeters).toBeLessThan(0.001)
    expect(on.distanceAlongRouteMeters).toBe(0)
  })

  it('measures distance for a point offset from the route', () => {
    const off = projectOnRoute({ latitude: 17.39, longitude: 78.485 }, ROUTE.coordinates)
    expect(off.distanceToRouteMeters).toBeGreaterThan(0)
  })

  it('remaining distance shrinks as the rider advances', () => {
    const atStart = remainingRouteMeters(ROUTE, ROUTE.coordinates[0])
    const nearEnd = remainingRouteMeters(ROUTE, ROUTE.coordinates[ROUTE.coordinates.length - 1])
    expect(atStart).toBeCloseTo(totalRouteLength(ROUTE.coordinates), -2)
    expect(nearEnd).toBeLessThan(50)
    expect(atStart).toBeGreaterThan(nearEnd)
  })

  it('remaining duration scales with remaining distance', () => {
    const half = remainingDurationSeconds(ROUTE, ROUTE.distanceMeters / 2)
    expect(half).toBeCloseTo(450, -1)
    expect(remainingDurationSeconds(ROUTE, 0)).toBe(0)
  })

  it('detects arrival within the threshold', () => {
    expect(isArrived(ROUTE.coordinates[ROUTE.coordinates.length - 1], { ...ROUTE.coordinates[ROUTE.coordinates.length - 1] }, 50)).toBe(true)
    expect(isArrived(ROUTE.coordinates[0], ROUTE.coordinates[ROUTE.coordinates.length - 1], 50)).toBe(false)
  })

  it('detects off-route points', () => {
    expect(isOffRoute(ROUTE.coordinates[1], ROUTE, 20)).toBe(false)
    expect(isOffRoute({ latitude: 17.39, longitude: 78.5 }, ROUTE, 20)).toBe(true)
  })

  it('handles empty routes defensively', () => {
    const empty: RouteResult = { ...ROUTE, coordinates: [], distanceMeters: 100 }
    expect(isOffRoute({ latitude: 0, longitude: 0 }, empty, 20)).toBe(false)
    expect(remainingRouteMeters(empty, { latitude: 0, longitude: 0 })).toBe(100)
  })
})