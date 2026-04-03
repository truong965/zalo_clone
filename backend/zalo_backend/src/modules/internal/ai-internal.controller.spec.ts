import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { OUTBOUND_SOCKET_EVENT } from '@common/events/outbound-socket.event';
import { AIInternalController } from './ai-internal.controller';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import { vi } from 'vitest';

describe('AIInternalController notify relay', () => {
  const createController = (unifiedEnabled: boolean) => {
    const prisma = {} as any;
    const eventEmitter = {
      emit: vi.fn(),
    } as unknown as EventEmitter2;
    const configService = {
      get: vi.fn((key: string, fallback: boolean) => {
        if (key === 'ai.unifiedStreamEnabled') return unifiedEnabled;
        return fallback;
      }),
    } as unknown as ConfigService;

    return {
      controller: new AIInternalController(prisma, eventEmitter, configService),
      eventEmitter,
    };
  };

  it('relays legacy ai:* events to user target', async () => {
    const { controller, eventEmitter } = createController(true);

    await controller.notify({
      conversationId: 'conv-1',
      userId: 'user-1',
      type: 'summary',
      payload: { summary: 'ok' },
    });

    expect(eventEmitter.emit).toHaveBeenCalledWith(OUTBOUND_SOCKET_EVENT, {
      userId: 'user-1',
      event: 'ai:summary',
      data: {
        summary: 'ok',
        conversationId: 'conv-1',
      },
    });
  });

  it('relays unified-response events as both unified and legacy socket events when feature flag is enabled', async () => {
    const { controller, eventEmitter } = createController(true);

    await controller.notify({
      conversationId: 'conv-2',
      userId: 'user-2',
      type: 'unified-response',
      payload: {
        event: SocketEvents.AI_RESPONSE_COMPLETED,
        requestId: 'req-2',
        conversationId: 'conv-2',
        type: 'ask',
        ts: new Date().toISOString(),
        content: 'final answer',
      },
    });

    expect(eventEmitter.emit).toHaveBeenCalledWith(OUTBOUND_SOCKET_EVENT, {
      userId: 'user-2',
      event: SocketEvents.AI_RESPONSE_COMPLETED,
      data: expect.objectContaining({
        event: SocketEvents.AI_RESPONSE_COMPLETED,
        requestId: 'req-2',
        conversationId: 'conv-2',
      }),
    });

    expect(eventEmitter.emit).toHaveBeenCalledWith(OUTBOUND_SOCKET_EVENT, {
      userId: 'user-2',
      event: SocketEvents.AI_STREAM_DONE,
      data: expect.objectContaining({
        event: SocketEvents.AI_STREAM_DONE,
        requestId: 'req-2',
        conversationId: 'conv-2',
      }),
    });
  });

  it('falls back to legacy socket events when unified streaming is disabled', async () => {
    const { controller, eventEmitter } = createController(false);

    const result = await controller.notify({
      conversationId: 'conv-3',
      userId: 'user-3',
      type: 'unified-response',
      payload: {
        event: SocketEvents.AI_RESPONSE_COMPLETED,
        requestId: 'req-3',
        conversationId: 'conv-3',
        type: 'summary',
        ts: new Date().toISOString(),
        content: 'legacy summary',
      },
    });

    expect(result).toEqual({ success: true });
    expect(eventEmitter.emit).toHaveBeenCalledWith(OUTBOUND_SOCKET_EVENT, {
      userId: 'user-3',
      event: SocketEvents.AI_SUMMARY,
      data: expect.objectContaining({
        event: SocketEvents.AI_SUMMARY,
        requestId: 'req-3',
        conversationId: 'conv-3',
      }),
    });
  });
});
