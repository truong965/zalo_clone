import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { RedisService } from 'src/shared/redis/redis.service';
import { RedisKeyBuilder } from 'src/shared/redis/redis-key-builder';
import { ACCOUNT_PURGE_QUEUE, PURGE_USER_DATA } from '../constants/purge-queue.constant';

export interface PurgeJobData {
  userId: string;
  deletedAt: Date;
}

@Processor(ACCOUNT_PURGE_QUEUE)
export class AccountPurgeWorker extends WorkerHost {
  private readonly logger = new Logger(AccountPurgeWorker.name);
  private readonly BATCH_SIZE = 500;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    super();
  }

  async process(job: Job<PurgeJobData>) {
    if (job.name !== PURGE_USER_DATA) {
      this.logger.warn(`Unknown job name: ${job.name}`);
      return;
    }

    const { userId } = job.data;
    this.logger.log(`Starting purge for user ${userId} (Job ID: ${job.id})`);

    try {
      await this.cleanupRedisCache(userId);
      await job.updateProgress(5);

      await this.deleteAuthData(userId);
      await job.updateProgress(15);

      await this.anonymizeMessages(userId);
      await job.updateProgress(30);

      await this.softDeleteMedia(userId);
      await job.updateProgress(45);

      await this.deleteSocialGraph(userId);
      await job.updateProgress(60);

      await this.deleteConversationMemberships(userId);
      await job.updateProgress(75);

      await this.deleteOtherData(userId);
      await job.updateProgress(90);

      await this.hardDeleteUser(userId);
      await job.updateProgress(100);

      this.logger.log(`Successfully purged user ${userId} (Job ID: ${job.id})`);
    } catch (error) {
      this.logger.error(`Failed to purge user ${userId}: ${(error as Error).message}`, (error as Error).stack);
      throw error; // Let BullMQ handle retries
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<PurgeJobData>, error: Error) {
    this.logger.error(`Job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`);
  }

  private async cleanupRedisCache(userId: string) {
    await this.redis.del(RedisKeyBuilder.authUserProfile(userId));
    // Provide a default string to avoid passing undefined
    await this.redis.deletePattern(RedisKeyBuilder.friendshipUserPattern(userId));
    await this.redis.deletePattern(RedisKeyBuilder.blockUserPattern(userId));
    await this.redis.deletePattern(RedisKeyBuilder.messagingUserPattern(userId));
    await this.redis.del(RedisKeyBuilder.socialPrivacy(userId));
    await this.redis.del(RedisKeyBuilder.userStatus(userId));
    await this.redis.del(RedisKeyBuilder.userDevices(userId));
    await this.redis.del(RedisKeyBuilder.userSockets(userId));
    await this.redis.del(RedisKeyBuilder.missedCallsCount(userId));
    await this.redis.del(RedisKeyBuilder.missedCallsViewedAt(userId));
    await this.redis.del(RedisKeyBuilder.offlineMessages(userId));
    await this.redis.del(RedisKeyBuilder.accountOtp(userId));
    await this.redis.del(RedisKeyBuilder.accountOtpCooldown(userId));
    if (this.redis.getClient().zrem) {
      await this.redis.getClient().zrem(RedisKeyBuilder.presenceOnlineUsers(), userId);
    }
  }

  private async deleteAuthData(userId: string) {
    await this.prisma.userToken.deleteMany({ where: { userId } });
    await this.prisma.userDevice.deleteMany({ where: { userId } });
    await this.prisma.privacySettings.deleteMany({ where: { userId } });
  }

  private async anonymizeMessages(userId: string) {
    let affected = 0;
    while (true) {
      const messages = await this.prisma.message.findMany({
        where: { senderId: userId },
        select: { id: true },
        take: this.BATCH_SIZE,
      });

      if (messages.length === 0) break;

      const ids = messages.map(m => m.id);
      const res = await this.prisma.message.updateMany({
        where: { id: { in: ids } },
        data: { senderId: null },
      });
      affected += res.count;
    }
    this.logger.debug(`Anonymized ${affected} messages for user ${userId}`);
  }

  private async softDeleteMedia(userId: string) {
    let affected = 0;
    while (true) {
      const media = await this.prisma.mediaAttachment.findMany({
        where: { uploadedBy: userId, deletedAt: null },
        select: { id: true },
        take: this.BATCH_SIZE,
      });

      if (media.length === 0) break;

      const ids = media.map(m => m.id);
      const res = await this.prisma.mediaAttachment.updateMany({
        where: { id: { in: ids } },
        data: { deletedAt: new Date() },
      });
      affected += res.count;
    }
    this.logger.debug(`Soft-deleted ${affected} media items for user ${userId}`);
  }

  private async deleteSocialGraph(userId: string) {
    await this.prisma.friendship.deleteMany({
      where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
    });
    await this.prisma.block.deleteMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    });
    await this.prisma.userContact.deleteMany({
      where: { OR: [{ ownerId: userId }, { contactUserId: userId }] },
    });
  }

  private async deleteConversationMemberships(userId: string) {
    // Determine conversations the user is in to manually update `participants` array
    const members = await this.prisma.conversationMember.findMany({
      where: { userId },
      select: { conversationId: true },
    });

    for (const member of members) {
      // Find the conversation to get the participants array
      const conv = await this.prisma.conversation.findUnique({
        where: { id: member.conversationId },
        select: { participants: true },
      });

      if (conv) {
        const remaining = conv.participants.filter(p => p !== userId);
        await this.prisma.conversation.update({
          where: { id: member.conversationId },
          data: { participants: remaining },
        });
      }
    }

    // Now delete the ConversationMember records
    await this.prisma.conversationMember.deleteMany({
      where: { userId },
    });
  }

  private async deleteOtherData(userId: string) {
    await this.prisma.reminder.deleteMany({ where: { userId } });
    await this.prisma.searchQuery.deleteMany({ where: { userId } });
    await this.prisma.callParticipant.deleteMany({ where: { userId } });
    await this.prisma.callHistory.deleteMany({ where: { initiatorId: userId } });
    // Cleanup any domain events originating from or specific to the user
    await this.prisma.domainEvent.deleteMany({
      where: { OR: [{ aggregateId: userId }, { aggregateType: 'User', aggregateId: userId }] },
    });
  }

  private async hardDeleteUser(userId: string) {
    // Only delete if the user exists
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user) {
      await this.prisma.user.delete({ where: { id: userId } });
      this.logger.debug(`Hard-deleted user record ${userId}`);
    }
  }
}
