/**
 * Realtime navigation event names, centralized so the gateway, REST broadcast
 * services and the frontend all reference the same strings.
 */

export const NavigationEvents = {
  /** Host set/updated the shared trip destination. */
  TRIP_DESTINATION_UPDATED: 'trip:destination-updated',
  /** Host cleared the shared trip destination. */
  TRIP_DESTINATION_CLEARED: 'trip:destination-cleared',

  /** A rider began navigating to the group destination. */
  NAVIGATION_STARTED: 'navigation:started',
  /** A rider stopped navigating. */
  NAVIGATION_STOPPED: 'navigation:stopped',
  /** A rider entered the rerouting phase (transient). */
  NAVIGATION_REROUTING: 'navigation:rerouting',
  /** A rider completed a reroute onto a new route (transient). */
  NAVIGATION_REROUTED: 'navigation:rerouted',
  /** A rider arrived at the destination. */
  NAVIGATION_ARRIVED: 'navigation:arrived',
  /** A rider lost GPS signal while navigating. */
  NAVIGATION_GPS_LOST: 'navigation:gps-lost',
  /** Generic navigation state transition (also carries ETA updates). */
  NAVIGATION_STATUS: 'navigation:status',
} as const;

export type NavigationEvent =
  (typeof NavigationEvents)[keyof typeof NavigationEvents];
