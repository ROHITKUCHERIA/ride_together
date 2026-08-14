import { describe, expect, it } from 'vitest'
import {
  mergeRosterWithRealtime,
  presenceForAge,
  relativeTimeAgo,
  riderStatusForPresence,
  toRoomRiders,
} from './riderMapper'
import { PRESENCE_THRESHOLDS_MS } from '../config'
import type { RiderLocation } from '../types'
import type { Rider } from '../../../types'

const NOW = Date.now()

function loc(partial: Partial<RiderLocation>): RiderLocation {
  return {
    userId: 'u1',
    name: 'Rohit',
    bike: 'City',
    accent: '#ff6b2c',
    tripId: 't1',
    latitude: 15.9,
    longitude: 73.97,
    accuracy: 10,
    speed: null,
    heading: null,
    timestamp: NOW,
    ...partial,
  }
}

describe('presenceForAge', () => {
  it('maps fresh timestamps to live', () => {
    expect(presenceForAge(0)).toBe('live')
    expect(presenceForAge(PRESENCE_THRESHOLDS_MS.live)).toBe('live')
  })

  it('maps the delayed band', () => {
    expect(presenceForAge(PRESENCE_THRESHOLDS_MS.live + 1)).toBe('delayed')
    expect(presenceForAge(PRESENCE_THRESHOLDS_MS.delayed)).toBe('delayed')
  })

  it('maps the stale band', () => {
    expect(presenceForAge(PRESENCE_THRESHOLDS_MS.delayed + 1)).toBe('stale')
    expect(presenceForAge(PRESENCE_THRESHOLDS_MS.stale)).toBe('stale')
  })

  it('maps older timestamps to offline', () => {
    expect(presenceForAge(PRESENCE_THRESHOLDS_MS.stale + 1)).toBe('offline')
  })
})

describe('riderStatusForPresence', () => {
  it('collapses presence onto the legacy drawer status', () => {
    expect(riderStatusForPresence('live')).toBe('online')
    expect(riderStatusForPresence('delayed')).toBe('weak')
    expect(riderStatusForPresence('stale')).toBe('weak')
    expect(riderStatusForPresence('offline')).toBe('offline')
  })
})

describe('relativeTimeAgo', () => {
  it('formats seconds and minutes', () => {
    expect(relativeTimeAgo(NOW, NOW)).toBe('just now')
    expect(relativeTimeAgo(NOW - 20_000, NOW)).toBe('20s ago')
    expect(relativeTimeAgo(NOW - 120_000, NOW)).toBe('2m ago')
    expect(relativeTimeAgo(NOW - 7_200_000, NOW)).toBe('2h ago')
  })
})

describe('toRoomRiders', () => {
  it('maps realtime locations onto the room Rider shape', () => {
    const riders = toRoomRiders([loc({ userId: 'u1', timestamp: NOW })], null, NOW)
    expect(riders[0]).toMatchObject({
      id: 'u1',
      name: 'Rohit',
      bike: 'City',
      status: 'online',
      speed: undefined,
      lastUpdate: 'just now',
      lat: 15.9,
      lng: 73.97,
    })
  })

  it('marks me with zero distance instead of a computed distance', () => {
    const me = loc({ userId: 'u1', isMe: true, latitude: 15.9, longitude: 73.97 })
    const other = loc({ userId: 'u2', latitude: 16.0, longitude: 74.0 })
    const riders = toRoomRiders([me, other], me, NOW)
    const meRider = riders.find((r) => r.id === 'u1')!
    const otherRider = riders.find((r) => r.id === 'u2')!
    expect(meRider.distanceKm).toBe(0)
    expect(otherRider.distanceKm).toBeGreaterThan(0)
  })

  it('leaves distance undefined when there is no known self location', () => {
    const riders = toRoomRiders([loc({ userId: 'u2' })], null, NOW)
    expect(riders[0].distanceKm).toBeUndefined()
  })

  it('reflects non-live presence via drawer status', () => {
    const riders = toRoomRiders([loc({ userId: 'u1', timestamp: NOW - 120_000 })], null, NOW)
    expect(riders[0].status).toBe('offline')
  })
})

describe('mergeRosterWithRealtime', () => {
  const roster: Rider[] = [
    { id: 'u1', name: 'A', bike: 'x', status: 'offline', lastUpdate: 'x', lat: 0, lng: 0, accent: '#' },
    { id: 'u2', name: 'B', bike: 'y', status: 'offline', lastUpdate: 'y', lat: 0, lng: 0, accent: '#' },
  ]

  it('overrides roster members that have live data', () => {
    const live: Rider[] = [
      { id: 'u1', name: 'A live', bike: 'x', status: 'online', lastUpdate: 'now', lat: 1, lng: 2, accent: '#a' },
    ]
    const merged = mergeRosterWithRealtime(roster, live)
    expect(merged.find((r) => r.id === 'u1')).toEqual(live[0])
  })

  it('keeps members with no live data as offline roster entries', () => {
    const merged = mergeRosterWithRealtime(roster, [])
    expect(merged.find((r) => r.id === 'u2')).toMatchObject({ id: 'u2', status: 'offline' })
  })

  it('drops nothing from the roster', () => {
    expect(mergeRosterWithRealtime(roster, []).length).toBe(roster.length)
  })
})