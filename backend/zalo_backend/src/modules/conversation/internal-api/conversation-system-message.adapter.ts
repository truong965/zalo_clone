import { Injectable } from '@nestjs/common';
import {
      ConversationSystemMessagePayload,
      IConversationSystemMessagePort,
} from '@common/contracts/internal-api';
import { SystemMessageBroadcasterService } from '../services/system-message-broadcaster.service';

@Injectable()
export class ConversationSystemMessageAdapter
      implements IConversationSystemMessagePort {
      constructor(private readonly broadcaster: SystemMessageBroadcasterService) { }

      broadcast(payload: ConversationSystemMessagePayload): Promise<void> {
            return this.broadcaster.broadcast(payload);
      }
}
