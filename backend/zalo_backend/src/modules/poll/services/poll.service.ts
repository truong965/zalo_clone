import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ConversationType,
  MemberRole,
  MemberStatus,
  MessageType,
} from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import { safeJSON } from 'src/common/utils/json.util';
import { InternalEventNames } from '@common/contracts/events/event-names';
import { OUTBOUND_SOCKET_EVENT } from '@common/events/outbound-socket.event';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import { DisplayNameResolver } from '@shared/services';
import {
  MAX_POLL_OPTIONS,
  MIN_POLL_OPTIONS,
} from '../constants/poll.constants';
import type { CreatePollDto } from '../dto/create-poll.dto';
import type { VotePollDto } from '../dto/vote-poll.dto';
import type { AddPollOptionDto } from '../dto/add-poll-option.dto';
import {
  PollClosedEvent,
  PollCreatedEvent,
  PollVoteChangedEvent,
} from '../events/poll.events';

const POLL_CARD_VOTER_PREVIEW_LIMIT = 5;

export interface PollVoterPreview {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface PollOptionDetail {
  id: string;
  text: string;
  sortOrder: number;
  voteCount: number;
  percent: number;
  voters: PollVoterPreview[];
}

export interface PollDetailDto {
  id: string;
  messageId: string;
  conversationId: string;
  creatorId: string;
  question: string;
  isMultipleChoices: boolean;
  allowAddOptions: boolean;
  isClosed: boolean;
  closedAt: string | null;
  totalVoters: number;
  myVotedOptionIds: string[];
  options: PollOptionDetail[];
}

@Injectable()
export class PollService {
  private readonly logger = new Logger(PollService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly displayNameResolver: DisplayNameResolver,
  ) {}

  async create(userId: string, dto: CreatePollDto) {
    const question = dto.question.trim();
    const optionTexts = dto.options
      .map((o) => o.trim())
      .filter((o) => o.length > 0);

    if (!question) {
      throw new BadRequestException('Câu hỏi bình chọn không được để trống.');
    }
    if (optionTexts.length < MIN_POLL_OPTIONS) {
      throw new BadRequestException(
        `Bình chọn cần ít nhất ${MIN_POLL_OPTIONS} phương án.`,
      );
    }
    if (optionTexts.length > MAX_POLL_OPTIONS) {
      throw new BadRequestException(
        `Bình chọn tối đa ${MAX_POLL_OPTIONS} phương án.`,
      );
    }

    await this.assertGroupMember(dto.conversationId, userId);

    const creator = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    const actorName = creator?.displayName ?? 'Một thành viên';

    const memberCount = await this.prisma.conversationMember.count({
      where: {
        conversationId: dto.conversationId,
        status: MemberStatus.ACTIVE,
        userId: { not: userId },
      },
    });

    const result = await this.prisma.$transaction(async (tx) => {
      const pollMessage = await tx.message.create({
        data: {
          conversationId: dto.conversationId,
          senderId: userId,
          type: MessageType.POLL,
          content: question,
          metadata: {},
          totalRecipients: memberCount,
        },
      });

      const poll = await tx.poll.create({
        data: {
          conversationId: dto.conversationId,
          messageId: pollMessage.id,
          creatorId: userId,
          question,
          isMultipleChoices: dto.isMultipleChoices ?? false,
          allowAddOptions: dto.allowAddOptions ?? false,
          options: {
            create: optionTexts.map((text, index) => ({
              text,
              sortOrder: index,
            })),
          },
        },
        include: {
          options: { orderBy: { sortOrder: 'asc' } },
        },
      });

      await tx.message.update({
        where: { id: pollMessage.id },
        data: {
          metadata: {
            pollId: poll.id,
            action: 'POLL',
          },
        },
      });

      const systemMessage = await tx.message.create({
        data: {
          conversationId: dto.conversationId,
          type: MessageType.SYSTEM,
          content: `${actorName} đã tạo một cuộc bình chọn`,
          metadata: {
            action: 'POLL_CREATED',
            actorId: userId,
            pollId: poll.id,
            pollMessageId: pollMessage.id.toString(),
          },
        },
      });

      await tx.conversation.update({
        where: { id: dto.conversationId },
        data: { lastMessageAt: pollMessage.createdAt },
      });

      return { poll, pollMessage, systemMessage };
    });

    const pollDetail = await this.buildPollDetail(result.poll.id, userId);
    const hydratedPollMsg = await this.hydratePollMessage(
      result.pollMessage.id,
      userId,
      pollDetail,
    );
    const hydratedSystemMsg = safeJSON(result.systemMessage);

    await this.broadcastMessagesToConversation(
      dto.conversationId,
      userId,
      [hydratedPollMsg, hydratedSystemMsg],
      result.pollMessage.createdAt,
    );

    this.eventEmitter.emit(
      InternalEventNames.POLL_CREATED,
      new PollCreatedEvent(
        result.poll.id,
        dto.conversationId,
        result.pollMessage.id.toString(),
        result.systemMessage.id.toString(),
        userId,
      ),
    );

    this.logger.log(
      `Poll ${result.poll.id} created in conversation ${dto.conversationId}`,
    );

    return {
      poll: pollDetail,
      pollMessage: hydratedPollMsg,
      systemMessage: hydratedSystemMsg,
    };
  }

  async findById(pollId: string, viewerId: string, voterLimit?: number) {
    await this.assertPollAccess(pollId, viewerId);
    return this.buildPollDetail(pollId, viewerId, voterLimit);
  }

  async findByMessageId(messageId: string, viewerId: string) {
    const poll = await this.prisma.poll.findUnique({
      where: { messageId: BigInt(messageId) },
      select: { id: true, conversationId: true },
    });
    if (!poll) {
      throw new NotFoundException('Không tìm thấy bình chọn.');
    }
    await this.assertGroupMember(poll.conversationId, viewerId);
    return this.buildPollDetail(poll.id, viewerId);
  }

  async vote(pollId: string, userId: string, dto: VotePollDto) {
    if (!dto.toggleOptionId && (!dto.optionIds || dto.optionIds.length === 0)) {
      throw new BadRequestException(
        'Cần cung cấp toggleOptionId hoặc optionIds.',
      );
    }
    if (dto.toggleOptionId && dto.optionIds?.length) {
      throw new BadRequestException(
        'Chỉ được dùng toggleOptionId hoặc optionIds, không dùng cả hai.',
      );
    }

    const poll = await this.getPollOrThrow(pollId);
    await this.assertGroupMember(poll.conversationId, userId);

    if (poll.isClosed) {
      throw new BadRequestException('Cuộc bình chọn đã kết thúc.');
    }

    if (dto.toggleOptionId) {
      await this.toggleVote(poll, userId, dto.toggleOptionId);
    } else {
      await this.syncVotes(poll, userId, dto.optionIds ?? []);
    }

    const pollDetail = await this.buildPollDetail(pollId, userId);

    this.eventEmitter.emit(
      InternalEventNames.POLL_VOTE_CHANGED,
      new PollVoteChangedEvent(
        pollId,
        poll.conversationId,
        poll.messageId.toString(),
        userId,
      ),
    );

    return pollDetail;
  }

  async addOption(pollId: string, userId: string, dto: AddPollOptionDto) {
    const text = dto.text.trim();
    if (!text) {
      throw new BadRequestException('Nội dung phương án không được để trống.');
    }

    const poll = await this.getPollOrThrow(pollId);
    await this.assertGroupMember(poll.conversationId, userId);

    if (poll.isClosed) {
      throw new BadRequestException('Cuộc bình chọn đã kết thúc.');
    }
    if (!poll.allowAddOptions) {
      throw new ForbiddenException('Cuộc bình chọn không cho phép thêm phương án.');
    }

    const optionCount = await this.prisma.pollOption.count({
      where: { pollId },
    });
    if (optionCount >= MAX_POLL_OPTIONS) {
      throw new BadRequestException(
        `Đã đạt tối đa ${MAX_POLL_OPTIONS} phương án.`,
      );
    }

    await this.prisma.pollOption.create({
      data: {
        pollId,
        text,
        sortOrder: optionCount,
        createdById: userId,
      },
    });

    const pollDetail = await this.buildPollDetail(pollId, userId);

    this.eventEmitter.emit(
      InternalEventNames.POLL_VOTE_CHANGED,
      new PollVoteChangedEvent(
        pollId,
        poll.conversationId,
        poll.messageId.toString(),
        userId,
      ),
    );

    return pollDetail;
  }

  async close(pollId: string, userId: string) {
    const poll = await this.getPollOrThrow(pollId);
    await this.assertGroupMember(poll.conversationId, userId);

    const canClose =
      poll.creatorId === userId || (await this.isGroupAdmin(poll.conversationId, userId));
    if (!canClose) {
      throw new ForbiddenException(
        'Chỉ người tạo hoặc quản trị viên nhóm mới có thể kết thúc bình chọn.',
      );
    }

    if (poll.isClosed) {
      return this.buildPollDetail(pollId, userId);
    }

    await this.prisma.poll.update({
      where: { id: pollId },
      data: {
        isClosed: true,
        closedAt: new Date(),
        closedById: userId,
      },
    });

    const pollDetail = await this.buildPollDetail(pollId, userId);

    this.eventEmitter.emit(
      InternalEventNames.POLL_CLOSED,
      new PollClosedEvent(
        pollId,
        poll.conversationId,
        poll.messageId.toString(),
        userId,
      ),
    );

    return pollDetail;
  }

  /**
   * Attach poll snapshots to POLL-type messages (used by MessageService).
   */
  async enrichMessagesWithPolls<
    T extends { id: bigint; type: MessageType },
  >(messages: T[], viewerId: string): Promise<(T & { poll?: PollDetailDto })[]> {
    const pollMessageIds = messages
      .filter((m) => m.type === MessageType.POLL)
      .map((m) => m.id);

    if (!pollMessageIds.length) {
      return messages as (T & { poll?: PollDetailDto })[];
    }

    const polls = await this.prisma.poll.findMany({
      where: { messageId: { in: pollMessageIds } },
      select: { id: true, messageId: true },
    });

    const pollByMessageId = new Map(
      polls.map((p) => [p.messageId.toString(), p.id]),
    );

    const detailEntries = await Promise.all(
      Array.from(pollByMessageId.entries()).map(async ([msgId, pollId]) => {
        const detail = await this.buildPollDetail(pollId, viewerId, POLL_CARD_VOTER_PREVIEW_LIMIT);
        return [msgId, detail] as const;
      }),
    );
    const detailMap = new Map(detailEntries);

    return messages.map((m) => {
      const detail = detailMap.get(m.id.toString());
      if (!detail) return m as T & { poll?: PollDetailDto };
      return { ...m, poll: detail };
    });
  }

  private async toggleVote(
    poll: { id: string; isMultipleChoices: boolean },
    userId: string,
    optionId: string,
  ) {
    const option = await this.prisma.pollOption.findFirst({
      where: { id: optionId, pollId: poll.id },
    });
    if (!option) {
      throw new BadRequestException('Phương án không hợp lệ.');
    }

    const existing = await this.prisma.pollVote.findUnique({
      where: {
        pollId_optionId_userId: {
          pollId: poll.id,
          optionId,
          userId,
        },
      },
    });

    if (existing) {
      await this.prisma.pollVote.delete({
        where: {
          pollId_optionId_userId: {
            pollId: poll.id,
            optionId,
            userId,
          },
        },
      });
      return;
    }

    if (!poll.isMultipleChoices) {
      await this.prisma.pollVote.deleteMany({
        where: { pollId: poll.id, userId },
      });
    }

    await this.prisma.pollVote.create({
      data: { pollId: poll.id, optionId, userId },
    });
  }

  private async syncVotes(
    poll: { id: string; isMultipleChoices: boolean },
    userId: string,
    optionIds: string[],
  ) {
    const uniqueIds = [...new Set(optionIds)];
    if (!poll.isMultipleChoices && uniqueIds.length > 1) {
      throw new BadRequestException('Chỉ được chọn một phương án.');
    }

    const validOptions = await this.prisma.pollOption.findMany({
      where: { pollId: poll.id, id: { in: uniqueIds } },
      select: { id: true },
    });
    if (validOptions.length !== uniqueIds.length) {
      throw new BadRequestException('Có phương án không hợp lệ.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.pollVote.deleteMany({
        where: { pollId: poll.id, userId },
      });
      if (uniqueIds.length > 0) {
        await tx.pollVote.createMany({
          data: uniqueIds.map((optionId) => ({
            pollId: poll.id,
            optionId,
            userId,
          })),
          skipDuplicates: true,
        });
      }
    });
  }

  private async buildPollDetail(
    pollId: string,
    viewerId: string,
    voterPreviewLimit = POLL_CARD_VOTER_PREVIEW_LIMIT,
  ): Promise<PollDetailDto> {
    const poll = await this.prisma.poll.findUnique({
      where: { id: pollId },
      include: {
        options: { orderBy: { sortOrder: 'asc' } },
        votes: {
          include: {
            option: { select: { id: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!poll) {
      throw new NotFoundException('Không tìm thấy bình chọn.');
    }

    const voterIds = [...new Set(poll.votes.map((v) => v.userId))];
    const totalVoters = voterIds.length;

    const users = voterIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: voterIds } },
          select: { id: true, displayName: true, avatarUrl: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    const myVotedOptionIds = poll.votes
      .filter((v) => v.userId === viewerId)
      .map((v) => v.optionId);

    const options: PollOptionDetail[] = poll.options.map((opt) => {
      const optionVotes = poll.votes.filter((v) => v.optionId === opt.id);
      const voteCount = optionVotes.length;
      const percent =
        totalVoters > 0
          ? Math.round((voteCount / totalVoters) * 1000) / 10
          : 0;

      const voters: PollVoterPreview[] = optionVotes
        .slice(0, voterPreviewLimit)
        .map((v) => {
          const u = userMap.get(v.userId);
          return {
            id: v.userId,
            displayName: u?.displayName ?? 'Người dùng',
            avatarUrl: u?.avatarUrl ?? null,
          };
        });

      return {
        id: opt.id,
        text: opt.text,
        sortOrder: opt.sortOrder,
        voteCount,
        percent,
        voters,
      };
    });

    return {
      id: poll.id,
      messageId: poll.messageId.toString(),
      conversationId: poll.conversationId,
      creatorId: poll.creatorId,
      question: poll.question,
      isMultipleChoices: poll.isMultipleChoices,
      allowAddOptions: poll.allowAddOptions,
      isClosed: poll.isClosed,
      closedAt: poll.closedAt?.toISOString() ?? null,
      totalVoters,
      myVotedOptionIds,
      options,
    };
  }

  private async hydratePollMessage(
    messageId: bigint,
    viewerId: string,
    poll: PollDetailDto,
  ) {
    const message = await this.prisma.message.findUniqueOrThrow({
      where: { id: messageId },
    });

    const sender = message.senderId
      ? await this.prisma.user.findUnique({
          where: { id: message.senderId },
          select: { id: true, displayName: true, avatarUrl: true },
        })
      : null;

    let resolvedDisplayName = sender?.displayName;
    if (sender) {
      resolvedDisplayName = await this.displayNameResolver.resolve(
        viewerId,
        sender.id,
      );
    }

    return safeJSON({
      ...message,
      poll,
      sender: sender
        ? {
            id: sender.id,
            displayName: sender.displayName,
            avatarUrl: sender.avatarUrl,
            resolvedDisplayName,
          }
        : null,
    });
  }

  private async broadcastMessagesToConversation(
    conversationId: string,
    senderId: string,
    messages: Record<string, unknown>[],
    lastMessageAt: Date,
  ) {
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId, status: MemberStatus.ACTIVE },
      select: { userId: true },
    });
    const allMemberIds = members.map((m) => m.userId);
    const recipientIds = allMemberIds.filter((id) => id !== senderId);
    const isoCreatedAt = lastMessageAt.toISOString();
    const primary = messages[0];

    for (const memberId of allMemberIds) {
      for (const message of messages) {
        this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, {
          event: SocketEvents.MESSAGE_NEW,
          userId: memberId,
          data: { message, conversationId },
        });
      }
    }

    const listItemBase = {
      conversationId,
      lastMessage: {
        id: primary?.id,
        content: (primary?.content as string) ?? null,
        type: primary?.type,
        senderId: (primary?.senderId as string) ?? null,
        createdAt: isoCreatedAt,
      },
      lastMessageAt: isoCreatedAt,
    };

    this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, {
      event: SocketEvents.CONVERSATION_LIST_ITEM_UPDATED,
      userId: senderId,
      data: { ...listItemBase, unreadCountDelta: 0 },
    });

    for (const recipientId of recipientIds) {
      this.eventEmitter.emit(OUTBOUND_SOCKET_EVENT, {
        event: SocketEvents.CONVERSATION_LIST_ITEM_UPDATED,
        userId: recipientId,
        data: { ...listItemBase, unreadCountDelta: 1 },
      });
    }

    if (recipientIds.length > 0) {
      await this.prisma.conversationMember.updateMany({
        where: {
          conversationId,
          userId: { in: recipientIds },
        },
        data: { unreadCount: { increment: 1 } },
      });
    }
  }

  private async getPollOrThrow(pollId: string) {
    const poll = await this.prisma.poll.findUnique({ where: { id: pollId } });
    if (!poll) {
      throw new NotFoundException('Không tìm thấy bình chọn.');
    }
    return poll;
  }

  private async assertPollAccess(pollId: string, userId: string) {
    const poll = await this.getPollOrThrow(pollId);
    await this.assertGroupMember(poll.conversationId, userId);
  }

  private async assertGroupMember(conversationId: string, userId: string) {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { type: true, deletedAt: true },
    });

    if (!conversation || conversation.deletedAt) {
      throw new NotFoundException('Cuộc trò chuyện không tồn tại.');
    }

    if (conversation.type !== ConversationType.GROUP) {
      throw new ForbiddenException(
        'Bình chọn chỉ khả dụng trong trò chuyện nhóm.',
      );
    }

    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });

    if (!member || member.status !== MemberStatus.ACTIVE) {
      throw new ForbiddenException('Bạn không phải thành viên nhóm này.');
    }
  }

  private async isGroupAdmin(
    conversationId: string,
    userId: string,
  ): Promise<boolean> {
    const member = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId, userId },
      },
    });
    return (
      member?.status === MemberStatus.ACTIVE &&
      member?.role === MemberRole.ADMIN
    );
  }
}
