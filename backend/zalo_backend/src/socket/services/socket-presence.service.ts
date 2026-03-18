import { Injectable, Logger } from '@nestjs/common';
import { RedisPubSubService } from '@shared/redis/services/redis-pub-sub.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InternalEventNames } from '@common/contracts/events';

@Injectable()
export class SocketPresenceService {
  private readonly logger = new Logger(SocketPresenceService.name);

  constructor(
    private readonly redisPubSub: RedisPubSubService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async subscribeToEvents(): Promise<void> {
    await this.redisPubSub.subscribe(
      RedisKeyBuilder.channels.presenceOnline,
      (channel, message) => void this.handleCrossServerOnline(channel, message),
    );

    await this.redisPubSub.subscribe(
      RedisKeyBuilder.channels.presenceOffline,
      (channel, message) => void this.handleCrossServerOffline(channel, message),
    );
    this.logger.log('✅ Subscribed to cross-server presence events');
  }

  async publishPresenceOnline(userId: string): Promise<void> {
    try {
      await this.redisPubSub.publish(RedisKeyBuilder.channels.presenceOnline, {
        userId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
       this.logger.error(`Failed to publish presence online for ${userId}`, error);
    }
  }

  async publishPresenceOffline(userId: string): Promise<void> {
    try {
      await this.redisPubSub.publish(RedisKeyBuilder.channels.presenceOffline, {
        userId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
       this.logger.error(`Failed to publish presence offline for ${userId}`, error);
    }
  }

  private handleCrossServerOnline(channel: string, message: string): void {
    try {
      const data = JSON.parse(message) as { userId?: string };
      this.logger.debug(`Presence online (cross-server): ${data.userId}`);

      if (data.userId) {
        this.eventEmitter.emit(InternalEventNames.USER_SOCKET_CONNECTED, {
          userId: data.userId,
          socketId: null,
          connectedAt: new Date(),
        });
      }
    } catch (error) {
      this.logger.error('Error handling presence online:', error);
    }
  }

  private handleCrossServerOffline(channel: string, message: string): void {
    try {
      const data = JSON.parse(message) as { userId?: string };
      this.logger.debug(`Presence offline (cross-server): ${data.userId}`);

      if (data.userId) {
        this.eventEmitter.emit(InternalEventNames.USER_SOCKET_DISCONNECTED, {
          userId: data.userId,
          socketId: null,
          reason: 'cross-server offline',
        });
      }
    } catch (error) {
      this.logger.error('Error handling presence offline:', error);
    }
  }
}
