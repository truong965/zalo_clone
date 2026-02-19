// src/modules/media/gateways/media-progress.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Inject, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ConfigType } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from 'src/modules/auth/interfaces/jwt-payload.interface';
import jwtConfig from 'src/config/jwt.config';

export interface ProgressUpdate {
  status: 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  thumbnailUrl?: string;
  hlsPlaylistUrl?: string;
  error?: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || 'http://localhost:5173',
    credentials: true,
  },
  namespace: '/media-progress',
})
export class MediaProgressGateway
  implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MediaProgressGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    @Inject(jwtConfig.KEY)
    private readonly jwtConfiguration: ConfigType<typeof jwtConfig>,
  ) { }

  async handleConnection(client: Socket) {
    try {
      const userId = await this.authenticateClient(client);
      if (!userId) {
        this.logger.warn(`Unauthenticated connection rejected: ${client.id}`);
        client.disconnect(true);
        return;
      }

      // Join user-specific room so sendProgress can target by userId
      await client.join(`user:${userId}`);
      // Store userId on socket data for disconnect cleanup
      client.data.userId = userId as string;

      this.logger.log(`Media WS connected: ${client.id} → user:${userId}`);
      client.emit('connected', { message: 'Media progress connected' });
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(
      `Media WS disconnected: ${client.id} (user:${client.data.userId ?? 'unknown'})`,
    );
  }

  /**
   * Send progress update exclusively to the user who owns the media.
   * Uses a per-user Socket.IO room — no other client receives this event.
   *
   * @param mediaId  - ID of the MediaAttachment being processed
   * @param update   - Progress payload
   * @param userId   - Owner's user ID (from media.uploadedBy); REQUIRED.
   */
  sendProgress(mediaId: string, update: ProgressUpdate, userId: string): void {
    this.server.to(`user:${userId}`).emit(`progress:${mediaId}`, update);
    this.logger.debug(`Progress → user:${userId} media:${mediaId}`, update);
  }

  /**
   * Health check
   */
  @SubscribeMessage('ping')
  handlePing(client: Socket): void {
    client.emit('pong', { timestamp: Date.now() });
  }

  // --- PRIVATE ---

  private async authenticateClient(client: Socket): Promise<string | null> {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.headers?.authorization as string | undefined)
          ?.replace('Bearer ', '')
          .trim();

      if (!token) return null;

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.jwtConfiguration.accessToken.secret,
      });

      if (payload.type !== 'access' || !payload.sub) return null;

      return payload.sub;
    } catch {
      return null;
    }
  }
}
