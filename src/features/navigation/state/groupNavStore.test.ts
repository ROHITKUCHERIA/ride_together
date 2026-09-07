// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'
import { groupNavStore } from './groupNavStore'
import type { NavigationSessionPayload } from '../types'

function payload(overrides: Partial<NavigationSessionPayload> = {}): NavigationSessionPayload {
  return {
    tripId: 't1',
    userId: 'u1',
    mode: 'group',
    status: 'navigating',
    distanceRemainingMeters: 4200,
    eta: 1_800_000_000_000,
    updatedAt: '2026-09-05T10:00:00Z',
    ...overrides,
  }
}

describe('groupNavStore', () => {
  beforeEach(() => {
    groupNavStore.reset()
  })

  it('bootstraps from a server snapshot', () => {
    groupNavStore.applySnapshot('t1', {
      destination: { latitude: 15.49, longitude: 73.82, name: 'Goa' },
      riders: [payload({ userId: 'a' }), payload({ userId: 'b', eta: 1_900_000_000_000 })],
      groupEta: 1_900_000_000_000,
    })

    const state = groupNavStore.getState()
    expect(state.tripId).toBe('t1')
    expect(state.destination?.name).toBe('Goa')
    expect(state.riders).toHaveLength(2)
    expect(state.groupEta).toBe(1_900_000_000_000)
  })

  it('applies Host destination set/update/clear broadcasts', () => {
    groupNavStore.applyDestination('t1', {
      latitude: 15.49,
      longitude: 73.82,
      name: 'Goa Beach',
    })
    expect(groupNavStore.getState().destination?.name).toBe('Goa Beach')

    groupNavStore.applyDestination('t1', null)
    expect(groupNavStore.getState().destination).toBeNull()
  })

  it('upserts a rider payload on a navigation event', () => {
    groupNavStore.applySnapshot('t1', { destination: null, riders: [payload()], groupEta: null })

    groupNavStore.applyNavEvent('navigation:status', payload({ status: 'off_route', eta: 1_950_000_000_000 }))

    const state = groupNavStore.getState()
    expect(state.riders).toHaveLength(1)
    expect(state.riders[0].status).toBe('off_route')
    expect(state.groupEta).toBe(1_950_000_000_000)
  })

  it('removes the rider on navigation:stopped and recomputes ETA', () => {
    groupNavStore.applySnapshot('t1', {
      destination: null,
      riders: [payload({ userId: 'a' }), payload({ userId: 'b', eta: 1_900_000_000_000 })],
      groupEta: null,
    })

    groupNavStore.applyNavEvent('navigation:stopped', payload({ userId: 'a', status: 'idle' }))

    const state = groupNavStore.getState()
    expect(state.riders.map((r) => r.userId)).toEqual(['b'])
    expect(state.groupEta).toBe(1_900_000_000_000)
  })

  it('excludes arrived riders from the derived group ETA', () => {
    groupNavStore.applySnapshot('t1', {
      destination: null,
      riders: [
        payload({ userId: 'a', status: 'arrived', eta: 1_900_000_000_000 }),
        payload({ userId: 'b', eta: 1_800_000_000_000 }),
      ],
      groupEta: null,
    })

    expect(groupNavStore.getState().groupEta).toBe(1_800_000_000_000)
  })
})