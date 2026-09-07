import { calculateDistanceInMeters } from '../../live-map/utils/geo'
import type { GeoPoint, NavigationDestination, RouteResult } from '../types'

export interface RouteProjection {
  /** Index of the segment the projection lands on. */
  index: number
  /** Shortest distance from the point to the route polyline (m). */
  distanceToRouteMeters: number
  /** Distance along the polyline from its start to the projection point (m). */
  distanceAlongRouteMeters: number
}

/** Total length of a route polyline in meters. */
export function totalRouteLength(coordinates: GeoPoint[]): number {
  let total = 0
  for (let i = 0; i < coordinates.length - 1; i++) {
    total += segmentLength(coordinates[i], coordinates[i + 1])
  }
  return total
}

function segmentLength(a: GeoPoint, b: GeoPoint): number {
  return calculateDistanceInMeters(a.latitude, a.longitude, b.latitude, b.longitude)
}

/**
 * Project a point onto the route polyline (planar approximation per segment —
 * segments are short, so curvature error is negligible). Returns the closest
 * segment, the perpendicular distance, and the distance along the route.
 */
export function projectOnRoute(point: GeoPoint, coordinates: GeoPoint[]): RouteProjection {
  if (coordinates.length === 0) {
    return { index: 0, distanceToRouteMeters: Infinity, distanceAlongRouteMeters: 0 }
  }
  if (coordinates.length === 1) {
    return {
      index: 0,
      distanceToRouteMeters: segmentLength(point, coordinates[0]),
      distanceAlongRouteMeters: 0,
    }
  }

  let bestIndex = 0
  let bestDist = Infinity
  let bestAlong = 0
  let cumulative = 0

  for (let i = 0; i < coordinates.length - 1; i++) {
    const a = coordinates[i]
    const b = coordinates[i + 1]
    const { distance, along } = projectOnSegment(point, a, b)
    if (distance < bestDist) {
      bestDist = distance
      bestIndex = i
      bestAlong = cumulative + along
    }
    cumulative += segmentLength(a, b)
  }

  return {
    index: bestIndex,
    distanceToRouteMeters: bestDist,
    distanceAlongRouteMeters: bestAlong,
  }
}

function projectOnSegment(
  p: GeoPoint,
  a: GeoPoint,
  b: GeoPoint,
): { distance: number; along: number } {
  const dx = b.latitude - a.latitude
  const dy = b.longitude - a.longitude
  const lenSq = dx * dx + dy * dy
  let t = lenSq === 0 ? 0 : ((p.latitude - a.latitude) * dx + (p.longitude - a.longitude) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const proj: GeoPoint = { latitude: a.latitude + dx * t, longitude: a.longitude + dy * t }
  return {
    distance: calculateDistanceInMeters(p.latitude, p.longitude, proj.latitude, proj.longitude),
    along: calculateDistanceInMeters(a.latitude, a.longitude, proj.latitude, proj.longitude),
  }
}

/** Remaining distance to the destination while riding along the route (m). */
export function remainingRouteMeters(route: RouteResult, point: GeoPoint): number {
  const coordinates = route.coordinates
  if (coordinates.length < 2) return Math.max(0, route.distanceMeters)
  const { distanceAlongRouteMeters } = projectOnRoute(point, coordinates)
  return Math.max(0, totalRouteLength(coordinates) - distanceAlongRouteMeters)
}

/** Projected remaining time, proportional to the remaining distance. */
export function remainingDurationSeconds(route: RouteResult, remainingMeters: number): number {
  if (!Number.isFinite(route.distanceMeters) || route.distanceMeters <= 0) return route.durationSeconds
  return Math.max(0, Math.round(route.durationSeconds * (remainingMeters / route.distanceMeters)))
}

/** Straight-line distance from a point to the destination (m). */
export function distanceToDestinationMeters(point: GeoPoint, destination: NavigationDestination): number {
  return calculateDistanceInMeters(point.latitude, point.longitude, destination.latitude, destination.longitude)
}

/** True when the rider is within `thresholdMeters` of the destination. */
export function isArrived(point: GeoPoint, destination: NavigationDestination, thresholdMeters: number): boolean {
  return distanceToDestinationMeters(point, destination) <= thresholdMeters
}

/** True when the rider is farther than `thresholdMeters` from the route line. */
export function isOffRoute(point: GeoPoint, route: RouteResult, thresholdMeters: number): boolean {
  if (!route.coordinates || route.coordinates.length === 0) return false
  const { distanceToRouteMeters } = projectOnRoute(point, route.coordinates)
  return distanceToRouteMeters > thresholdMeters
}