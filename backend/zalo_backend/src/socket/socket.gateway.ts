import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Logger, UseFilters, Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { AuthenticatedSocket } from 'src/common/interfaces/socket-client.interface';
import { DisconnectReason } from 'src/common/interfaces/socket-client.interface';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import { WsExceptionFilter } from './filters/ws-exception.filter';
import { SocketAuthService } from './services/socket-auth.service';
import { SocketStateService } from './services/socket-state.service';
import { RedisPubSubService } from 'src/modules/redis/services/redis-pub-sub.service';
import { RedisKeys } from 'src/common/constants/redis-keys.constant';
import socketConfig from 'src/config/socket.config';
// import { createAdapter } from '@socket.io/redis-adapter';
// import { RedisService } from 'src/modules/redis/redis.service';

@WebSocketGateway({
  cors: {
    origin: [
      process.env.CORS_ORIGIN || 'http://localhost:3001',
      'http://127.0.0.1:5500',
      '*',
    ],
    credentials: true,
  },
  namespace: '/socket.io',
  transports: ['websocket', 'polling'],
  pingInterval: 25000, // 25 seconds
  pingTimeout: 20000, // 20 seconds
})
@UseFilters(WsExceptionFilter)
export class SocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SocketGateway.name);
  private shuttingDown = false;

  constructor(
    private readonly socketAuth: SocketAuthService,
    private readonly socketState: SocketStateService,
    private readonly redisPubSub: RedisPubSubService,
    // private readonly redisService: RedisService,
    @Inject(socketConfig.KEY)
    private readonly config: ConfigType<typeof socketConfig>,
  ) {}

  /**
   * Gateway initialization
   */
  afterInit(server: Server) {
    this.logger.log('🔌 Socket.IO Gateway initialized');

    // Setup Redis adapter for cluster support
    // this.setupRedisAdapter(server);

    // Subscribe to cross-server events
    // Hàm afterInit là đồng bộ, nên ta dùng 'void' để đánh dấu promise được xử lý ngầm
    // và thêm .catch để bắt lỗi nếu việc subscribe thất bại
    void this.subscribeToCrossServerEvents().catch((err) => {
      this.logger.error('Failed to subscribe to cross-server events', err);
    });

    // Setup graceful shutdown
    this.setupGracefulShutdown();

    this.logger.log(`📡 Server instance: ${this.config.serverInstance}`);
  }

  /**
   * Setup Redis adapter for multi-instance support
   */
  // private setupRedisAdapter(server: Server): void {
  //   const pubClient = this.redisService.getPublisher();
  //   const subClient = this.redisService.getSubscriber();

  //   // Create Redis adapter
  //   const adapter = createAdapter(pubClient, subClient);
  //   server.adapter(adapter);

  //   this.logger.log('✅ Redis adapter configured for Socket.IO');
  // }

  /**
   * Subscribe to Redis Pub/Sub channels for cross-server communication
   */
  private async subscribeToCrossServerEvents(): Promise<void> {
    // Subscribe to presence updates
    await this.redisPubSub.subscribe(
      RedisKeys.channels.presenceOnline,
      this.handlePresenceOnline.bind(this),
    );

    await this.redisPubSub.subscribe(
      RedisKeys.channels.presenceOffline,
      this.handlePresenceOffline.bind(this),
    );

    this.logger.log('✅ Subscribed to cross-server events');
  }

  /**
   * Handle new client connection
   */
  async handleConnection(@ConnectedSocket() client: AuthenticatedSocket) {
    try {
      this.logger.log(`Socket connecting: ${client.id}`);

      // Reject connections during shutdown
      if (this.shuttingDown) {
        client.emit(SocketEvents.SERVER_MAINTENANCE, {
          message: 'Server is shutting down. Please reconnect.',
        });
        client.disconnect(true);
        return;
      }

      // Authenticate socket
      const user = await this.socketAuth.authenticateSocket(client);

      if (!user) {
        this.logger.warn(`Socket ${client.id}: Authentication failed`);
        client.emit(SocketEvents.AUTH_FAILED, {
          message: 'Authentication failed',
        });
        client.disconnect(true);
        return;
      }

      // Attach user to socket
      client.user = user;
      client.userId = user.id;
      client.authenticated = true;

      // Register socket and update presence
      await this.socketState.handleConnection(client);

      // Notify client of successful authentication
      client.emit(SocketEvents.AUTHENTICATED, {
        socketId: client.id,
        userId: user.id,
        serverInstance: this.config.serverInstance,
      });

      // Publish presence update (cross-server)
      await this.redisPubSub.publish(RedisKeys.channels.presenceOnline, {
        userId: user.id,
        timestamp: new Date().toISOString(),
      });

      this.logger.log(
        `✅ Socket authenticated: ${client.id} | User: ${user.id} | ${user.displayName}`,
      );
    } catch (error) {
      this.logger.error('Error handling connection:', error);
      client.disconnect(true);
    }
  }

  /**
   * Handle client disconnection
   */
  async handleDisconnect(@ConnectedSocket() client: AuthenticatedSocket) {
    try {
      // Sử dụng unknown trước, sau đó ép về kiểu object an toàn
      const handshakeData = client.handshake as unknown as Record<string, any>;

      const reason =
        (handshakeData.disconnectReason as string) ||
        DisconnectReason.CLIENT_DISCONNECT;

      this.logger.log(
        `Socket disconnecting: ${client.id} | User: ${client.userId} | Reason: ${reason}`,
      );

      if (!client.userId) {
        return;
      }

      // Update state and presence
      const isOffline = await this.socketState.handleDisconnection(
        client,
        reason,
      );

      // If user is now completely offline, publish presence update
      if (isOffline) {
        await this.redisPubSub.publish(RedisKeys.channels.presenceOffline, {
          userId: client.userId,
          timestamp: new Date().toISOString(),
        });
      }

      this.logger.log(`❌ Socket disconnected: ${client.id}`);
    } catch (error) {
      this.logger.error('Error handling disconnect:', error);
    }
  }

  /**
   * Handle presence online event from other servers
   */
  private async handlePresenceOnline(
    channel: string,
    message: string,
  ): Promise<void> {
    try {
      const data = JSON.parse(message);
      this.logger.debug(`Presence online (cross-server): ${data.userId}`);

      // TODO: Phase 2 - Notify user's friends
      // For now, just log
    } catch (error) {
      this.logger.error('Error handling presence online:', error);
    }
  }

  /**
   * Handle presence offline event from other servers
   */
  private async handlePresenceOffline(
    channel: string,
    message: string,
  ): Promise<void> {
    try {
      const data = JSON.parse(message);
      this.logger.debug(`Presence offline (cross-server): ${data.userId}`);

      // TODO: Phase 2 - Notify user's friends
      // For now, just log
    } catch (error) {
      this.logger.error('Error handling presence offline:', error);
    }
  }

  /**
   * Setup graceful shutdown handler
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.shuttingDown) return;

      this.shuttingDown = true;
      this.logger.warn(`⚠️  ${signal} received. Starting graceful shutdown...`);

      try {
        // Stop accepting new connections
        this.server.close();

        // Notify all connected clients
        this.server.emit(SocketEvents.SERVER_SHUTDOWN, {
          message: 'Server is shutting down. Please reconnect.',
          reconnect: true,
        });

        // Wait for clients to disconnect gracefully
        await this.waitForClientsToDisconnect(
          this.config.gracefulShutdownTimeout,
        );

        // Force disconnect remaining clients
        const sockets = await this.server.fetchSockets();
        for (const socket of sockets) {
          socket.disconnect(true);
        }

        this.logger.log('✅ Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        this.logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('SIGINT', () => void shutdown('SIGINT'));
  }

  /**
   * Wait for clients to disconnect gracefully
   */
  private async waitForClientsToDisconnect(timeout: number): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const sockets = await this.server.fetchSockets();

      if (sockets.length === 0) {
        this.logger.log('All clients disconnected gracefully');
        return;
      }

      this.logger.log(`Waiting for ${sockets.length} clients to disconnect...`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    this.logger.warn('Graceful shutdown timeout reached');
  }

  /**
   * Emit event to specific user (all their sockets)
   */
  async emitToUser(userId: string, event: string, data: any): Promise<void> {
    const socketIds = await this.socketState.getUserSockets(userId);

    for (const socketId of socketIds) {
      this.server.to(socketId).emit(event, data);
    }
  }

  /**
   * Emit event to multiple users
   */
  async emitToUsers(
    userIds: string[],
    event: string,
    data: any,
  ): Promise<void> {
    await Promise.all(
      userIds.map((userId) => this.emitToUser(userId, event, data)),
    );
  }

  /**
   * Broadcast to all connected clients
   */
  broadcastToAll(event: string, data: any): void {
    this.server.emit(event, data);
  }

  /**
   * Get server statistics
   */
  async getServerStats(): Promise<{
    connectedSockets: number;
    serverInstance: string;
  }> {
    const sockets = await this.server.fetchSockets();

    return {
      connectedSockets: sockets.length,
      serverInstance: this.config.serverInstance,
    };
  }
}
