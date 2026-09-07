import { describe, expect, it } from 'vitest'
import { advanceVisualPosition, VisualPositionSmoother } from './smoothPosition'

describe('smooth position', () => {
  it('snaps when there is no previous visual position', () => {
    const r = advanceVisualPosition(null, { latitude: 17.3850, longitude: 78.4860, heading: 90 })
    expect(r.latitude).toBe(17.385)
    expect(r.longitude).toBe(78.486)
    expect(r.heading).toBe(90)
    expect(r.progress).toBe(1)
  })

  it('eases jittery GPS instead of teleporting', () => {
    let visual = advanceVisualPosition(null, { latitude: 17.385, longitude: 78.486 })
    // Jittery fixes from the raw feed.
    const jitter: Array<[number, number]> = [
      [17.3857, 78.4861],
      [17.3848, 78.4859],
      [17.3861, 78.4862],
    ]
    for (const [lat, lng] of jitter) {
      const { latitude, longitude } = advanceVisualPosition(visual, { latitude: lat, longitude: lng })
      // The visual marker only moves a fraction of the jump.
      expect(Math.abs(latitude - lat)).toBeLessThan(Math.abs(visual.latitude - lat))
      expect(Math.abs(longitude - lng)).toBeLessThan(Math.abs(visual.longitude - lng))
      visual = { latitude, longitude, heading: null, progress: 0 }
    }
  })

  it('eases the heading toward the target too', () => {
    let visual = advanceVisualPosition(null, { latitude: 0, longitude: 0, heading: 0 })
    const r = advanceVisualPosition(visual, { latitude: 0, longitude: 0, heading: 90 })
    expect(r.heading).toBeGreaterThan(0)
    expect(r.heading).toBeLessThan(90)
  })

  it('keeps a stale heading when the target has none', () => {
    let visual = advanceVisualPosition(null, { latitude: 0, longitude: 0, heading: 42 })
    const r = advanceVisualPosition(visual, { latitude: 0, longitude: 0 })
    expect(r.heading).toBe(42)
  })

  it('smoother tracks state across frames', () => {
    const s = new VisualPositionSmoother()
    s.next({ latitude: 17.385, longitude: 78.486 })
    const second = s.next({ latitude: 17.386, longitude: 78.487 })
    expect(second.latitude).not.toBe(17.386)
    expect(s.value()).toEqual({ latitude: second.latitude, longitude: second.longitude, heading: second.heading })
  })
})