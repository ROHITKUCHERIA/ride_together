/**
 * Provider-agnostic navigation types. The frontend never sees routing-engine
 * (OSRM / GraphHopper / …) response shapes — the RoutingService normalizes
 * every provider response into these types.
 */

export interface RouteCoordinate {
  latitude: number;
  longitude: number;
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
  | 'unknown';

export type ManeuverModifier =
  | 'left'
  | 'right'
  | 'slight-left'
  | 'slight-right'
  | 'sharp-left'
  | 'sharp-right'
  | 'straight';

/** Turn-by-turn maneuver step, normalized from the routing engine. */
export interface NavigationInstruction {
  /** Stable id (e.g. `step-12`) — unique within a route. */
  id: string;
  type: ManeuverType;
  modifier?: ManeuverModifier;
  /** Human-readable guidance ("Turn right onto NH 44"). */
  text: string;
  /** Distance to the *next* maneuver, carried by this step (m). */
  distanceMeters: number;
  durationSeconds: number;
  latitude: number;
  longitude: number;
  /** Best-effort road name; omitted on unnamed streets. */
  roadName?: string;
  /** Roundabout exit, only when the engine provides one. */
  exitNumber?: number;
}

export interface NormalizedRoute {
  coordinates: RouteCoordinate[];
  distanceMeters: number;
  durationSeconds: number;
  /** Opaque provider geometry — unused by the UI in Phase 1. */
  geometry?: unknown;
  instructions?: NavigationInstruction[];
}

export interface GeocodeResult {
  name: string;
  latitude: number;
  longitude: number;
}
