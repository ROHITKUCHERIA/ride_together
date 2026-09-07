import { describe, expect, it } from 'vitest'
import { ReroutePolicy, type RerouteConfig } from './rerouting'

const CFG: RerouteConfig = {
  enabled: true,
  delayMs: 3000,
  minIntervalMs: 15000,
  confirmationSamples: 3,
}

const T0 = 1_700_000_000_000

describe('ReroutePolicy', () => {
  it('confirms off-route only after enough consecutive samples', () => {
    const p = new ReroutePolicy(CFG)
    expect(p.sample(true, T0)).toBe('confirming')
    expect(p.sample(true, T0 + 1000)).toBe('confirming')
    // delay (3000ms from start) not yet elapsed.
    expect(p.sample(true, T0 + 2000)).toBe('confirming')
    // 3rd sample AND delay elapsed → trigger.
    expect(p.sample(true, T0 + 3000)).toBe('trigger')
  })

  it('resets the confirmation counter when the rider recovers', () => {
    const p = new ReroutePolicy(CFG)
    p.sample(true, T0)
    p.sample(true, T0 + 1000)
    expect(p.sample(false, T0 + 2000)).toBe('none')
    // Back off-route: starts confirming from scratch.
    expect(p.sample(true, T0 + 3000)).toBe('confirming')
  })

  it('never triggers while a reroute is already in flight', () => {
    const p = new ReroutePolicy(CFG)
    p.sample(true, T0)
    p.sample(true, T0 + 1000)
    p.begin()
    expect(p.sample(true, T0 + 3000)).toBe('none')
    expect(p.isRerouting()).toBe(true)
  })

  it('enforces a cooldown between reroutes', () => {
    const p = new ReroutePolicy(CFG)
    p.sample(true, T0)
    p.sample(true, T0 + 1000)
    expect(p.sample(true, T0 + 3000)).toBe('trigger')
    p.succeed(T0 + 3000)

    // Rider is off-route again immediately — cooldown blocks a new reroute.
    p.sample(true, T0 + 5000)
    p.sample(true, T0 + 6000)
    expect(p.sample(true, T0 + 8000)).toBe('cooldown')

    // After minIntervalMs a fresh reroute fires again.
    p.sample(true, T0 + 20_000)
    p.sample(true, T0 + 21_000)
    expect(p.sample(true, T0 + 23_000)).toBe('trigger')
  })

  it('does nothing when automatic rerouting is disabled', () => {
    const p = new ReroutePolicy({ ...CFG, enabled: false })
    p.sample(true, T0)
    p.sample(true, T0 + 1000)
    expect(p.sample(true, T0 + 5000)).toBe('none')
  })

  it('a failed reroute allows a future retry after fresh confirmation', () => {
    const p = new ReroutePolicy(CFG)
    p.sample(true, T0)
    p.sample(true, T0 + 1000)
    expect(p.sample(true, T0 + 3000)).toBe('trigger')
    p.fail()
    expect(p.isRerouting()).toBe(false)
    // Confirmation restarts rather than instantly retriggering a storm.
    expect(p.sample(true, T0 + 4000)).toBe('confirming')
  })

  it('reset clears all state', () => {
    const p = new ReroutePolicy(CFG)
    p.sample(true, T0)
    p.sample(true, T0 + 1000)
    p.sample(true, T0 + 3000)
    p.reset()
    expect(p.sample(true, T0 + 4000)).toBe('confirming')
  })
})