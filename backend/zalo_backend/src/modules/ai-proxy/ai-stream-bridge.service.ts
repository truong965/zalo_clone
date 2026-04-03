import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisService } from 'src/shared/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OUTBOUND_SOCKET_EVENT } from '../../common/events/outbound-socket.event';
import { SocketEventName, SocketEvents } from 'src/common/constants/socket-events.constant';

@Injectable()
export class AiStreamBridgeService implements OnModuleInit {
  private readonly logger = new Logger(AiStreamBridgeService.name);
  private readonly STREAM_PATTERN = 'bot-stream:*';

  constructor(
    private readonly redisService: RedisService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  onModuleInit() {
    this.setupPatternSubscriber();
  }

  private setupPatternSubscriber() {
    const subscriber = this.redisService.getSubscriber();

    if (!subscriber) {
      this.logger.error('Redis Subscriber client is not initialized!');
      return;
    }

    // Subscribe to pattern for bot-stream
    subscriber.psubscribe(this.STREAM_PATTERN, (err) => {
      if (err) {
        this.logger.error(`Failed to psubscribe to ${this.STREAM_PATTERN}:`, err);
      } else {
        this.logger.log(`✅ AI Stream Bridge: Listening to Redis pattern: ${this.STREAM_PATTERN}`);
      }
    });

    // Handle incoming messages on the pattern
    subscriber.on('pmessage', (pattern, channel, message) => {
      if (pattern === this.STREAM_PATTERN) {
        this.handleStreamMessage(channel, message);
      }
    });
  }

  private handleStreamMessage(channel: string, message: string) {
    // Channel format: bot-stream:conversationId
    const parts = channel.split(':');
    const conversationId = parts[1];
    
    if (!conversationId) {
      this.logger.warn(`Received stream message on invalid channel: ${channel}`);
      return;
    }

    try {
      const data = JSON.parse(message);
      
      // ai_zalo sends 'text: chunk' but frontend expects 'content: chunk'
      const normalizedData = {
        ...data,
        conversationId: data.conversationId || conversationId,
        content: data.text || data.content || data.message || '',
      };

      // Map ai_zalo internal events to socket events
      // ai_zalo events: 'start', 'chunk', 'done', 'error'
      let socketEvent: SocketEventName = SocketEvents.AI_STREAM_CHUNK;
      if (normalizedData.event === 'done') socketEvent = SocketEvents.AI_STREAM_DONE;
      if (normalizedData.event === 'error') socketEvent = SocketEvents.AI_STREAM_ERROR;
      if (normalizedData.event === 'start') socketEvent = SocketEvents.AI_STREAM_START;

      this.logger.debug(`Relaying ${normalizedData.event} to room ${conversationId} as ${socketEvent}`);

      // Broadcast to specific conversation room via Socket.io
      this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, {
        room: conversationId,
        event: socketEvent,
        data: normalizedData,
      });
    } catch (error) {
      this.logger.error(`Error relaying stream message from ${channel}:`, error);
    }
  }
}
