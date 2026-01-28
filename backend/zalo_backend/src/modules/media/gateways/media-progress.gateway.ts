// src/modules/media/gateways/media-progress.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

export interface ProgressUpdate {
  status: 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  thumbnailUrl?: string;
  hlsPlaylistUrl?: string;
  error?: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
    credentials: true,
  },
  namespace: '/media-progress',
})
export class MediaProgressGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MediaProgressGateway.name);

  // Track user subscriptions: userId -> Set<socketId>
  private userSockets = new Map<string, Set<string>>();

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Remove from all user subscriptions
    for (const [userId, socketSet] of this.userSockets.entries()) {
      socketSet.delete(client.id);
      if (socketSet.size === 0) {
        this.userSockets.delete(userId);
      }
    }
  }

  /**
   * Client subscribes to updates for their uploads
   */
  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, payload: { userId: string }): void {
    const { userId } = payload;

    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }

    this.userSockets.get(userId)!.add(client.id);

    this.logger.debug(`User ${userId} subscribed via socket ${client.id}`);

    client.emit('subscribed', {
      message: 'Subscribed to media progress updates',
    });
  }

  /**
   * Send progress update to specific user
   * Called by MediaConsumer during job processing
   */
  sendProgress(mediaId: string, update: ProgressUpdate): void {
    // Note: In production, you'd need to look up userId from mediaId
    // For now, emit to all connected clients (simplification)
    this.server.emit(`progress:${mediaId}`, update);

    this.logger.debug(`Progress update sent for media ${mediaId}`, update);
  }

  /**
   * Send progress to specific user only
   */
  sendProgressToUser(
    userId: string,
    mediaId: string,
    update: ProgressUpdate,
  ): void {
    const socketIds = this.userSockets.get(userId);

    if (!socketIds || socketIds.size === 0) {
      this.logger.warn(`No active sockets for user ${userId}`);
      return;
    }

    // Emit to all user's connected sockets
    socketIds.forEach((socketId) => {
      this.server.to(socketId).emit(`progress:${mediaId}`, update);
    });

    this.logger.debug(
      `Progress sent to user ${userId} for media ${mediaId}`,
      update,
    );
  }

  /**
   * Health check
   */
  @SubscribeMessage('ping')
  handlePing(client: Socket): void {
    client.emit('pong', { timestamp: Date.now() });
  }
}
