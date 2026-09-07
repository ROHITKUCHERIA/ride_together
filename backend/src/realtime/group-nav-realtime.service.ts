import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';
import { NavigationEvents } from '../socket/events/navigation.events';
import { tripRoomName } from './rooms';
import type {
  NavigationDestinationSnapshot,
  NavigationSessionPayload,
} from '../navigation/interfaces/navigation-session.interface';

export interface DestinationUpdatedPayload {
  tripId: string;
  destination: NavigationDestinationSnapshot;
}

export interface DestinationClearedPayload {
  tripId: string;
  destination: null;
}

/**
 * Broadcasts authoritative group-navigation events to a trip room. The single
 * Socket.IO server instance (owned by RealtimeGateway) is attached during
 * gateway init, so REST-originated destination/navigation mutations reach every
 * connected rider in realtime without the service layer depending on the
 * gateway itself. Mirrors JamRealtimeService.
 */
@Injectable()
export class GroupNavRealtimeService {
  private server: Server | null = null;

  attach(server: Server): void {
    this.server = server;
  }

  /** Host set/updated the shared destination. */
  broadcastDestinationUpdated(payload: DestinationUpdatedPayload): void {
    this.server
      ?.to(tripRoomName(payload.tripId))
      .emit(NavigationEvents.TRIP_DESTINATION_UPDATED, payload);
  }

  /** Host cleared the shared destination. */
  broadcastDestinationCleared(payload: DestinationClearedPayload): void {
    this.server
      ?.to(tripRoomName(payload.tripId))
      .emit(NavigationEvents.TRIP_DESTINATION_CLEARED, payload);
  }

  /** A rider's navigation session state changed. */
  broadcastSession(event: string, payload: NavigationSessionPayload): void {
    this.server?.to(tripRoomName(payload.tripId)).emit(event, payload);
  }
}
