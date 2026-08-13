import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, ServerOptions } from 'socket.io';

/**
 * Socket.IO adapter that reflects the same CORS policy as the HTTP layer —
 * only the configured frontend origin is allowed.
 */
export class SocketIoAdapter extends IoAdapter {
  constructor(
    app: INestApplication,
    private readonly frontendUrl: string,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    return super.createIOServer(port, {
      ...options,
      cors: {
        origin: this.frontendUrl,
        credentials: true,
      },
    }) as Server;
  }
}
