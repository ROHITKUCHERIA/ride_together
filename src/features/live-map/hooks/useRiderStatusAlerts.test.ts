import { describe, expect, it } from 'vitest'
import { detectRiderStatusAlerts, emptySnapshot } from './useRiderStatusAlerts'

const NOW = 1_000_000
/** Fresh fix (live). */
const LIVE_TS = NOW - 5_000
/** Stale fix (>90s old = offline). */
const OFFLINE_TS = NOW - 120_000

const riders = [
  { userId: 'me', name: 'Rohit', isMe: true, timestamp: LIVE_TS },
  { userId: 'u2', name: 'Asha', timestamp: LIVE_TS },
]

describe('detectRiderStatusAlerts', () => {
  it('never alerts on first sight (opening the map is silent)', () => {
    const offlineRoster = riders.map((r) => (r.userId === 'u2' ? { ...r, timestamp: OFFLINE_TS } : r))
    const { alerts } = detectRiderStatusAlerts(emptySnapshot(), offlineRoster, [], NOW)
    expect(alerts).toEqual([])
  })

  it('announces a teammate dropping to offline', () => {
    const first = detectRiderStatusAlerts(emptySnapshot(), riders, [], NOW)
    const dropped = riders.map((r) => (r.userId === 'u2' ? { ...r, timestamp: OFFLINE_TS } : r))
    const { alerts } = detectRiderStatusAlerts(first.snap, dropped, [], NOW + 1_000)
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.kind).toBe('rider-offline')
    expect(alerts[0]?.message).toContain('Asha')
  })

  it('announces a teammate coming back online', () => {
    const first = detectRiderStatusAlerts(emptySnapshot(), riders, [], NOW)
    const dropped = riders.map((r) => (r.userId === 'u2' ? { ...r, timestamp: OFFLINE_TS } : r))
    const second = detectRiderStatusAlerts(first.snap, dropped, [], NOW + 1_000)
    expect(second.alerts[0]?.kind).toBe('rider-offline')
    // Same tick re-fire is cooled down; back-online fires on the transition.
    const back = detectRiderStatusAlerts(second.snap, riders, [], NOW + 2_000)
    expect(back.alerts).toHaveLength(1)
    expect(back.alerts[0]?.kind).toBe('rider-back')
    expect(back.alerts[0]?.message).toContain('Asha')
  })

  it('ignores my own offline transitions (my GPS has its own banner)', () => {
    const first = detectRiderStatusAlerts(emptySnapshot(), riders, [], NOW)
    const meDropped = riders.map((r) => (r.isMe ? { ...r, timestamp: OFFLINE_TS } : r))
    const { alerts } = detectRiderStatusAlerts(first.snap, meDropped, [], NOW + 1_000)
    expect(alerts).toEqual([])
  })

  it('announces a teammate flipping to off_route (not me — I already reroute)', () => {
    const sessions = [{ userId: 'u2', status: 'navigating' }]
    const first = detectRiderStatusAlerts(emptySnapshot(), riders, sessions, NOW)
    expect(first.alerts).toEqual([])
    const offRoute = [{ userId: 'u2', status: 'off_route' }]
    const { alerts } = detectRiderStatusAlerts(first.snap, riders, offRoute, NOW + 1_000)
    expect(alerts).toHaveLength(1)
    expect(alerts[0]?.kind).toBe('teammate-off-route')
    expect(alerts[0]?.message).toContain('Asha')
  })

  it('does not re-alert a sustained off_route within the cooldown', () => {
    const sessions = [{ userId: 'u2', status: 'navigating' }]
    const first = detectRiderStatusAlerts(emptySnapshot(), riders, sessions, NOW)
    const offRoute = [{ userId: 'u2', status: 'off_route' }]
    const second = detectRiderStatusAlerts(first.snap, riders, offRoute, NOW + 1_000)
    expect(second.alerts).toHaveLength(1)
    const third = detectRiderStatusAlerts(second.snap, riders, offRoute, NOW + 2_000)
    expect(third.alerts).toEqual([])
  })
})
