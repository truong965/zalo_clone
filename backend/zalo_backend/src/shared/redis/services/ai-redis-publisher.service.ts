import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { safeStringify } from 'src/common/utils/json.util';

/**
 * Dedicated Redis publisher for the AI Redis instance (port AI_REDIS_PORT).
 *
 * The main BackendRedis (REDIS_PORT=6379) and the AI Redis (AI_REDIS_PORT=6380)
 * are physically separate instances. The ai_zalo service only subscribes to
 * the AI Redis instance, so all AI-targeted pub/sub messages (e.g.
 * "chat:new_message") must be published here, NOT via the main RedisPubSubService.
 */
@Injectable()
export class AiRedisPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiRedisPublisherService.name);
  private publisher: Redis;
  private enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.enabled = this.config.get<string>('AI_AGENT_ENABLED') !== 'false';

    this.publisher = new Redis({
      host: this.config.get<string>('AI_REDIS_HOST') || this.config.get<string>('REDIS_HOST') || 'localhost',
      port: parseInt(this.config.get<string>('AI_REDIS_PORT') || this.config.get<string>('REDIS_PORT') || '6379', 10),
      password: this.config.get<string>('AI_REDIS_PASSWORD') || this.config.get<string>('REDIS_PASSWORD'),
      db: parseInt(this.config.get<string>('AI_REDIS_DB') || '0', 10),
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });

    this.publisher.on('error', (err: any) => {
      if (err.code === 'ECONNREFUSED') {
        this.logger.warn(`AI Redis Publisher: Connection refused at ${err.address}:${err.port}. Retrying...`);
        return;
      }
      this.logger.error('AI Redis Publisher error:', err);
    });
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.warn('AI Agent disabled — AiRedisPublisher will not connect.');
      return;
    }
    try {
      await this.publisher.connect();
      this.logger.log(
        `✅ AI Redis Publisher connected to ${this.config.get('AI_REDIS_HOST') || 'localhost'}:${this.config.get('AI_REDIS_PORT') || 6379}`,
      );
    } catch (err: any) {
      this.logger.error(`Failed to connect AI Redis Publisher: ${err.message}`);
    }
  }

  async onModuleDestroy() {
    await this.publisher.quit().catch(() => {});
  }

  /**
   * Publish a message to the AI Redis channel.
   * Returns the number of subscribers that received the message.
   * Silently skips if AI Agent is disabled.
   */
  async publish(channel: string, message: any): Promise<number> {
    if (!this.enabled) return 0;

    const payload = typeof message === 'string' ? message : safeStringify(message);
    try {
      const count = await this.publisher.publish(channel, payload);
      if (count === 0) {
        this.logger.debug(`AI Redis: No subscribers on channel "${channel}" — ai_zalo may not be running.`);
      }
      return count;
    } catch (err: any) {
      this.logger.error(`AI Redis publish failed on channel "${channel}": ${err.message}`);
      return 0;
    }
  }
}
