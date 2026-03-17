import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import {
  Logger,
  UseFilters,
  Inject,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { AuthenticatedSocket } from 'src/common/interfaces/socket-client.interface';
import { DisconnectReason } from 'src/common/interfaces/socket-client.interface';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import { WsExceptionFilter } from './filters/ws-exception.filter';
import { SocketAuthService } from './services/socket-auth.service';
import { SocketStateService } from './services/socket-state.service';
import { RedisPubSubService } from 'src/modules/redis/services/redis-pub-sub.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';
import socketConfig from 'src/config/socket.config';
import { WsThrottleGuard } from './guards/ws-throttle.guard';
import { WsValidationPipe } from './pipes/ws-validation.pipe';
import { EventPublisher } from 'src/shared/events/event-publisher.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OnEvent } from '@nestjs/event-emitter';
import { QR_INTERNAL_EVENTS } from 'src/common/constants/internal-events.constant';
import type { ISocketEmitEvent } from '@common/events/outbound-socket.event';
import { OUTBOUND_SOCKET_EVENT } from '@common/events/outbound-socket.event';

@WebSocketGateway({
  cors: {
    origin: (requestOrigin, callback) => {
      // 1. Lấy danh sách origin cho phép từ biến môi trường
      const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',');

      // 2. Logic kiểm tra (Allow all nếu là '*' hoặc dev mode)
      if (
        !requestOrigin ||
        allowedOrigins.includes('*') ||
        allowedOrigins.includes(requestOrigin)
      ) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  },
  namespace: '/socket.io',
  transports: ['websocket', 'polling'],
  pingInterval: process.env.PING_INTERVAL
    ? parseInt(process.env.PING_INTERVAL, 10)
    : 25000, // 25 seconds
  pingTimeout: process.env.PING_TIMEOUT
    ? parseInt(process.env.PING_TIMEOUT, 10)
    : 20000, // 20 seconds
})
// Exception filter for handling WS exceptions
@UseFilters(WsExceptionFilter)
// rate limiting guard
@UseGuards(WsThrottleGuard)
// Validation pipe for incoming messages
@UsePipes(WsValidationPipe)
export class SocketGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(SocketGateway.name);
  private shuttingDown = false;

  // --- MEMORY MANAGEMENT START ---
  // Lưu trữ các subscription động nếu sau này dùng (ví dụ subscribe chat room từ Redis)
  private readonly clientSubscriptions = new Map<string, Array<() => void>>();
  // --- MEMORY MANAGEMENT END ---
  constructor(
    private readonly socketAuth: SocketAuthService,
    private readonly socketState: SocketStateService,
    private readonly redisPubSub: RedisPubSubService,
    private readonly eventPublisher: EventPublisher,
    private readonly eventEmitter: EventEmitter2,
    @Inject(socketConfig.KEY)
    private readonly config: ConfigType<typeof socketConfig>,
  ) { }

  /**
   * Gateway initialization
   */
  afterInit() {
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

  // =========================================================================
  // B. INTERNAL EVENT LISTENERS (NEW STANDARD INTERFACE)
  // =========================================================================

  /**
   * Universal listener for standard domain outward socket events
   */
  @OnEvent(OUTBOUND_SOCKET_EVENT)
  async handleStandardOutboundEvent(payload: ISocketEmitEvent) {
    this.logger.debug(`[SocketGateway] Emitting standard event: ${payload.event}`);

    if (payload.socketId) {
      this.emitToSocket(payload.socketId, payload.event, payload.data);
    } else if (payload.userId) {
      await this.emitToUser(payload.userId, payload.event, payload.data);
    } else if (payload.userIds && payload.userIds.length > 0) {
      await Promise.all(
        payload.userIds.map((uid) =>
          this.emitToUser(uid, payload.event, payload.data).catch(() => undefined),
        ),
      );
    } else if (payload.room) {
      this.server.to(payload.room).emit(payload.event, payload.data);
    } else {
      this.logger.warn(`[SocketGateway] Received outbound event without target: ${payload.event}`);
    }
  }

  /**
   * Internal command to force disconnect devices
   */
  @OnEvent('socket.internal.command.force_disconnect_devices')
  async handleForceDisconnectCommand(payload: { userId: string, deviceIds: string[], reason: string }) {
    this.logger.debug(`[SocketGateway] Internal command: Force disconnecting ${payload.deviceIds?.length} devices for ${payload.userId}`);
    await this.forceDisconnectDevices(payload.userId, payload.deviceIds, payload.reason);
  }

  // =========================================================================
  // C. CLIENT LISTENER METHODS
  // ===========================================================================

  /**
   * Đăng ký Interval an toàn - Tự động dọn dẹp khi socket disconnect
   */
  private registerSafeInterval(
    client: AuthenticatedSocket,
    callback: () => void,
    ms: number,
  ) {
    if (!client._cleanupTimers) {
      client._cleanupTimers = [];
    }
    const timer = setInterval(callback, ms);
    client._cleanupTimers.push(timer);
  }

  /**
   * Đăng ký Timeout an toàn - Tự động dọn dẹp khi socket disconnect
   */
  private registerSafeTimeout(
    client: AuthenticatedSocket,
    callback: () => void,
    ms: number,
  ) {
    if (!client._cleanupTimers) {
      client._cleanupTimers = [];
    }
    const timer = setTimeout(() => {
      callback();
      // (Optional) Remove timer from array after execution logic could go here
      // but for MVP, let cleanup handle it.
    }, ms);
    client._cleanupTimers.push(timer);
  }

  /**
   * Dọn dẹp tài nguyên tập trung (Cleanup Central)
   * Đây là chốt chặn cuối cùng để ngăn Memory Leak
   */
  private cleanupSocketResources(client: AuthenticatedSocket) {
    // A. Clear Timers (Interval/Timeout)
    if (client._cleanupTimers && client._cleanupTimers.length > 0) {
      client._cleanupTimers.forEach((timer) => {
        clearInterval(timer); // Works for both Timeout and Interval in Node.js
        clearTimeout(timer);
      });
      client.removeAllListeners();
      client._cleanupTimers = [];
    }

    // B. Unsubscribe Dynamic Redis Subscriptions (Phase 2 Chat)
    const unsubscribers = this.clientSubscriptions.get(client.id);
    if (unsubscribers) {
      unsubscribers.forEach((unsub) => unsub());
      this.clientSubscriptions.delete(client.id);
    }

    // C. Remove All Listeners on Socket Object
    // Ngăn chặn việc listener cũ giữ reference tới object socket
    client.removeAllListeners();

    // D. Nullify References (Hint for Garbage Collector)
    // Giúp V8 Engine nhận diện object này đã chết nhanh hơn
    client.user = undefined;
    client.userId = undefined;
    client.deviceId = undefined;
  }

  /**
   * Subscribe to Redis Pub/Sub channels for cross-server communication
   */
  private async subscribeToCrossServerEvents(): Promise<void> {
    // Subscribe to presence updates
    await this.redisPubSub.subscribe(
      RedisKeyBuilder.channels.presenceOnline,
      (channel, message) => void this.handlePresenceOnline(channel, message),
    );

    await this.redisPubSub.subscribe(
      RedisKeyBuilder.channels.presenceOffline,
      (channel, message) => void this.handlePresenceOffline(channel, message),
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
        // Allow unauthenticated connection for specific use cases (like QR login)
        if (client.handshake?.query?.type === 'public') {
          this.logger.log(`Socket connecting as public (unauthenticated): ${client.id}`);
          client.authenticated = false;
          await this.socketState.handleConnection(client);
          return;
        }

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
      // Init timer array
      client._cleanupTimers = [];
      // Register socket and update presence
      await this.socketState.handleConnection(client);

      // Notify client of successful authentication
      client.emit(SocketEvents.AUTHENTICATED, {
        socketId: client.id,
        userId: user.id,
        serverInstance: this.config.serverInstance,
      });

      // Publish presence update (cross-server)
      void this.redisPubSub.publish(RedisKeyBuilder.channels.presenceOnline, {
        userId: user.id,
        timestamp: new Date().toISOString(),
      });

      // PHASE 2: Emit event for module gateways to setup their subscriptions
      // MessageGateway will listen to this and subscribe user to receipt updates
      this.eventEmitter.emit(SocketEvents.USER_SOCKET_CONNECTED, {
        userId: user.id,
        socketId: client.id,
        socket: client,
        connectedAt: new Date(),
      });

      // --- VÍ DỤ SỬ DỤNG SAFE INTERVAL (TASK 2 APPLIED) ---
      // Gửi packet 'pong' application-level mỗi 30s để đảm bảo kết nối "sống"
      // Socket.IO có ping/pong riêng, nhưng cái này dùng để sync time hoặc check app state
      this.registerSafeInterval(
        client,
        async () => {
          if (client.connected && client.userId) {
            await this.socketState.refreshHeartbeat(client.id, client.userId);
            client.emit(SocketEvents.SERVER_HEARTBEAT, { ts: Date.now() });
          }
        },
        30_000,
      );

      // PHASE 2: Emit event for presence tracking
      // MessagingUserPresenceListener will react to this
      this.logger.debug(
        `[Socket] User ${client.userId} connected on socket ${client.id}`,
      );

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

      // Check if user has other active sockets
      // Update state and presence
      const isOffline = await this.socketState.handleDisconnection(
        client,
        reason,
      );

      // If user is now completely offline, publish presence update
      if (isOffline) {
        const now = new Date();

        // DECOUPLED: Let User module handle DB updates via event
        this.eventEmitter.emit('user.last_seen.updated', {
          userId: client.userId,
          lastSeenAt: now,
        });

        void this.redisPubSub.publish(
          RedisKeyBuilder.channels.presenceOffline,
          {
            userId: client.userId,
            timestamp: now.toISOString(),
          },
        );

        // Note: The UserPresenceListener (FriendshipModule) will catch the USER_SOCKET_DISCONNECTED event below
        // and notify friends, so we don't need to do it here.
      }

      // Emit internal event for other gateways/listeners to cleanup resources
      this.eventEmitter.emit(SocketEvents.USER_SOCKET_DISCONNECTED, {
        userId: client.userId,
        socketId: client.id,
        reason,
      });

      this.logger.debug(
        `[Socket] User ${client.userId} disconnected from socket ${client.id}`,
      );
    } catch (error) {
      this.logger.error('Error handling disconnect:', error);
    } finally {
      this.cleanupSocketResources(client);

      this.logger.log(`❌ Socket disconnected: ${client.id}`);
    }
  }

  private async handlePresenceOnline(
    channel: string,
    message: string,
  ): Promise<void> {
    try {
      const data = JSON.parse(message) as { userId?: string };
      this.logger.debug(`Presence online (cross-server): ${data.userId}`);

      // The domain module (Friendship) should ideally listen to cross-server presence,
      // but if we just emit the internal event, it will catch it!
      if (data.userId) {
        this.eventEmitter.emit(SocketEvents.USER_SOCKET_CONNECTED, {
          userId: data.userId,
          socketId: null, // Cross-server doesn't matter
          connectedAt: new Date()
        });
      }
    } catch (error) {
      this.logger.error('Error handling presence online:', error);
    }
  }

  private async handlePresenceOffline(
    channel: string,
    message: string,
  ): Promise<void> {
    try {
      const data = JSON.parse(message) as { userId?: string };
      this.logger.debug(`Presence offline (cross-server): ${data.userId}`);

      if (data.userId) {
        this.eventEmitter.emit(SocketEvents.USER_SOCKET_DISCONNECTED, {
          userId: data.userId,
          socketId: null,
          reason: 'cross-server offline'
        });
      }
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
          // Cast về AuthenticatedSocket để gọi cleanup nếu cần
          // Tuy nhiên socket.io object khác với class instance này.
          // Ở đây chỉ cần force disconnect, handleDisconnect sẽ tự chạy.
          socket.disconnect(true);
        }

        this.logger.log('✅ Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        this.logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    void process.on('SIGTERM', () => void shutdown('SIGTERM'));
    void process.on('SIGINT', () => void shutdown('SIGINT'));
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
   * Target: Single User
   */
  async emitToUser(userId: string, event: string, data: any): Promise<void> {
    try {
      // 1. Lấy danh sách socket ID của user từ Redis/State
      const socketIds = await this.socketState.getUserSockets(userId);

      if (!socketIds || socketIds.length === 0) {
        // User offline, bỏ qua (hoặc có thể push noti qua FCM/APNS ở đây)
        return;
      }

      // 2. Gửi event tới từng socket
      // Dùng this.server.to(socketId).emit(...) là cách chuẩn của Socket.io
      this.server.to(socketIds).emit(event, data);
    } catch (error) {
      this.logger.error(`Failed to emit to user ${userId}`, error);
    }
  }

  /**
   * Emit event to a specific socket connection directly by socketId
   * Target: Single WebSocket Connection
   */
  emitToSocket(socketId: string, event: string, data: any): void {
    try {
      this.server.to(socketId).emit(event, data);
    } catch (error) {
      this.logger.error(`Failed to emit to socket ${socketId}`, error);
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
  /**
   * Force disconnect a user (e.g. Banned, Security check)
   */
  async forceDisconnectUser(
    userId: string,
    reason: string = 'Forced logout',
  ): Promise<void> {
    const socketIds = await this.socketState.getUserSockets(userId);
    await Promise.all(
      socketIds.map(async (socketId) => {
        // Emit via adapter so multi-instance setups can deliver to remote sockets.
        this.server.to(socketId).emit(SocketEvents.AUTH_FORCE_LOGOUT, { reason });
        await new Promise((resolve) => setTimeout(resolve, 120));
        this.server.in(socketId).disconnectSockets(true);
      }),
    );
  }

  /**
   * Force disconnect specific devices for a user (enforce 1PC rule)
   */
  async forceDisconnectDevices(
    userId: string,
    deviceIds: string[],
    reason: string = 'Forced logout',
  ): Promise<void> {
    const socketIds = await this.socketState.getUserSockets(userId);

    for (const socketId of socketIds) {
      // Get metadata to check the deviceId of this socket
      const metadata = await this.socketState.getSocketMetadata(socketId);

      if (metadata && deviceIds.includes(metadata.deviceId)) {
        this.server.to(socketId).emit(SocketEvents.AUTH_FORCE_LOGOUT, {
          reason,
        });
        await new Promise((resolve) => setTimeout(resolve, 120));
        this.server.in(socketId).disconnectSockets(true);
        this.logger.log(
          `Force disconnected socket ${socketId} (Device: ${metadata.deviceId}) for user ${userId}`,
        );
      }
    }
  }

  /**
   * [NEW] Force remove a user from a specific room
   * Used when: Block user, Unfriend, Privacy change
   */
  async removeUserFromRoom(userId: string, roomName: string): Promise<void> {
    try {
      // 1. Lấy danh sách socket ID của user
      const socketIds = await this.socketState.getUserSockets(userId);

      if (socketIds.length === 0) return;

      // 2. Duyệt qua từng socket và leave room
      // Lưu ý: Với Adapter Redis, việc leave room cần thực hiện cẩn thận
      // Cách đơn giản nhất trong kiến trúc Socket.io cluster:
      for (const socketId of socketIds) {
        this.server.in(socketId).socketsLeave(roomName);
      }
      this.logger.debug(`Removed user ${userId} from room ${roomName}`);
    } catch (error) {
      this.logger.error(
        `Failed to remove user ${userId} from room ${roomName}`,
        error,
      );
    }
  }

  /**
   * [NEW] Join a user to a specific room
   * Used when: Accept friend request (subscribe to presence)
   */
  async joinUserToRoom(userId: string, roomName: string): Promise<void> {
    const socketIds = await this.socketState.getUserSockets(userId);
    socketIds.forEach((socketId) => {
      this.server.in(socketId).socketsJoin(roomName);
    });
  }
}
