import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import {
  Logger,
  UseFilters,
  Inject,
  UseGuards,
  UsePipes,
  forwardRef,
} from '@nestjs/common';
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
import { WsThrottleGuard } from './guards/ws-throttle.guard';
import { WsValidationPipe } from './pipes/ws-validation.pipe';
import { SendMessageDto } from './dto/socket-event.dto';
import { sleep } from '@nestjs/terminus/dist/utils';
import { MessagingGateway } from 'src/modules/messaging/messaging.gateway';
// import { createAdapter } from '@socket.io/redis-adapter';
// import { RedisService } from 'src/modules/redis/redis.service';

// Helper Interface để quản lý subscription

@WebSocketGateway({
  cors: {
    origin: (requestOrigin, callback) => {
      // 1. Lấy danh sách origin cho phép từ biến môi trường
      const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',');

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
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
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
    // private readonly redisService: RedisService,
    @Inject(forwardRef(() => MessagingGateway))
    private readonly messagingGateway: MessagingGateway,
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

  // ==================================================================
  // SAFE RESOURCE MANAGEMENT HELPERS (TASK 2)
  // ==================================================================

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
      // client.user = undefined;
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
      await this.redisPubSub.publish(RedisKeys.channels.presenceOnline, {
        userId: user.id,
        timestamp: new Date().toISOString(),
      });

      // --- VÍ DỤ SỬ DỤNG SAFE INTERVAL (TASK 2 APPLIED) ---
      // Gửi packet 'pong' application-level mỗi 30s để đảm bảo kết nối "sống"
      // Socket.IO có ping/pong riêng, nhưng cái này dùng để sync time hoặc check app state
      this.registerSafeInterval(
        client,
        () => {
          if (client.connected) {
            client.emit('server_heartbeat', { ts: Date.now() });
          }
        },
        30_000,
      );

      await this.messagingGateway.handleUserConnected(client);

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
      // Logic nghiệp vụ (có thể gây lỗi)
      await this.messagingGateway.handleUserDisconnected(client);
    } catch (error) {
      this.logger.error('Error handling disconnect:', error);
    } finally {
      this.cleanupSocketResources(client);

      this.logger.log(`❌ Socket disconnected: ${client.id}`);
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

  // @SubscribeMessage('test:message')
  // async handleTestMessage(
  //   @ConnectedSocket() client: AuthenticatedSocket,
  //   @MessageBody() payload: SendMessageDto, // Sử dụng DTO thật để test validation pipe
  // ) {
  //   // 1. DTO Validation sẽ chạy tự động nhờ @UsePipes
  //   await sleep(20);
  //   // 2. Giả lập xử lý nghiệp vụ nhẹ (để tốn chút CPU)
  //   this.logger.debug(
  //     `[LoadTest] Received msg from ${client.userId}: ${payload.content.substring(0, 20)}...`,
  //   );

  //   // 3. Giả lập phản hồi (ACK) để Artillery đo được latency
  //   return {
  //     event: 'message_sent',
  //     data: {
  //       messageId: 'mock-uuid-' + Date.now(),
  //       timestamp: new Date().toISOString(),
  //     },
  //   };
  // }

  /**
   * LOAD TEST HANDLER: Spam target
   */
  // @SubscribeMessage('test:spam')
  // async handleTestSpam(
  //   @ConnectedSocket() client: AuthenticatedSocket,
  //   @MessageBody() data: any,
  // ) {
  //   await sleep(5);
  //   // Handler này để trống hoặc log nhẹ, chủ yếu để test WsThrottleGuard có chặn không
  //   // Nếu Guard chặn, request sẽ không bao giờ vào đến đây (hoặc vào nhưng client đã nhận lỗi)
  //   return { status: 'received' };
  // }

  /**
   * LOAD TEST HANDLER: Large Payload
   */
  // @SubscribeMessage('test:large_payload')
  // async handleLargePayload(
  //   @ConnectedSocket() client: AuthenticatedSocket,
  //   @MessageBody() data: any,
  // ) {
  //   await sleep(15);
  //   // Test xem server có bị OOM khi nhận payload lớn không
  //   return { size: JSON.stringify(data).length };
  // }
  // @SubscribeMessage('test:slow_message')
  // async handleSlowMessage(
  //   @ConnectedSocket() client: AuthenticatedSocket,
  //   @MessageBody() data: any,
  // ) {
  //   // Log nhẹ để biết client chậm vẫn đang gửi
  //   // this.logger.debug(`[SlowClient] ${client.userId} sent message`);

  //   // Giả lập server cũng xử lý chậm
  //   await sleep(50);

  //   return { status: 'ack_slow' };
  // }
  // @SubscribeMessage('test:after_idle')
  // async handleAfterIdle(
  //   @ConnectedSocket() client: AuthenticatedSocket,
  //   @MessageBody() data: any,
  // ) {
  //   await sleep(1);
  //   this.logger.log(
  //     `[IdleTest] ${client.userId} is still alive after long idle!`,
  //   );
  //   return { status: 'alive' };
  // }
}
