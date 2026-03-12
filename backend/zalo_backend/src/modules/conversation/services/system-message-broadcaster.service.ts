/**
 * SystemMessageBroadcasterService
 *
 * Replaces the `system-message.broadcast` event pattern with a direct
 * type-safe method call. Other modules inject this service instead of
 * emitting the imperative event through EventEmitter2.
 *
 * Why: `system-message.broadcast` was a command disguised as an event
 * (1 emitter → 1 listener, imperative naming). A direct service call
 * is more appropriate — it gives compile-time type safety, clear stack
 * traces, and explicit ownership within ConversationModule.
 */

import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { ConversationGateway } from '../conversation.gateway';

export interface SystemMessagePayload {
      conversationId: string;
      message: Record<string, unknown>;
      excludeUserIds?: string[];
}

@Injectable()
export class SystemMessageBroadcasterService implements OnApplicationBootstrap {
      private conversationGateway: ConversationGateway;

      constructor(private readonly moduleRef: ModuleRef) { }

      onApplicationBootstrap() {
            // Lazy-load the class reference to break the circular file dependency:
            // conversation.gateway → conversation-realtime.service → this file → conversation.gateway
            const { ConversationGateway } = require('../conversation.gateway') as {
                  ConversationGateway: new (...args: unknown[]) => ConversationGateway;
            };
            this.conversationGateway = this.moduleRef.get(ConversationGateway, { strict: false });
      }

      async broadcast(payload: SystemMessagePayload): Promise<void> {
            await this.conversationGateway.handleSystemMessageBroadcast(payload);
      }
}
