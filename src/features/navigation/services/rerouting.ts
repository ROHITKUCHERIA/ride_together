/**
 * Automatic-rerouting policy. Kept as a small, testable state machine so the
 * hook never leaks GPS/noise handling into the UI.
 *
 * A reroute only fires when ALL of the following hold:
 *  - the rider stayed off-route for `confirmationSamples` consecutive samples
 *  - at least `delayMs` elapsed since the deviation began (GPS is noisy)
 *  - at least `minIntervalMs` elapsed since the last reroute (cooldown)
 *  - no reroute request is currently in flight
 *
 * The effective off-route threshold is computed by the caller (it needs the
 * current GPS accuracy); this policy only gates *when* to pull the trigger.
 */

export type RerouteDecision = 'none' | 'confirming' | 'cooldown' | 'trigger'

export interface RerouteConfig {
  enabled: boolean
  /** Min time spent off-route before a reroute may fire (ms). */
  delayMs: number
  /** Min time between reroutes (ms). */
  minIntervalMs: number
  /** Consecutive off-route samples required to confirm. */
  confirmationSamples: number
}

export interface ReroutePolicyState {
  consecutiveOffRoute: number
  offRouteSince: number | null
  lastRerouteAt: number
  rerouteInFlight: boolean
}

export class ReroutePolicy {
  private readonly config: RerouteConfig
  private state: ReroutePolicyState

  constructor(config: RerouteConfig) {
    this.config = config
    this.state = this.fresh()
  }

  private fresh(): ReroutePolicyState {
    return {
      consecutiveOffRoute: 0,
      offRouteSince: null,
      lastRerouteAt: 0,
      rerouteInFlight: false,
    }
  }

  /** Reset all confirmation/cooldown state (new route, fresh session). */
  reset(): void {
    this.state = this.fresh()
  }

  /**
   * Feed one GPS-derived off-route verdict. Returns the policy decision:
   *  - 'trigger': reroute now (caller runs the request, then `begin()`/`succeed`)
   *  - 'confirming': still gathering samples / waiting out the delay
   *  - 'cooldown': rerouted too recently — wait
   *  - 'none': rider is back on route (or rerouting disabled)
   */
  sample(offRoute: boolean, now = Date.now()): RerouteDecision {
    const cfg = this.config
    if (!offRoute) {
      this.state.consecutiveOffRoute = 0
      this.state.offRouteSince = null
      return 'none'
    }
    if (!cfg.enabled || this.state.rerouteInFlight) return 'none'

    if (this.state.offRouteSince === null) this.state.offRouteSince = now
    this.state.consecutiveOffRoute++

    if (this.state.consecutiveOffRoute < cfg.confirmationSamples) return 'confirming'
    if (now - this.state.offRouteSince < cfg.delayMs) return 'confirming'
    if (now - this.state.lastRerouteAt < cfg.minIntervalMs) return 'cooldown'
    return 'trigger'
  }

  /** Mark a reroute request as started (prevents concurrent requests). */
  begin(): void {
    this.state.rerouteInFlight = true
  }

  /** Record a successful reroute: reset confirmation, arm the cooldown. */
  succeed(now = Date.now()): void {
    this.state.rerouteInFlight = false
    this.state.lastRerouteAt = now
    this.state.consecutiveOffRoute = 0
    this.state.offRouteSince = null
  }

  /** Record a failed reroute: allow a future retry after re-confirmation. */
  fail(): void {
    this.state.rerouteInFlight = false
    this.state.consecutiveOffRoute = 0
    this.state.offRouteSince = null
  }

  isRerouting(): boolean {
    return this.state.rerouteInFlight
  }
}