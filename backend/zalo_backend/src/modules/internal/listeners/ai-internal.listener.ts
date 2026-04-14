import { OnEvent } from '@nestjs/event-emitter';
import { Injectable, Logger } from '@nestjs/common';
import { AiRedisPublisherService } from 'src/shared/redis/services/ai-redis-publisher.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';
import { MessageSentEvent } from '../../message/events';
import { InternalEventNames } from '@common/contracts/events/event-names';
import { PrismaService } from 'src/database/prisma.service';

@Injectable()
export class AIInternalListener {
  private readonly logger = new Logger(AIInternalListener.name);

  constructor(
    private readonly aiRedisPublisher: AiRedisPublisherService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent(InternalEventNames.MESSAGE_SENT)
  async handleMessageSent(event: MessageSentEvent) {
    this.logger.debug(`Processing message.sent event for AI Sync: ${event.messageId}`);

    try {
      // Fetch sender display name from DB
      const sender = await this.prisma.user.findUnique({
        where: { id: event.senderId },
        select: { displayName: true },
      });

      const senderName = sender?.displayName || 'User';

      // Publish to AI Redis instance so that ai_zalo service can consume it via Pub/Sub.
      // This decouples the Main App from AI Service's internal BullMQ strategy.
      await this.aiRedisPublisher.publish(RedisKeyBuilder.channels.globalNewMessage, {
        messageId: event.messageId,
        conversationId: event.conversationId,
        userId: event.senderId,
        senderName: senderName, // Passed to AI service
        text: event.content,
        createdAt: new Date().toISOString(),
      });

      this.logger.log(`Successfully published message ${event.messageId} (from ${senderName}) to AI Redis.`);
    } catch (err: any) {
      this.logger.error(`Failed to queue message ${event.messageId} for AI: ${err.message}`);
    }
  }
}
