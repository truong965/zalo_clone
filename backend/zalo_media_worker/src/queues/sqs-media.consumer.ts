// src/modules/media/queues/sqs-media.consumer.ts
//
// SQS polling consumer for background media processing (thumbnails, optimization).
// The backend has already moved files to permanent storage and marked them READY.
// This worker only handles IMAGE and VIDEO to create thumbnails/optimized variants.
//
import {
      Injectable,
      Logger,
      OnModuleInit,
      OnModuleDestroy,
      Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClsService } from 'nestjs-cls';
import { randomUUID } from 'crypto';
import type { ConfigType } from '@nestjs/config';
import uploadConfig from '../config/upload.config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
      ReceiveMessageCommand,
      DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import { PrismaService } from '../database/prisma.service';
import { ImageProcessor } from '../processors/image.processor';
import { VideoProcessor } from '../processors/video.processor';
import {
      ImageProcessingJob,
      VideoProcessingJob,
} from './media-queue.interface';
import { SqsClientFactory } from './sqs-client.factory';
import { ApiNotifierService } from '../services/api-notifier.service';
import {
      MediaAttachment,
      MemberStatus,
      MediaProcessingStatus,
      MediaType,
} from '@prisma/client';
import { S3Service } from '../services/s3.service';
import {
      ERROR_MESSAGES,
      MEDIA_EVENTS,
} from '../common/constants/media.constant';
import type {
      MediaProcessedEvent,
      MediaFailedEvent,
} from '../events/media.events';
import { MediaJobData } from './media-queue.interface';

interface SqsMessage {
      MessageId?: string;
      ReceiptHandle?: string;
      Body?: string;
}

@Injectable()
export class SqsMediaConsumer implements OnModuleInit, OnModuleDestroy {
      private readonly logger = new Logger(SqsMediaConsumer.name);
      private readonly imageQueueUrl: string;
      private readonly videoQueueUrl: string;
      private readonly waitTimeSeconds: number;
      private readonly visibilityTimeoutImage: number;
      private readonly visibilityTimeoutVideo: number;

      /** Set to false on destroy to stop polling loops */
      private running = false;

      constructor(
            private readonly configService: ConfigService,
            private readonly prisma: PrismaService,
            private readonly s3Service: S3Service,
            private readonly imageProcessor: ImageProcessor,
            private readonly videoProcessor: VideoProcessor,
            private readonly sqsFactory: SqsClientFactory,
            private readonly apiNotifier: ApiNotifierService,
            private readonly eventEmitter: EventEmitter2,
            @Inject(uploadConfig.KEY)
            private readonly config: ConfigType<typeof uploadConfig>,
      ) {
            this.imageQueueUrl = this.configService.getOrThrow<string>(
                  'queue.sqs.imageQueueUrl',
            );
            this.videoQueueUrl = this.configService.getOrThrow<string>(
                  'queue.sqs.videoQueueUrl',
            );
            this.waitTimeSeconds = this.configService.get<number>(
                  'queue.sqs.longPollingWaitSeconds',
                  20,
            );
            this.visibilityTimeoutImage = this.configService.get<number>(
                  'queue.sqs.visibilityTimeoutImage',
                  120,
            )
            this.visibilityTimeoutVideo = this.configService.get<number>(
                  'queue.sqs.visibilityTimeoutVideo',
                  900,
            );
      }

      onModuleInit() {
            this.running = true;
            // Start two independent polling loops — one per queue
            void this.pollLoop(this.imageQueueUrl, this.visibilityTimeoutImage, 'image');
            void this.pollLoop(this.videoQueueUrl, this.visibilityTimeoutVideo, 'video');
            this.logger.log('SQS consumer started (image + video polling loops)');
      }

      onModuleDestroy() {
            this.running = false;
            this.logger.log('SQS consumer stopped');
      }

      // -------------------------------------------------------------------------
      // Polling loop
      // -------------------------------------------------------------------------

      private async pollLoop(
            queueUrl: string,
            visibilityTimeout: number,
            label: string,
      ): Promise<void> {
            while (this.running) {
                  try {
                        const res = await this.sqsFactory.client.send(
                              new ReceiveMessageCommand({
                                    QueueUrl: queueUrl,
                                    MaxNumberOfMessages: 1,
                                    WaitTimeSeconds: this.waitTimeSeconds,
                                    VisibilityTimeout: visibilityTimeout,
                              }),
                        );

                        const messages = res.Messages ?? [];
                        if (messages.length === 0) continue;

                        const msg = messages[0];
                        await this.processMessage(msg, queueUrl, label);
                  } catch (err) {
                        if (this.running) {
                              this.logger.error(
                                    `[${label}] Polling error: ${(err as Error).message}`,
                              );
                              // Back-off briefly on network errors to avoid rapid loops
                              await sleep(5000);
                        }
                  }
            }
      }

      // -------------------------------------------------------------------------
      // Message processing — backend already moved files and set READY.
      // Worker only creates thumbnails / optimized variants.
      // -------------------------------------------------------------------------

      private async processMessage(
            msg: SqsMessage,
            queueUrl: string,
            label: string,
      ): Promise<void> {
            const receiptHandle = msg.ReceiptHandle;
            if (!receiptHandle || !msg.Body) {
                  this.logger.warn(`[${label}] Received message with no body or receipt`);
                  return;
            }

            let jobData: MediaJobData;
            try {
                  jobData = JSON.parse(msg.Body) as MediaJobData;
            } catch {
                  this.logger.error(`[${label}] Failed to parse SQS message body`);
                  // Delete malformed message — no point retrying
                  await this.deleteMessage(queueUrl, receiptHandle);
                  return;
            }

            const { type, payload } = jobData;
            this.logger.log(
                  `[SQS] Processing ${type} job for media ${payload.mediaId}`,
            );

            try {
                  const media = await this.fetchMediaWithRetry(payload.mediaId);
                  const userId = media.uploadedBy;

                  // Use the permanent s3Key set by the backend
                  payload.s3Key = media.s3Key!;

                  switch (type) {
                        case MediaType.IMAGE:
                              await this.processImage(payload as unknown as ImageProcessingJob, userId);
                              break;
                        case MediaType.VIDEO:
                              await this.processVideo(payload as unknown as VideoProcessingJob, userId);
                              break;
                        default:
                              // AUDIO/DOCUMENT should not arrive here, but handle gracefully
                              this.logger.warn(`[SQS] Unexpected media type ${type} — skipping`);
                              break;
                  }

                  // Success — delete from queue
                  await this.deleteMessage(queueUrl, receiptHandle);
                  this.logger.log(
                        `[SQS] ${type} job for media ${payload.mediaId} completed`,
                  );
            } catch (error) {
                  this.logger.error(
                        `[SQS] Job failed for media ${payload.mediaId}`,
                        error,
                  );
                  await this.handleJobFailure(payload.mediaId, error as Error, receiptHandle, queueUrl);
            }
      }

      // -------------------------------------------------------------------------
      // Failure handler — increment retryCount, decide delete or leave for DLQ
      // -------------------------------------------------------------------------

      private async handleJobFailure(
            mediaId: string,
            error: Error,
            receiptHandle: string,
            queueUrl: string,
      ): Promise<void> {
            const MAX_ATTEMPTS = 3;

            try {
                  const media = await this.prisma.mediaAttachment.update({
                        where: { id: mediaId },
                        data: {
                              // NOTE: We do NOT set processingStatus to FAILED here.
                              // The original file is already READY and visible to users.
                              // Only thumbnail/optimization failed — not critical.
                              processingError: `Background processing failed: ${error.message}`,
                              retryCount: { increment: 1 },
                        },
                        select: { id: true, uploadId: true, uploadedBy: true, retryCount: true },
                  });

                  if (media.retryCount >= MAX_ATTEMPTS) {
                        // All retries exhausted — delete from queue (SQS DLQ handles this via maxReceiveCount)
                        await this.deleteMessage(queueUrl, receiptHandle);

                        this.eventEmitter.emit(MEDIA_EVENTS.FAILED, {
                              mediaId: media.id,
                              uploadId: media.uploadId || '',
                              userId: media.uploadedBy,
                              reason: error.message,
                        } satisfies MediaFailedEvent);
                  }
                  // else: let SQS visibility timeout expire → message becomes visible again (retry)
            } catch (updateError) {
                  this.logger.warn(
                        `Failed to update media status after failure: ${(updateError as Error).message}`,
                  );
            }
      }

      // -------------------------------------------------------------------------
      // Processing methods — create thumbnails / optimized variants
      // The original file is already served to users via cdnUrl.
      // -------------------------------------------------------------------------

      private async processImage(payload: ImageProcessingJob, userId: string): Promise<void> {
            const { mediaId } = payload;
            void this.apiNotifier.emitToUser(userId, `progress:${mediaId}`, { status: 'processing', progress: 50 });

            const result = await this.imageProcessor.processImage(payload);

            await this.prisma.mediaAttachment.update({
                  where: { id: mediaId },
                  data: {
                        // Keep processingStatus as READY — original is already visible
                        thumbnailUrl: this.buildCdnUrl(result.thumbnail.s3Key),
                        optimizedUrl: result.optimized
                              ? this.buildCdnUrl(result.optimized.s3Key)
                              : null,
                  },
            });

            const media = await this.prisma.mediaAttachment.findUnique({
                  where: { id: mediaId },
                  select: { id: true, uploadId: true, uploadedBy: true, thumbnailUrl: true, cdnUrl: true, messageId: true },
            });
            if (media) {
                  const completedPayload = {
                        status: 'completed' as const,
                        progress: 100,
                        thumbnailUrl: this.buildCdnUrl(result.thumbnail.s3Key),
                        cdnUrl: media.cdnUrl ?? undefined,
                  };
                  void this.apiNotifier.emitToUser(userId, `progress:${mediaId}`, completedPayload);

                  this.eventEmitter.emit(MEDIA_EVENTS.PROCESSED, {
                        mediaId: media.id,
                        uploadId: media.uploadId || '',
                        userId: media.uploadedBy,
                        thumbnailUrl: media.thumbnailUrl ?? null,
                        cdnUrl: media.cdnUrl ?? null,
                  } satisfies MediaProcessedEvent);

                  void this.broadcastProgressToConversationMembers(
                        mediaId, userId, completedPayload, media.messageId,
                  );
            }
      }

      private async processVideo(payload: VideoProcessingJob, userId: string): Promise<void> {
            const { mediaId } = payload;
            void this.apiNotifier.emitToUser(userId, `progress:${mediaId}`, { status: 'processing', progress: 10 });

            const result = await this.videoProcessor.processVideo(payload);

            await this.prisma.mediaAttachment.update({
                  where: { id: mediaId },
                  data: {
                        // Keep processingStatus as READY — original is already visible
                        thumbnailUrl: this.buildCdnUrl(result.thumbnail.s3Key),
                        hlsPlaylistUrl: result.hls ? this.buildCdnUrl(result.hls.playlistKey) : null,
                  },
            });

            const media = await this.prisma.mediaAttachment.findUnique({
                  where: { id: mediaId },
                  select: { id: true, uploadId: true, uploadedBy: true, thumbnailUrl: true, cdnUrl: true, messageId: true },
            });
            if (media) {
                  const completedPayload = {
                        status: 'completed' as const,
                        progress: 100,
                        thumbnailUrl: this.buildCdnUrl(result.thumbnail.s3Key),
                        hlsPlaylistUrl: result.hls ? this.buildCdnUrl(result.hls.playlistKey) : undefined,
                        cdnUrl: media.cdnUrl ?? undefined,
                  };
                  void this.apiNotifier.emitToUser(userId, `progress:${mediaId}`, completedPayload);

                  this.eventEmitter.emit(MEDIA_EVENTS.PROCESSED, {
                        mediaId: media.id,
                        uploadId: media.uploadId || '',
                        userId: media.uploadedBy,
                        thumbnailUrl: media.thumbnailUrl ?? null,
                        cdnUrl: media.cdnUrl ?? null,
                  } satisfies MediaProcessedEvent);

                  void this.broadcastProgressToConversationMembers(
                        mediaId, userId, completedPayload, media.messageId,
                  );
            }
      }

      // -------------------------------------------------------------------------
      // Private helpers
      // -------------------------------------------------------------------------

      private async fetchMediaWithRetry(mediaId: string): Promise<MediaAttachment> {
            let retries = 0;
            const maxAttempts = this.config.retry.dbFetchMaxAttempts;
            const baseDelayMs = this.config.retry.dbFetchBaseDelayMs;

            while (retries < maxAttempts) {
                  try {
                        const media = await this.prisma.mediaAttachment.findUnique({
                              where: { id: mediaId },
                        });
                        if (media) return media;
                        retries++;
                        if (retries < maxAttempts) {
                              await sleep(baseDelayMs * Math.pow(2, retries - 1));
                        }
                  } catch (error) {
                        retries++;
                        if (retries >= maxAttempts) throw error;
                        await sleep(baseDelayMs);
                  }
            }
            throw new Error(`${ERROR_MESSAGES.MEDIA_NOT_FOUND}: ${mediaId}`);
      }

      /**
       * Broadcast a `progress:{mediaId}` event to all active conversation members
       * except the uploader.
       */
      private async broadcastProgressToConversationMembers(
            mediaId: string,
            uploaderId: string,
            payload: object,
            messageId: bigint | null | undefined,
      ): Promise<void> {
            if (!messageId) return;
            try {
                  const message = await this.prisma.message.findUnique({
                        where: { id: messageId },
                        select: { conversationId: true },
                  });
                  if (!message) return;

                  const members = await this.prisma.conversationMember.findMany({
                        where: {
                              conversationId: message.conversationId,
                              userId: { not: uploaderId },
                              status: MemberStatus.ACTIVE,
                        },
                        select: { userId: true },
                  });

                  for (const member of members) {
                        void this.apiNotifier.emitToUser(member.userId, `progress:${mediaId}`, payload);
                  }
            } catch (e) {
                  this.logger.warn(
                        `Failed to broadcast media progress to conversation members: ${(e as Error).message}`,
                  );
            }
      }

      private buildCdnUrl(s3Key: string): string {
            return this.s3Service.getCloudFrontUrl(s3Key);
      }

      private async deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
            await this.sqsFactory.client.send(
                  new DeleteMessageCommand({ QueueUrl: queueUrl, ReceiptHandle: receiptHandle }),
            );
      }
}

function sleep(ms: number): Promise<void> {
      return new Promise((r) => setTimeout(r, ms));
}
