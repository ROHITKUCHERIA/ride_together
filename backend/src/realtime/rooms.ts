/** Socket.IO room naming shared by the realtime gateway and jam broadcasts. */
export const TRIP_ROOM_PREFIX = 'trip:';

export function tripRoomName(tripId: string): string {
  return `${TRIP_ROOM_PREFIX}${tripId}`;
}
