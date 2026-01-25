import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
  Inject,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import Redis from 'ioredis';
import redisConfig from '../../config/redis.config';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis;
  private subscriber: Redis;
  private publisher: Redis;

  constructor(
    @Inject(redisConfig.KEY)
    private readonly config: ConfigType<typeof redisConfig>,
  ) {
    this.logger.warn(
      `Redis Config - Host: ${this.config.host}, Password Length: ${this.config.password?.length || 0}`,
    );
    // Khởi tạo instance NGAY LẬP TỨC trong constructor
    // ioredis sẽ tự động bắt đầu kết nối ngầm
    const options = {
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      db: this.config.db,
      // Các options khác...
      maxRetriesPerRequest: this.config.maxRetriesPerRequest,
      enableReadyCheck: this.config.enableReadyCheck,
      enableOfflineQueue: this.config.enableOfflineQueue,
      retryStrategy: this.config.retryStrategy,
      connectTimeout: this.config.connectTimeout,
      commandTimeout: this.config.commandTimeout,
    };

    this.logger.log('Initializing Redis clients...');

    this.client = new Redis(options);
    this.subscriber = new Redis(options);
    this.publisher = new Redis(options);

    // Setup event handlers ngay sau khi tạo
    this.setupEventHandlers(this.client, 'Client');
    this.setupEventHandlers(this.subscriber, 'Subscriber');
    this.setupEventHandlers(this.publisher, 'Publisher');
  }

  async onModuleInit() {
    // Bây giờ onModuleInit chỉ dùng để chờ kết nối "Ready"
    // chứ không phải để tạo instance nữa.
    await this.waitForConnections();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  /**
   * Wait for Redis connections to be fully ready
   */
  private async waitForConnections(): Promise<void> {
    try {
      await Promise.all([
        this.waitForReady(this.client, 'Client'),
        this.waitForReady(this.subscriber, 'Subscriber'),
        this.waitForReady(this.publisher, 'Publisher'),
      ]);
      this.logger.log('✅ Redis connections established and ready');
    } catch (error) {
      this.logger.error('❌ Failed to connect to Redis', error);
      // Tùy chọn: throw error để crash app nếu Redis chết (Fail-fast)
      // throw error;
    }
  }
  /**
   * Establish Redis connections
   */
  private async connect(): Promise<void> {
    const options = {
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      db: this.config.db,
      maxRetriesPerRequest: this.config.maxRetriesPerRequest,
      enableReadyCheck: this.config.enableReadyCheck,
      enableOfflineQueue: this.config.enableOfflineQueue,
      retryStrategy: this.config.retryStrategy,
      connectTimeout: this.config.connectTimeout,
      commandTimeout: this.config.commandTimeout,
    };

    // Main client for general operations
    this.client = new Redis(options);

    // Dedicated subscriber for Pub/Sub
    this.subscriber = new Redis(options);

    // Dedicated publisher for Pub/Sub
    this.publisher = new Redis(options);

    // Event handlers
    this.setupEventHandlers(this.client, 'Client');
    this.setupEventHandlers(this.subscriber, 'Subscriber');
    this.setupEventHandlers(this.publisher, 'Publisher');

    // Wait for ready
    await Promise.all([
      this.waitForReady(this.client, 'Client'),
      this.waitForReady(this.subscriber, 'Subscriber'),
      this.waitForReady(this.publisher, 'Publisher'),
    ]);

    this.logger.log('✅ Redis connections established');
  }

  /**
   * Setup event handlers for Redis client
   */
  private setupEventHandlers(client: Redis, name: string): void {
    client.on('connect', () => {
      this.logger.log(`Redis ${name}: Connecting...`);
    });

    client.on('ready', () => {
      this.logger.log(`Redis ${name}: Ready`);
    });

    client.on('error', (error: any) => {
      // FIX: Chặn spam log khi lỗi là ECONNREFUSED (mất kết nối)
      if (error.code === 'ECONNREFUSED') {
        this.logger.warn(
          `Redis ${name}: Connection refused at ${error.address}:${error.port}. Retrying...`,
        );
        // Không log full stack trace để tránh spam console
        return;
      }
      this.logger.error(`Redis ${name} Error:`, error);
    });

    client.on('close', () => {
      this.logger.warn(`Redis ${name}: Connection closed`);
    });

    client.on('reconnecting', () => {
      this.logger.warn(`Redis ${name}: Reconnecting...`);
    });

    client.on('end', () => {
      this.logger.warn(`Redis ${name}: Connection ended`);
    });
  }

  /**
   * Wait for Redis client to be ready
   */
  private waitForReady(client: Redis, name: string): Promise<void> {
    if (client.status === 'ready') return Promise.resolve();

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Redis ${name} connection timeout`));
      }, 10000);

      client.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      client.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Gracefully disconnect all Redis clients
   */
  private async disconnect(): Promise<void> {
    this.logger.log('Disconnecting Redis clients...');

    await Promise.all([
      this.client.quit(),
      this.subscriber.quit(),
      this.publisher.quit(),
    ]);

    this.logger.log('❌ Redis connections closed');
  }

  /**
   * Get main Redis client
   */
  getClient(): Redis {
    return this.client;
  }

  /**
   * Get subscriber client (for Pub/Sub)
   */
  getSubscriber(): Redis {
    return this.subscriber;
  }

  /**
   * Get publisher client (for Pub/Sub)
   */
  getPublisher(): Redis {
    return this.publisher;
  }

  /**
   * Health check
   */
  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      this.logger.error('Redis health check failed:', error);
      return false;
    }
  }

  /**
   * Get Redis info
   */
  async getInfo(): Promise<{
    connected: boolean;
    host: string;
    port: number;
    db: number;
  }> {
    return Promise.resolve({
      connected: this.client.status === 'ready',
      host: this.config.host,
      port: this.config.port,
      db: this.config.db,
    });
  }
}
