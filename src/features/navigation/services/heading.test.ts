import { describe, expect, it } from 'vitest'
import { movementBearing, resolveHeading, type HeadingState } from './heading'

const IDLE: HeadingState = { heading: null, lastPosition: null }

describe('heading', () => {
  it('prefers the device heading when available', () => {
    const { result } = resolveHeading(IDLE, { heading: 90, latitude: 17.385, longitude: 78.486, accuracy: 5 })
    expect(result.heading).toBeCloseTo(90)
    expect(result.fromDevice).toBe(true)
  })

  it('falls back to movement bearing without a device heading', () => {
    const first = resolveHeading(IDLE, { latitude: 17.385, longitude: 78.486, accuracy: 5 })
    const { result } = resolveHeading(first.state, { latitude: 17.3855, longitude: 78.486, accuracy: 5 })
    // ~55m of northward movement → bearing ≈ 0°.
    expect(result.heading).toBeCloseTo(0, -1)
  })

  it('holds the previous heading when the fix does not move', () => {
    let state = IDLE
    const f = resolveHeading(state, { heading: 180, latitude: 17.385, longitude: 78.486, accuracy: 5 })
    state = f.state
    expect(f.result.heading).toBe(180)
    // No heading, tiny/no movement → hold 180.
    const s = resolveHeading(state, { latitude: 17.385, longitude: 78.486, accuracy: 5 })
    expect(s.result.heading).toBe(180)
  })

  it('does not rotate when GPS accuracy is poor', () => {
    let state = IDLE
    state = resolveHeading(state, { heading: 0, latitude: 17.385, longitude: 78.486, accuracy: 5 }).state
    const poor = resolveHeading(state, {
      heading: 270,
      latitude: 17.386,
      longitude: 78.487,
      accuracy: 400,
    })
    // Poor fix → the poor-accuracy hold wins (stays at 0).
    expect(poor.result.heading).toBe(0)
  })

  it('smooths large heading swings in bounded steps', () => {
    let state = IDLE
    state = resolveHeading(state, { heading: 0, latitude: 17.385, longitude: 78.486, accuracy: 5 }, { minMovementMeters: 8, maxStepDeg: 18, poorAccuracyMeters: 250 }).state
    const jumped = resolveHeading(state, { heading: 180, latitude: 17.385, longitude: 78.486, accuracy: 5 }, { minMovementMeters: 8, maxStepDeg: 18, poorAccuracyMeters: 250 })
    expect(jumped.result.heading).toBeCloseTo(18, -1)
  })

  it('starts null with no info at all', () => {
    const { result } = resolveHeading(IDLE, { latitude: 17.385, longitude: 78.486, accuracy: null })
    expect(result.heading).toBeNull()
  })

  it('computes a movement bearing directly', () => {
    // East-west movement at constant latitude → bearing 90 or 270.
    const east = movementBearing({ latitude: 17.385, longitude: 78.486 }, { latitude: 17.385, longitude: 78.487 })
    expect(east).toBeCloseTo(90, 0)
  })
})