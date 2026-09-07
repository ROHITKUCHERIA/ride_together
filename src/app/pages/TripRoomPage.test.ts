import { describe, expect, it } from 'vitest'
import { hasTripChanged, haveMembersChanged } from './tripRoomPolling'
import type { Trip, TripMember } from '../../types/api'

const member = (overrides: Partial<TripMember> = {}): TripMember => ({
  id: 'u1',
  name: 'Asha',
  avatarUrl: null,
  role: 'MEMBER',
  joinedAt: '2026-08-01T00:00:00.000Z',
  ...overrides,
})

const trip = (overrides: Partial<Trip> = {}): Trip => ({
  id: 't1',
  name: 'Anantagiri Hills',
  description: null,
  startLocation: 'Hyderabad',
  destination: 'Vikarabad',
  startLatitude: null,
  startLongitude: null,
  destinationLatitude: null,
  destinationLongitude: null,
  startDate: '2026-08-13',
  endDate: '2026-08-14',
  status: 'ACTIVE',
  inviteCode: 'ABC123',
  createdBy: 'u1',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  _count: { members: 2 },
  ...overrides,
})

describe('TripRoomPage poll change detection', () => {
  it('treats identical member payloads as unchanged (fresh identities, same content)', () => {
    const prev = [member(), member({ id: 'u2', name: 'Dev' })]
    // Simulate a poll round-trip: new array + new objects, same content.
    const next = prev.map((m) => ({ ...m }))
    expect(haveMembersChanged(prev, next)).toBe(false)
  })

  it('detects member join / leave / role change', () => {
    const prev = [member()]
    expect(haveMembersChanged(prev, [...prev.map((m) => ({ ...m })), member({ id: 'u2' })])).toBe(true)
    expect(haveMembersChanged(prev, [])).toBe(true)
    expect(haveMembersChanged(prev, [member({ role: 'ADMIN' })])).toBe(true)
    expect(haveMembersChanged(prev, [member({ name: 'Asha R' })])).toBe(true)
  })

  it('treats identical trip payloads as unchanged', () => {
    const prev = trip()
    expect(hasTripChanged(prev, { ...prev, _count: { members: 2 } })).toBe(false)
  })

  it('detects trip changes (status, counts, first load)', () => {
    const prev = trip()
    expect(hasTripChanged(prev, { ...prev, status: 'COMPLETED' })).toBe(true)
    expect(hasTripChanged(prev, { ...prev, _count: { members: 3 } })).toBe(true)
    expect(hasTripChanged(null, prev)).toBe(true)
  })
})
