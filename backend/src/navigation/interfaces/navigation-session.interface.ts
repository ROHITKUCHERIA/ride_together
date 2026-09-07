import {
  NavigationMode,
  NavigationStatus,
} from '../../../generated/prisma/enums';

/** Wire-format navigation status (lowercase, stable over the socket/REST). */
export type SharedNavigationStatus =
  | 'idle'
  | 'navigating'
  | 'off_route'
  | 'rerouting'
  | 'arrived'
  | 'gps_lost'
  | 'offline';

export type SharedNavigationMode = 'personal' | 'group';

export interface NavigationDestinationSnapshot {
  latitude: number;
  longitude: number;
  name?: string;
}

/** Serialized per-rider navigation state as broadcast/returned by the API. */
export interface NavigationSessionPayload {
  tripId: string;
  userId: string;
  mode: SharedNavigationMode;
  status: SharedNavigationStatus;
  distanceRemainingMeters?: number | null;
  /** Projected arrival time (epoch ms) — server never computes it from GPS
   *  ticks; riders report meaningful ETA transitions only. */
  eta?: number | null;
  /** Destination snapshot at session start (for reconnect recovery). */
  destination?: NavigationDestinationSnapshot | null;
  updatedAt: string;
}

/** Statuses that count as an "active" navigating rider for group ETA. */
const ACTIVE_STATUSES: ReadonlySet<SharedNavigationStatus> = new Set([
  'navigating',
  'off_route',
  'rerouting',
]);

export function isActiveForGroupEta(status: SharedNavigationStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

/** Stable mapping from the DB enum to the wire-format lowercase status. */
export function toWireStatus(status: NavigationStatus): SharedNavigationStatus {
  return status.toLowerCase() as SharedNavigationStatus;
}

const DB_STATUS: Record<SharedNavigationStatus, NavigationStatus> = {
  idle: NavigationStatus.IDLE,
  navigating: NavigationStatus.NAVIGATING,
  off_route: NavigationStatus.OFF_ROUTE,
  rerouting: NavigationStatus.REROUTING,
  arrived: NavigationStatus.ARRIVED,
  gps_lost: NavigationStatus.GPS_LOST,
  offline: NavigationStatus.OFFLINE,
};

export function toDbStatus(status: SharedNavigationStatus): NavigationStatus {
  return DB_STATUS[status];
}

/** Stable mapping from the DB enum to the wire-format lowercase mode. */
export function toWireMode(mode: NavigationMode): SharedNavigationMode {
  return mode.toLowerCase() as SharedNavigationMode;
}

/** Group ETA = latest (max) ETA among currently-active navigating riders. */
export function computeGroupEta(payloads: NavigationSessionPayload[]) {
  let latest: number | null = null;
  for (const p of payloads) {
    if (!isActiveForGroupEta(p.status)) continue;
    if (typeof p.eta === 'number' && (latest === null || p.eta > latest)) {
      latest = p.eta;
    }
  }
  return latest;
}
