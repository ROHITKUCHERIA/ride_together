import { describe, expect, it } from 'vitest'
import {
  clampPosition,
  computeServerSkew,
  driftAction,
  expectedPosition,
  isJamHost,
  isJamParticipant,
} from './jamSync'
import type { SyncPlayback } from './jamSync'

describe('expectedPosition', () => {
  it('holds a fixed position while paused', () => {
    const state: SyncPlayback = {
      position: 42,
      positionAt: 100_000,
      isPlaying: false,
      duration: 200,
      serverSkew: 0,
    }
    expect(expectedPosition(state, 400_000)).toBe(42)
  })

  it('advances by elapsed server time while playing', () => {
    const state: SyncPlayback = {
      position: 12,
      positionAt: 100_000, // server ms
      isPlaying: true,
      duration: null,
      serverSkew: 0,
    }
    // 10s later on the same clock → 22s.
    expect(expectedPosition(state, 110_000)).toBeCloseTo(22, 5)
  })

  it('corrects for server clock skew', () => {
    const state: SyncPlayback = {
      position: 0,
      positionAt: 100_000,
      isPlaying: true,
      duration: null,
      serverSkew: -5_000, // client clock is 5s ahead of the server
    }
    // Local now = 110_000 (10s after positionAt on the client clock). After the
    // skew correction the server "now" is 105_000 → only 5s elapsed.
    expect(expectedPosition(state, 110_000)).toBeCloseTo(5, 5)
  })

  it('clamps to the duration when known', () => {
    const state: SyncPlayback = {
      position: 195,
      positionAt: 100_000,
      isPlaying: true,
      duration: 200,
      serverSkew: 0,
    }
    expect(expectedPosition(state, 110_000)).toBe(200)
  })
})

describe('driftAction', () => {
  it('does nothing within the soft threshold', () => {
    expect(driftAction(100, 100.5)).toBe('none')
    expect(driftAction(100, 101)).toBe('none')
  })

  it('flags gentle drift in the soft band', () => {
    expect(driftAction(100, 101.8)).toBe('soft')
  })

  it('flags hard drift above the hard threshold', () => {
    expect(driftAction(100, 103)).toBe('hard')
    expect(driftAction(103, 100)).toBe('hard')
  })
})

describe('helpers', () => {
  it('clamps positions to duration', () => {
    expect(clampPosition(-3, 100)).toBe(0)
    expect(clampPosition(150, 100)).toBe(100)
    expect(clampPosition(5, null)).toBe(5)
  })

  it('computes server skew as serverTime - receivedAt', () => {
    expect(computeServerSkew(5000, 6000)).toBe(-1000)
  })

  it('detects the host and participants', () => {
    const party = [{ userId: 'a' }, { userId: 'b' }]
    expect(isJamParticipant(party, 'b')).toBe(true)
    expect(isJamParticipant(party, 'c')).toBe(false)
    expect(isJamParticipant(undefined, 'a')).toBe(false)
    expect(isJamHost({ hostId: 'a' }, 'a')).toBe(true)
    expect(isJamHost({ hostId: 'a' }, 'b')).toBe(false)
  })
})