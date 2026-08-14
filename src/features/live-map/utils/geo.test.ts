import { describe, expect, it } from 'vitest'
import {
  calculateDistanceInMeters,
  clamp,
  headingDeltaDeg,
  interpolateHeading,
  interpolatePosition,
} from './geo'

describe('calculateDistanceInMeters', () => {
  it('returns 0 for identical points', () => {
    expect(calculateDistanceInMeters(15.9, 73.97, 15.9, 73.97)).toBe(0)
  })

  it('yields ~111km for 1 degree of latitude', () => {
    const d = calculateDistanceInMeters(15.2992, 0, 16.2992, 0)
    expect(d).toBeGreaterThan(110_000)
    expect(d).toBeLessThan(112_000)
  })

  it('is symmetric', () => {
    const a = calculateDistanceInMeters(15.9, 73.97, 16.2, 74.2)
    const b = calculateDistanceInMeters(16.2, 74.2, 15.9, 73.97)
    expect(a).toBeCloseTo(b, 6)
  })
})

describe('clamp', () => {
  it('clamps into the inclusive range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(11, 0, 10)).toBe(10)
  })
})

describe('interpolatePosition', () => {
  it('stays within endpoints and eases', () => {
    const start = { lat: 0, lng: 0 }
    const end = { lat: 10, lng: 10 }
    const mid = interpolatePosition(start.lat, start.lng, end.lat, end.lng, 0.5)
    expect(mid.lat).toBeCloseTo(5)
    expect(mid.lng).toBeCloseTo(5)
    const early = interpolatePosition(start.lat, start.lng, end.lat, end.lng, 0.25)
    expect(early.lat).toBeLessThan(2.5) // easing makes early progress slow
  })
})

describe('headingDeltaDeg', () => {
  it('returns the shortest angular delta', () => {
    expect(headingDeltaDeg(0, 90)).toBe(90)
    expect(headingDeltaDeg(350, 10)).toBe(20)
    expect(headingDeltaDeg(10, 350)).toBe(-20)
  })
})

describe('interpolateHeading', () => {
  it('steps toward a heading by at most maxStepDeg', () => {
    expect(interpolateHeading(0, 180, 45)).toBe(45)
    expect(interpolateHeading(0, 10, 45)).toBe(10)
    expect(interpolateHeading(350, 10, 5)).toBe(355)
    expect(interpolateHeading(355, 5, 10)).toBe(5) // delta is +10, hit exactly
    expect(interpolateHeading(355, 5, 4)).toBe(359) // wraps to [0, 360)
  })
})