import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { MessageSentEvent } from '../../message/events';

@Injectable()
export class AIInternalListener {
  private readonly logger = new Logger(AIInternalListener.name);

  constructor(
    @InjectQueue('embed') private readonly embedQueue: Queue,
  ) {}

  @OnEvent('MessageModule.MessageSent')
  async handleMessageSent(event: MessageSentEvent) {
    this.logger.debug(`Processing message.sent event for AI Sync: ${event.messageId}`);

    try {
      // The payload must match what ai_zalo's EmbedWorkerService expects
      await this.embedQueue.add('embed-message', {
        messageId: event.messageId,
        conversationId: event.conversationId,
        userId: event.senderId,
        text: event.content,
        // senderName is optional in EmbedWorkerService, it will try to resolve it if missing
        // or we can just send it as 'User' and let the worker fetch real name if needed.
        // Actually, we could fetch it here if we want to be precise.
        createdAt: new Date().toISOString(),
      });

      this.logger.log(`Successfully queued message ${event.messageId} for AI embedding.`);
    } catch (err: any) {
      this.logger.error(`Failed to queue message ${event.messageId} for AI: ${err.message}`);
    }
  }
}
