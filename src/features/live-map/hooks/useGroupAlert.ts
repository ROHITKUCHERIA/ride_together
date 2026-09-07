import { useEffect, useRef, useState } from 'react'
import { useGroupMetrics } from './useLiveMap'
import { useRiders } from './useLiveMap'
import { playBeep } from '../services/beep'

export type GroupAlertKind = 'split' | 'left-behind' | 'pulling-ahead'

export interface GroupAlert {
  kind: GroupAlertKind
  message: string
}

const ALERT_COOLDOWN_MS = 30000
const BEEP_COOLDOWN_MS = 20000

function formatKm(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`
  return `${Math.round(m)} m`
}

/**
 * Watches group cohesion and emits a toast+beep when the group splits.
 * - split (≥3 km spread) or left-behind (farthest far + slow)
 * - pulling-ahead (leader fast + spreading)
 * Debounced to avoid spam; caller renders the returned alert.
 */
export function useGroupAlert(): { alert: GroupAlert | null; dismiss: () => void } {
  const metrics = useGroupMetrics()
  const { riders } = useRiders()
  const [alert, setAlert] = useState<GroupAlert | null>(null)
  const lastAlertMs = useRef(0)
  const lastBeepMs = useRef(0)
  const lastHealth = useRef(metrics.health)

  useEffect(() => {
    const now = Date.now()
    const farthest = metrics.farthest
    const health = metrics.health

    // Only alert on transition to spreading/split or sustained split — not every tick together.
    const healthTransition = lastHealth.current !== health
    lastHealth.current = health

    if (health === 'together' && !farthest) {
      return
    }

    const me = riders.find((r) => r.isMe) ?? null
    const meSpeed = me?.speed ?? null
    const farSpeed = farthest ? riders.find((r) => r.name === farthest.name)?.speed ?? null : null

    let next: GroupAlert | null = null

    if (health === 'split' && farthest) {
      next = {
        kind: 'split',
        message: `${farthest.name} is ${formatKm(farthest.distanceMeters)} away — group split! Slow down to regroup.`,
      }
    } else if (health === 'spreading' && farthest && healthTransition) {
      // Classify as pulling-ahead if farthest rider is notably faster than me.
      const pullingAhead =
        meSpeed != null && farSpeed != null && farSpeed - meSpeed > 15
      if (pullingAhead) {
        next = {
          kind: 'pulling-ahead',
          message: `${farthest.name} is pulling ahead · ${formatKm(farthest.distanceMeters)} gap at ${Math.round(farSpeed)} km/h. Ease off.`,
        }
      } else {
        next = {
          kind: 'left-behind',
          message: `${farthest.name} is falling behind · ${formatKm(farthest.distanceMeters)} gap. Check on the group.`,
        }
      }
    } else if (health === 'split' && !healthTransition) {
      // Sustained split — re-alert only after cooldown.
      if (now - lastAlertMs.current < ALERT_COOLDOWN_MS) return
      if (farthest) {
        next = {
          kind: 'split',
          message: `${farthest.name} still ${formatKm(farthest.distanceMeters)} away — regroup.`,
        }
      }
    } else {
      return
    }

    if (!next) return
    if (now - lastAlertMs.current < ALERT_COOLDOWN_MS) return
    lastAlertMs.current = now
    setAlert(next)
    if (now - lastBeepMs.current >= BEEP_COOLDOWN_MS) {
      lastBeepMs.current = now
      playBeep(next.kind === 'split' ? 'alert' : 'warning')
    }
    const t = window.setTimeout(() => setAlert((a) => (a?.kind === next!.kind ? null : a)), 7000)
    return () => window.clearTimeout(t)
  }, [metrics.health, metrics.farthest, riders])

  const dismiss = () => setAlert(null)
  return { alert, dismiss }
}
