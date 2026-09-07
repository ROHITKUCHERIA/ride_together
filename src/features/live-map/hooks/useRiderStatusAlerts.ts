import { useEffect, useRef, useState } from 'react'
import { presenceFor, useRiders } from './useLiveMap'
import { useGroupNav } from '../../navigation/state/groupNavStore'
import { playBeep } from '../services/beep'

export type RiderStatusAlertKind = 'rider-offline' | 'rider-back' | 'teammate-off-route'

export interface RiderStatusAlert {
  kind: RiderStatusAlertKind
  message: string
}

/** Per rider+kind re-alert cooldown (flapping connections must not spam). */
const ALERT_COOLDOWN_MS = 60_000
const BEEP_COOLDOWN_MS = 20_000

export interface StatusSnapshot {
  presence: Map<string, string>
  navStatus: Map<string, string>
  firedAt: Map<string, number>
}

export function emptySnapshot(): StatusSnapshot {
  return { presence: new Map(), navStatus: new Map(), firedAt: new Map() }
}

interface StatusInput {
  userId: string
  name: string
  isMe?: boolean
  timestamp: number
}

interface NavInput {
  userId: string
  status: string
}

/**
 * Pure transition detector: compares the live roster + group nav sessions
 * against the previous snapshot and emits at most one alert per call —
 * - a teammate dropping to offline (not me — my own GPS has its own banner)
 * - a teammate coming back online
 * - a teammate's nav session flipping to off_route (mine already reroutes)
 * First sight of a rider never alerts; only transitions do.
 */
export function detectRiderStatusAlerts(
  snap: StatusSnapshot,
  riders: StatusInput[],
  sessions: NavInput[],
  now: number = Date.now(),
): { alerts: RiderStatusAlert[]; snap: StatusSnapshot } {
  const presence = new Map<string, string>()
  const navStatus = new Map<string, string>()
  const firedAt = new Map(snap.firedAt)
  const alerts: RiderStatusAlert[] = []

  const fire = (kind: RiderStatusAlertKind, userId: string, message: string): void => {
    const key = `${kind}:${userId}`
    const last = firedAt.get(key) ?? 0
    if (now - last < ALERT_COOLDOWN_MS) return
    firedAt.set(key, now)
    alerts.push({ kind, message })
  }

  for (const r of riders) {
    const p = presenceFor(r.timestamp, now)
    presence.set(r.userId, p)
    if (r.isMe) continue
    const prev = snap.presence.get(r.userId)
    if (prev === undefined) continue
    if (prev !== 'offline' && p === 'offline') {
      fire('rider-offline', r.userId, `${r.name} went offline — showing their last known position.`)
    } else if (prev === 'offline' && p !== 'offline') {
      fire('rider-back', r.userId, `${r.name} is back online.`)
    }
  }

  const sessionByUser = new Map(sessions.map((s) => [s.userId, s.status]))
  const meId = riders.find((r) => r.isMe)?.userId
  for (const [userId, status] of sessionByUser) {
    navStatus.set(userId, status)
    if (userId === meId) continue
    const prev = snap.navStatus.get(userId)
    if (prev === undefined || prev === status) continue
    if (status === 'off_route') {
      const name = riders.find((r) => r.userId === userId)?.name ?? 'A rider'
      fire('teammate-off-route', userId, `${name} is off the planned route.`)
    }
  }

  return { alerts, snap: { presence, navStatus, firedAt } }
}

/**
 * Announces per-rider status transitions as toast + beep, mirroring the group
 * cohesion alerts: rider offline / back online / teammate off-route. The
 * underlying data (presence, nav session badges) already existed — this only
 * adds the announcement. Caller renders the returned alert.
 */
export function useRiderStatusAlerts(): { alert: RiderStatusAlert | null; dismiss: () => void } {
  const { riders } = useRiders()
  const group = useGroupNav()
  const [alert, setAlert] = useState<RiderStatusAlert | null>(null)
  const snapRef = useRef<StatusSnapshot>(emptySnapshot())
  const lastBeepMs = useRef(0)
  const initializedRef = useRef(false)

  useEffect(() => {
    // Snapshot the current roster silently on first run — opening the map must
    // never announce riders that were already offline.
    if (!initializedRef.current) {
      initializedRef.current = true
      snapRef.current = detectRiderStatusAlerts(snapRef.current, riders, group.riders).snap
      return
    }
    const { alerts, snap } = detectRiderStatusAlerts(snapRef.current, riders, group.riders)
    snapRef.current = snap
    const next = alerts[0]
    if (!next) return
    setAlert(next)
    const now = Date.now()
    if (now - lastBeepMs.current >= BEEP_COOLDOWN_MS) {
      lastBeepMs.current = now
      playBeep('warning')
    }
    const t = window.setTimeout(() => setAlert((a) => (a?.kind === next.kind ? null : a)), 7000)
    return () => window.clearTimeout(t)
  }, [riders, group.riders])

  const dismiss = () => setAlert(null)
  return { alert, dismiss }
}
