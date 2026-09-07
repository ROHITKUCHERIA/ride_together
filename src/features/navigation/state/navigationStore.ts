import { ObservableStore } from '../../live-map/state/observable'
import type { NavigationDestination, NavigationProgress, NavigationStatus, RouteResult } from '../types'

export interface NavigationState {
  status: NavigationStatus
  destination: NavigationDestination | null
  route: RouteResult | null
  error: string | null
  offRoute: boolean
  remainingDistanceMeters: number | null
  remainingDurationSeconds: number | null
  /** Live turn-by-turn progress (navigating only). */
  progress: NavigationProgress | null
  /** Automatic reroute request in flight. */
  rerouting: boolean
  /** Transient "Route updated" confirmation after a successful reroute. */
  routeUpdated: boolean
  /** Transient navigation notice (e.g. "Unable to recalculate route"). */
  notice: string | null
  /** Voice guidance toggle (persists for the session). */
  voiceEnabled: boolean
  /** True when driving but the GPS fix went stale/lost. */
  gpsLost: boolean
  /** Latest GPS accuracy (m) — used for accuracy-aware off-route math. */
  gpsAccuracy: number | null
  /** Smoothed navigation heading (deg); device → movement bearing fallback. */
  heading: number | null
}

const EMPTY: NavigationState = {
  status: 'idle',
  destination: null,
  route: null,
  error: null,
  offRoute: false,
  remainingDistanceMeters: null,
  remainingDurationSeconds: null,
  progress: null,
  rerouting: false,
  routeUpdated: false,
  notice: null,
  voiceEnabled: true,
  gpsLost: false,
  gpsAccuracy: null,
  heading: null,
}

/**
 * Single source of truth for the navigation session. The `useNavigation` hook
 * derives remaining distance/ETA from the shared rider store; the UI layers
 * (bottom sheet, route line, marker) all subscribe to this store.
 *
 * Group riding stays untouched: this store only mirrors what the navigation
 * feature needs. Rider locations, presence and the realtime connection keep
 * living in their own stores.
 */
class NavigationStore extends ObservableStore<NavigationState> {
  constructor() {
    super({ ...EMPTY })
  }

  reset(): void {
    this.setState({ ...EMPTY })
  }

  setStatus(status: NavigationStatus): void {
    const s = this.getState()
    if (s.status === status) return
    const next: NavigationState = { ...s, status }
    // Clearing transient navigation flags when the session changes keeps the
    // UI honest (no orphaned "route updated" / rerouting spinners).
    if (status === 'navigating') {
      next.rerouting = false
      next.routeUpdated = false
    }
    if (status === 'completed' || status === 'ready' || status === 'idle') {
      next.rerouting = false
      next.routeUpdated = false
    }
    this.setState(next)
  }

  setDestination(destination: NavigationDestination | null): void {
    this.setState({ ...this.getState(), destination })
  }

  setRoute(route: RouteResult | null): void {
    const s = this.getState()
    this.setState({
      ...s,
      route,
      progress: route ? s.progress : null,
    })
  }

  setError(error: string | null): void {
    this.setState({ ...this.getState(), error })
  }

  setOffRoute(offRoute: boolean): void {
    if (offRoute === this.getState().offRoute) return
    this.setState({ ...this.getState(), offRoute })
  }

  setRemaining(distance: number | null, duration: number | null): void {
    const s = this.getState()
    if (s.remainingDistanceMeters === distance && s.remainingDurationSeconds === duration) return
    this.setState({ ...s, remainingDistanceMeters: distance, remainingDurationSeconds: duration })
  }

  /** Live turn-by-turn progress. Skips no-op updates so the bottom sheet and
   *  header only re-render on a meaningful change (not every GPS tick). */
  setProgress(progress: NavigationProgress | null): void {
    const s = this.getState()
    const p = s.progress
    if (progress === null && p === null) return
    if (
      progress !== null &&
      p !== null &&
      p.currentInstructionIndex === progress.currentInstructionIndex &&
      p.distanceRemainingMeters === progress.distanceRemainingMeters &&
      Math.round(p.distanceToCurrentInstructionMeters ?? -1) ===
        Math.round(progress.distanceToCurrentInstructionMeters ?? -1)
    ) {
      return
    }
    this.setState({ ...s, progress })
  }

  setRerouting(rerouting: boolean): void {
    const s = this.getState()
    if (s.rerouting === rerouting) return
    this.setState({ ...s, rerouting })
  }

  setRouteUpdated(routeUpdated: boolean): void {
    const s = this.getState()
    if (s.routeUpdated === routeUpdated) return
    this.setState({ ...s, routeUpdated })
  }

  setNotice(notice: string | null): void {
    const s = this.getState()
    if (s.notice === notice) return
    this.setState({ ...s, notice })
  }

  setVoiceEnabled(voiceEnabled: boolean): void {
    const s = this.getState()
    if (s.voiceEnabled === voiceEnabled) return
    this.setState({ ...s, voiceEnabled })
  }

  setGpsLost(gpsLost: boolean): void {
    const s = this.getState()
    if (s.gpsLost === gpsLost) return
    this.setState({ ...s, gpsLost })
  }

  setGpsAccuracy(gpsAccuracy: number | null): void {
    const s = this.getState()
    if (s.gpsAccuracy === gpsAccuracy) return
    this.setState({ ...s, gpsAccuracy })
  }

  setHeading(heading: number | null): void {
    const s = this.getState()
    if (s.heading === heading) return
    this.setState({ ...s, heading })
  }
}

export const navigationStore = new NavigationStore()