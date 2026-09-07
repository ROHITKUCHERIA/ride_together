/** Wire-format shared trip destination returned/emitted by the API. */
export interface TripDestinationWire {
  latitude: number;
  longitude: number;
  name?: string;
  setByUserId?: string | null;
  setAt?: string | null;
}

export interface TripDestinationResult {
  /** null when the trip has no shared destination coordinates. */
  destination: TripDestinationWire | null;
}

export interface TripDestinationRow {
  destination: string;
  destinationLatitude: number | null;
  destinationLongitude: number | null;
  destinationSetBy: string | null;
  destinationSetAt: Date | null;
}

export function toDestinationWire(
  trip: TripDestinationRow,
): TripDestinationWire | null {
  if (trip.destinationLatitude == null || trip.destinationLongitude == null) {
    return null;
  }
  return {
    latitude: trip.destinationLatitude,
    longitude: trip.destinationLongitude,
    name: trip.destination,
    setByUserId: trip.destinationSetBy,
    setAt: trip.destinationSetAt ? trip.destinationSetAt.toISOString() : null,
  };
}
