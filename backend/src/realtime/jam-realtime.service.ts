import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';
import { tripRoomName } from './rooms';
import type { JamDeletedPayload, JamState } from '../jam/jam.types';

/**
 * Broadcasts authoritative Jam events to a trip room. The single Socket.IO
 * server instance (owned by RealtimeGateway) is attached during gateway init so
 * REST-originated Jam mutations can reach every connected rider in realtime
 * without the service layer depending on the gateway itself.
 */
@Injectable()
export class JamRealtimeService {
  private server: Server | null = null;

  attach(server: Server): void {
    this.server = server;
  }

  /** Publishes the authoritative state to the whole trip room (incl. sender). */
  broadcastJamState(tripId: string, state: JamState): void {
    this.server?.to(tripRoomName(tripId)).emit('jam:state', state);
  }

  /** Tells every trip member the Jam is gone (no page refresh required). */
  broadcastJamDeleted(tripId: string, payload: JamDeletedPayload): void {
    this.server?.to(tripRoomName(tripId)).emit('jam:deleted', payload);
  }
}
