/** Provider-agnostic navigation types (mirrors the backend navigation DTOs). */

export interface GeoPoint {
  latitude: number
  longitude: number
}

export interface NavigationDestination extends GeoPoint {
  name?: string
}

export type ManeuverType =
  | 'depart'
  | 'arrive'
  | 'turn'
  | 'continue'
  | 'merge'
  | 'fork'
  | 'roundabout'
  | 'uturn'
  | 'unknown'

export type ManeuverModifier =
  | 'left'
  | 'right'
  | 'slight-left'
  | 'slight-right'
  | 'sharp-left'
  | 'sharp-right'
  | 'straight'

/** Turn-by-turn maneuver step, normalized from the routing engine. */
export interface NavigationInstruction {
  /** Stable id (e.g. `step-12`) — unique within a route. */
  id: string
  type: ManeuverType
  modifier?: ManeuverModifier
  /** Human-readable guidance ("Turn right onto NH 44"). */
  text: string
  /** Distance to the *next* maneuver, carried by this step (m). */
  distanceMeters: number
  durationSeconds: number
  latitude: number
  longitude: number
  /** Best-effort road name; omitted on unnamed streets. */
  roadName?: string
  /** Roundabout exit, only when the engine provides one. */
  exitNumber?: number
}

export interface RouteResult {
  coordinates: GeoPoint[]
  distanceMeters: number
  durationSeconds: number
  geometry?: unknown
  instructions?: NavigationInstruction[]
}

export interface GeocodeResult {
  name: string
  latitude: number
  longitude: number
}

export type NavigationStatus =
  | 'idle'
  | 'locating'
  | 'route_loading'
  | 'ready'
  | 'navigating'
  | 'completed'
  | 'error'

/**
 * Live turn-by-turn progress, derived from the rider position projected onto
 * the route polyline — never a straight-line guess, never a full re-compute.
 */
export interface NavigationProgress {
  distanceRemainingMeters: number
  durationRemainingSeconds: number
  routeProgressPercent: number
  currentInstructionIndex: number
  currentInstruction: NavigationInstruction | null
  nextInstruction: NavigationInstruction | null
  distanceToCurrentInstructionMeters: number | null
  distanceToNextInstructionMeters: number | null
  etaEpochMs: number | null
}

// ---------------------------------------------------------------------------
// Group navigation (Phase 3) — wire types shared with the backend contract.
// ---------------------------------------------------------------------------

export type GroupNavigationStatus =
  | 'idle'
  | 'navigating'
  | 'off_route'
  | 'rerouting'
  | 'arrived'
  | 'gps_lost'
  | 'offline'

/** Shared trip destination set by the Host — the target every rider drives to. */
export interface GroupDestination {
  latitude: number
  longitude: number
  name?: string
  setByUserId?: string | null
  setAt?: string | null
}

export interface NavigationSessionDestination {
  latitude: number
  longitude: number
  name?: string | null
}

/** Per-rider navigation session — pushed over the socket and returned by REST. */
export interface NavigationSessionPayload {
  tripId: string
  userId: string
  mode: 'group' | 'personal'
  status: GroupNavigationStatus
  distanceRemainingMeters?: number | null
  /** Projected arrival, epoch ms. */
  eta?: number | null
  destination?: NavigationSessionDestination | null
  updatedAt: string
}

export interface GroupNavigationSnapshot {
  destination: GroupDestination | null
  riders: NavigationSessionPayload[]
  /** Latest reached ETA among riders still navigating (arrived excluded). */
  groupEta: number | null
}

/** Group reroute result — the requestId lets the client drop stale responses. */
export interface TripRerouteResult {
  requestId: string
  route: RouteResult
}