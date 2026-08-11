import { useStore } from '../state/observable'
import { riderStore } from '../state/riderStore'
import { gpsStore } from '../state/gpsStore'
import { connectionStore } from '../state/connectionStore'
import {
  PRESENCE_THRESHOLDS_MS,
  GROUP_SPLIT_THRESHOLD_METERS,
  GROUP_SPREADING_THRESHOLD_METERS,
} from '../config'
import { calculateDistanceInMeters } from '../utils/geo'
import type { GroupHealth, GroupMetrics, RiderPresence } from '../types'
import { useMemo } from 'react'

export function useRiders() {
  return useStore(riderStore)
}

export function useConnection() {
  return useStore(connectionStore)
}

export function useGps() {
  return useStore(gpsStore)
}

export function presenceFor(timestamp: number, now = Date.now()): RiderPresence {
  const age = now - timestamp
  if (age <= PRESENCE_THRESHOLDS_MS.live) return 'live'
  if (age <= PRESENCE_THRESHOLDS_MS.delayed) return 'delayed'
  if (age <= PRESENCE_THRESHOLDS_MS.stale) return 'stale'
  return 'offline'
}

export function presenceCounts(riders: { timestamp: number }[]) {
  const counts: Record<RiderPresence, number> = { live: 0, delayed: 0, stale: 0, offline: 0 }
  for (const r of riders) counts[presenceFor(r.timestamp)] += 1
  return counts
}

/**
 * Derive group health + proximity metrics from active rider locations.
 * Offline riders are excluded from bounds/proximity math.
 */
export function useGroupMetrics(): GroupMetrics {
  const { riders } = useRiders()
  return useMemo(() => computeGroupMetrics(riders), [riders])
}

export function computeGroupMetrics(riders: { latitude: number; longitude: number; name: string; timestamp: number }[]): GroupMetrics {
  const active = riders.filter((r) => presenceFor(r.timestamp) !== 'offline')
  const empty: GroupMetrics = { nearest: null, farthest: null, health: 'together', splitRider: null }
  if (active.length < 2) return empty

  const anchor = active[0]
  let nearest: GroupMetrics['nearest'] = null
  let farthest: GroupMetrics['farthest'] = null

  for (let i = 1; i < active.length; i++) {
    const r = active[i]
    const d = calculateDistanceInMeters(anchor.latitude, anchor.longitude, r.latitude, r.longitude)
    if (!nearest || d < nearest.distanceMeters) nearest = { name: r.name, distanceMeters: d }
    if (!farthest || d > farthest.distanceMeters) farthest = { name: r.name, distanceMeters: d }
  }

  const spread = farthest?.distanceMeters ?? 0
  let health: GroupHealth = 'together'
  let splitRider: GroupMetrics['splitRider'] = null
  if (spread >= GROUP_SPLIT_THRESHOLD_METERS) {
    health = 'split'
    splitRider = farthest
  } else if (spread >= GROUP_SPREADING_THRESHOLD_METERS) {
    health = 'spreading'
  }

  return { nearest, farthest, health, splitRider }
}
