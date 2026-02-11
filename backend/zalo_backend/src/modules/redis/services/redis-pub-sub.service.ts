import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis.service';
import { safeStringify } from 'src/common/utils/json.util';

export type MessageHandler = (
  channel: string,
  message: string,
) => void | Promise<void>;

@Injectable()
export class RedisPubSubService implements OnModuleInit {
  private readonly logger = new Logger(RedisPubSubService.name);
  private handlers = new Map<string, Set<MessageHandler>>();

  constructor(private readonly redisService: RedisService) {
    // this.setupSubscriber();
  }

  onModuleInit() {
    this.setupSubscriber();
  }
  /**
   * Setup subscriber with message handler
   */
  private setupSubscriber(): void {
    const subscriber = this.redisService.getSubscriber();

    if (!subscriber) {
      this.logger.error('Redis Subscriber client is not initialized!');
      return;
    }
    //gọi hàm xử lý riêng để đảm bảo return type là void
    subscriber.on('message', (channel: string, message: string) => {
      void this.handleMessage(channel, message);
    });
  }
  /**
   * Xử lý logic khi nhận message (Tách ra để code sạch hơn)
   */
  private async handleMessage(channel: string, message: string): Promise<void> {
    const channelHandlers = this.handlers.get(channel);
    if (!channelHandlers) return;

    // Execute all handlers for this channel
    for (const handler of channelHandlers) {
      try {
        await handler(channel, message);
      } catch (error) {
        this.logger.error(
          `Error handling message on channel ${channel}:`,
          error,
        );
      }
    }
  }
  /**
   * Subscribe to a channel with handler
   */
  async subscribe(channel: string, handler: MessageHandler): Promise<void> {
    const subscriber = this.redisService.getSubscriber();

    let channelHandlers = this.handlers.get(channel);

    // Nếu chưa có thì khởi tạo mới
    if (!channelHandlers) {
      channelHandlers = new Set();
      this.handlers.set(channel, channelHandlers);

      // Chỉ subscribe Redis khi đây là handler đầu tiên của channel
      await subscriber.subscribe(channel);
      this.logger.log(`Subscribed to channel: ${channel}`);
    }

    channelHandlers.add(handler);
  }

  /**
   * Unsubscribe from a channel
   */
  async unsubscribe(channel: string, handler?: MessageHandler): Promise<void> {
    const subscriber = this.redisService.getSubscriber();
    const channelHandlers = this.handlers.get(channel);

    if (!channelHandlers) return;

    if (handler) {
      // Remove specific handler
      channelHandlers.delete(handler);

      // If no handlers left, unsubscribe from channel
      if (channelHandlers.size === 0) {
        this.handlers.delete(channel);
        await subscriber.unsubscribe(channel);
        this.logger.log(`Unsubscribed from channel: ${channel}`);
      }
    } else {
      // Remove all handlers for this channel
      this.handlers.delete(channel);
      await subscriber.unsubscribe(channel);
      this.logger.log(`Unsubscribed from channel: ${channel}`);
    }
  }

  /**
   * Publish message to channel
   */
  async publish(channel: string, message: any): Promise<number> {
    const publisher = this.redisService.getPublisher();
    const payload =
      typeof message === 'string' ? message : safeStringify(message);

    const subscriberCount = await publisher.publish(channel, payload);

    if (subscriberCount === 0) {
      this.logger.debug(`No subscribers for channel: ${channel}`);
    }

    return subscriberCount;
  }

  /**
   * Publish to multiple channels
   */
  async publishToMultiple(channels: string[], message: any): Promise<void> {
    await Promise.all(
      channels.map((channel) => this.publish(channel, message)),
    );
  }

  /**
   * Get number of subscribers for a channel
   */
  async getSubscriberCount(channel: string): Promise<number> {
    const client = this.redisService.getClient();
    const result = await client.pubsub('NUMSUB', channel);
    return result[1] as number;
  }
}
