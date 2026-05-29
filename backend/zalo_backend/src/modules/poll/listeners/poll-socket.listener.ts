import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { MemberStatus } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import {
  OUTBOUND_SOCKET_EVENT,
  ISocketEmitEvent,
} from '@common/events/outbound-socket.event';
import { InternalEventNames } from '@common/contracts/events/event-names';
import { PollService } from '../services/poll.service';
import {
  PollClosedEvent,
  PollVoteChangedEvent,
} from '../events/poll.events';

@Injectable()
export class PollSocketListener {
  private readonly logger = new Logger(PollSocketListener.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
    private readonly pollService: PollService,
  ) {}

  @OnEvent(InternalEventNames.POLL_VOTE_CHANGED)
  async onVoteChanged(event: PollVoteChangedEvent) {
    await this.broadcastPollUpdate(event.pollId, event.conversationId, event.messageId);
  }

  @OnEvent(InternalEventNames.POLL_CLOSED)
  async onPollClosed(event: PollClosedEvent) {
    await this.broadcastPollUpdate(event.pollId, event.conversationId, event.messageId);
    await this.emitPollClosed(event);
  }

  private async broadcastPollUpdate(
    pollId: string,
    conversationId: string,
    messageId: string,
  ) {
    try {
      const members = await this.prisma.conversationMember.findMany({
        where: {
          conversationId,
          status: MemberStatus.ACTIVE,
        },
        select: { userId: true },
      });
      const memberIds = members.map((m) => m.userId);

      const pollSnapshots = await Promise.all(
        memberIds.map(async (userId) => ({
          userId,
          poll: await this.pollService.findById(pollId, userId),
        })),
      );

      for (const { userId, poll } of pollSnapshots) {
        const socketEvent: ISocketEmitEvent = {
          event: SocketEvents.POLL_VOTE_UPDATED,
          userId,
          data: {
            pollId,
            messageId,
            conversationId,
            poll,
          },
        };
        await this.eventEmitter.emitAsync(OUTBOUND_SOCKET_EVENT, socketEvent);
      }

      this.logger.debug(
        `Broadcast poll:voteUpdated for poll ${pollId} to ${memberIds.length} members`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to broadcast poll update for ${pollId}`,
        error,
      );
    }
  }

  private async emitPollClosed(event: PollClosedEvent) {
    try {
      const members = await this.prisma.conversationMember.findMany({
        where: {
          conversationId: event.conversationId,
          status: MemberStatus.ACTIVE,
        },
        select: { userId: true },
      });

      const socketEvent: ISocketEmitEvent = {
        event: SocketEvents.POLL_CLOSED,
        data: {
          pollId: event.pollId,
          messageId: event.messageId,
          conversationId: event.conversationId,
          closedById: event.closedById,
        },
        userIds: members.map((m) => m.userId),
      };
      await this.eventEmitter.emitAsync(OUTBOUND_SOCKET_EVENT, socketEvent);
    } catch (error) {
      this.logger.error(`Failed to emit poll:closed for ${event.pollId}`, error);
    }
  }
}
