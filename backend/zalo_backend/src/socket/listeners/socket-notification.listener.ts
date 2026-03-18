import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { IdempotentListener } from '@shared/events/base/idempotent-listener';
import type { MessageSentEvent } from '@modules/message/events';
import type { ConversationCreatedEvent } from '@modules/conversation/events';

@Injectable()
export class SocketNotificationListener extends IdempotentListener {
}
