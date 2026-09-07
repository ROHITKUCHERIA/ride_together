import { useStore } from '../../live-map/state/observable'
import { ObservableStore } from '../../live-map/state/observable'
import type {
  GroupDestination,
  GroupNavigationSnapshot,
  NavigationSessionPayload,
} from '../types'

export interface GroupNavState {
  tripId: string | null
  destination: GroupDestination | null
  /** Per-rider group navigation sessions, in snapshot arrival order. */
  riders: NavigationSessionPayload[]
  /** Latest reached ETA among actively-navigating riders (arrived excluded). */
  groupEta: number | null
  updatedAt: number
}

const EMPTY: GroupNavState = {
  tripId: null,
  destination: null,
  riders: [],
  groupEta: null,
  updatedAt: 0,
}

const ACTIVE_STATUSES = new Set(['navigating', 'off_route', 'rerouting'])

function computeGroupEta(riders: NavigationSessionPayload[]): number | null {
  let latest: number | null = null
  for (const rider of riders) {
    if (!ACTIVE_STATUSES.has(rider.status)) continue
    if (rider.eta == null) continue
    if (latest === null || rider.eta > latest) latest = rider.eta
  }
  return latest
}

/**
 * Group navigation state mirror: the shared trip destination (set by the Host)
 * plus every rider's navigation session payload. Both arrive over the shared
 * Socket.IO connection and from REST snapshot fetches (reconnect recovery).
 * The server is the source of truth — this store only mirrors its broadcasts.
 */
class GroupNavStore extends ObservableStore<GroupNavState> {
  constructor() {
    super(EMPTY)
  }

  /** Drop everything (trip switched / map closed). */
  reset(): void {
    this.setState(EMPTY)
  }

  /** Reconnect-recovery snapshot bootstrap. */
  applySnapshot(tripId: string, snapshot: GroupNavigationSnapshot): void {
    this.setState({
      tripId,
      destination: snapshot.destination,
      riders: snapshot.riders,
      groupEta: snapshot.groupEta ?? computeGroupEta(snapshot.riders),
      updatedAt: Date.now(),
    })
  }

  applyDestination(tripId: string, destination: GroupDestination | null): void {
    const state = this.getState()
    this.setState({
      ...state,
      tripId: state.tripId ?? tripId,
      destination,
      updatedAt: Date.now(),
    })
  }

  /** Handle a `navigation:*` broadcast — stopped removes the rider, every other
   *  event upserts (merges) the payload for that rider and re-derives the ETA. */
  applyNavEvent(event: string, payload: NavigationSessionPayload): void {
    const state = this.getState()
    if (event === 'navigation:stopped') {
      const riders = state.riders.filter((r) => r.userId !== payload.userId)
      this.setState({ ...state, riders, groupEta: computeGroupEta(riders), updatedAt: Date.now() })
      return
    }
    const next = [...state.riders]
    const index = next.findIndex((r) => r.userId === payload.userId)
    if (index >= 0) next[index] = { ...next[index], ...payload }
    else next.push(payload)
    this.setState({ ...state, riders: next, groupEta: computeGroupEta(next), updatedAt: Date.now() })
  }
}

export const groupNavStore = new GroupNavStore()

export function useGroupNav(): GroupNavState {
  return useStore(groupNavStore)
}