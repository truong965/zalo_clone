// src/modules/media/queues/sqs-media.consumer.ts
//
// SQS polling consumer — replaces Bull @Processor when QUEUE_PROVIDER=sqs.
// Polls image + video queues concurrently using long-polling (WaitTimeSeconds=20).
// One message at a time per queue to stay within memory limits.
//
import {
      Injectable,
      Logger,
      OnModuleInit,
      OnModuleDestroy,
      Inject,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import uploadConfig from 'src/config/upload.config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
      ReceiveMessageCommand,
      DeleteMessageCommand,
} from '@aws-sdk/client-sqs';
import { PrismaService } from 'src/database/prisma.service';
import {
      ImageProcessor,
} from '../processors/image.processor';
import {
      VideoProcessor,
} from '../processors/video.processor';
import {
      ImageProcessingJob,
      VideoProcessingJob,
} from './media-queue.interface';
import { SqsClientFactory } from './sqs-client.factory';
import { SocketGateway } from 'src/socket/socket.gateway';
import {
      MediaAttachment,
      MediaProcessingStatus,
      MediaType,
      Prisma,
} from '@prisma/client';
import { S3Service } from '../services/s3.service';
import { FileValidationService } from '../services/file-validation.service';
import { createHash } from 'crypto';
import fs from 'fs';
import { writeFile, unlink } from 'fs/promises';
import {
      ERROR_MESSAGES,
      MEDIA_EVENTS,
} from 'src/common/constants/media.constant';
import type {
      MediaProcessedEvent,
      MediaFailedEvent,
} from '../events/media.events';
import { MediaJobData, FileProcessingJob } from './media-queue.interface';
import * as os from 'os';
import * as path from 'path';

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
            private readonly fileValidation: FileValidationService,
            private readonly imageProcessor: ImageProcessor,
            private readonly videoProcessor: VideoProcessor,
            private readonly sqsFactory: SqsClientFactory,
            private readonly socketGateway: SocketGateway,
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

            const tempFilePath = path.join(
                  os.tmpdir(),
                  `${payload.mediaId}_${Date.now()}`,
            );

            try {
                  const media = await this.fetchMediaWithRetry(payload.mediaId);
                  const userId = media.uploadedBy;
                  await this.ensureMediaConsistency(media, payload, userId);

                  const fileBuffer = await this.s3Service.downloadFile(payload.s3Key);
                  await writeFile(tempFilePath, fileBuffer);

                  const validationResult =
                        await this.fileValidation.validateFileOnDisk(tempFilePath);
                  if (!validationResult.isValid) {
                        throw new Error(
                              `${ERROR_MESSAGES.SECURITY_VIOLATION}: ${validationResult.reason}`,
                        );
                  }

                  switch (type) {
                        case MediaType.IMAGE:
                              await this.processImage(payload as unknown as ImageProcessingJob, userId);
                              break;
                        case MediaType.VIDEO:
                              await this.processVideo(payload as unknown as VideoProcessingJob, userId);
                              break;
                        case MediaType.AUDIO:
                        case MediaType.DOCUMENT:
                              await this.processDirectFile(
                                    payload.mediaId,
                                    media.mimeType,
                                    fileBuffer,
                              );
                              break;
                        default:
                              throw new Error(`Unknown media type: ${type as string}`);
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
            } finally {
                  if (fs.existsSync(tempFilePath)) {
                        await unlink(tempFilePath).catch(() => { });
                  }
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
                              processingStatus: MediaProcessingStatus.FAILED,
                              processingError: error.message,
                              retryCount: { increment: 1 },
                        },
                        select: { id: true, uploadId: true, uploadedBy: true, retryCount: true },
                  });

                  void this.socketGateway.emitToUser(media.uploadedBy, `progress:${mediaId}`, { status: 'failed', progress: 0, error: 'Processing failed' });

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
      // Processing methods (identical logic to Bull consumer)
      // -------------------------------------------------------------------------

      private async processImage(payload: ImageProcessingJob, userId: string): Promise<void> {
            const { mediaId } = payload;
            await this.updateMediaStatus(mediaId, MediaProcessingStatus.PROCESSING);
            void this.socketGateway.emitToUser(userId, `progress:${mediaId}`, { status: 'processing', progress: 0 });

            const result = await this.imageProcessor.processImage(payload);

            await this.prisma.mediaAttachment.update({
                  where: { id: mediaId },
                  data: {
                        processingStatus: MediaProcessingStatus.READY,
                        thumbnailUrl: this.buildCdnUrl(result.thumbnail.s3Key),
                        optimizedUrl: result.optimized
                              ? this.buildCdnUrl(result.optimized.s3Key)
                              : null,
                  },
            });

            void this.socketGateway.emitToUser(userId, `progress:${mediaId}`, {
                  status: 'completed',
                  progress: 100,
                  thumbnailUrl: this.buildCdnUrl(result.thumbnail.s3Key),
            });

            const media = await this.prisma.mediaAttachment.findUnique({
                  where: { id: mediaId },
                  select: { id: true, uploadId: true, uploadedBy: true, thumbnailUrl: true, cdnUrl: true },
            });
            if (media) {
                  this.eventEmitter.emit(MEDIA_EVENTS.PROCESSED, {
                        mediaId: media.id,
                        uploadId: media.uploadId || '',
                        userId: media.uploadedBy,
                        thumbnailUrl: media.thumbnailUrl ?? null,
                        cdnUrl: media.cdnUrl ?? null,
                  } satisfies MediaProcessedEvent);
            }
      }

      private async processVideo(payload: VideoProcessingJob, userId: string): Promise<void> {
            const { mediaId } = payload;
            await this.updateMediaStatus(mediaId, MediaProcessingStatus.PROCESSING);
            void this.socketGateway.emitToUser(userId, `progress:${mediaId}`, { status: 'processing', progress: 0 });

            const result = await this.videoProcessor.processVideo(payload);

            await this.prisma.mediaAttachment.update({
                  where: { id: mediaId },
                  data: {
                        processingStatus: MediaProcessingStatus.READY,
                        thumbnailUrl: this.buildCdnUrl(result.thumbnail.s3Key),
                        hlsPlaylistUrl: result.hls ? this.buildCdnUrl(result.hls.playlistKey) : null,
                  },
            });

            void this.socketGateway.emitToUser(userId, `progress:${mediaId}`, {
                  status: 'completed',
                  progress: 100,
                  thumbnailUrl: this.buildCdnUrl(result.thumbnail.s3Key),
                  hlsPlaylistUrl: result.hls ? this.buildCdnUrl(result.hls.playlistKey) : undefined,
            });

            const media = await this.prisma.mediaAttachment.findUnique({
                  where: { id: mediaId },
                  select: { id: true, uploadId: true, uploadedBy: true, thumbnailUrl: true, cdnUrl: true },
            });
            if (media) {
                  this.eventEmitter.emit(MEDIA_EVENTS.PROCESSED, {
                        mediaId: media.id,
                        uploadId: media.uploadId || '',
                        userId: media.uploadedBy,
                        thumbnailUrl: media.thumbnailUrl ?? null,
                        cdnUrl: media.cdnUrl ?? null,
                  } satisfies MediaProcessedEvent);
            }
      }

      private async processDirectFile(
            mediaId: string,
            mimeType: string,
            buffer: Buffer,
      ): Promise<void> {
            const permanentKey = this.generatePermanentKey(mediaId, mimeType);
            await this.s3Service.uploadFile(permanentKey, buffer, mimeType);
            await this.updateMediaStatus(mediaId, MediaProcessingStatus.READY, permanentKey);
            this.logger.log(`Direct file processed: ${mediaId}`);
      }

      // -------------------------------------------------------------------------
      // Private helpers (shared logic)
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

      private async ensureMediaConsistency(
            media: MediaAttachment,
            payload: ImageProcessingJob | VideoProcessingJob | FileProcessingJob, userId: string,): Promise<void> {
            if (media.s3KeyTemp) {
                  await this.validateAndMoveMedia(media.id, media.s3KeyTemp, media.uploadId!, userId);
                  const updated = await this.prisma.mediaAttachment.findUnique({ where: { id: media.id } });
                  if (!updated?.s3Key) throw new Error('Failed to get permanent key after move');
                  payload.s3Key = updated.s3Key;
            } else if (media.s3Key) {
                  payload.s3Key = media.s3Key;
            } else {
                  throw new Error(ERROR_MESSAGES.S3_KEY_MISSING);
            }
      }

      private async validateAndMoveMedia(
            mediaId: string,
            tempKey: string,
            uploadId: string,
            userId: string,
      ): Promise<string> {
            void this.socketGateway.emitToUser(userId, `progress:${mediaId}`, { status: 'processing', progress: 5 });

            let tempFilePath: string | null = null;
            try {
                  tempFilePath = await this.s3Service.downloadToLocalTemp(tempKey);
                  const validation = await this.fileValidation.validateFileOnDisk(tempFilePath);
                  if (!validation.isValid) throw new Error(`Validation Failed: ${validation.reason}`);

                  const permanentKey = this.generatePermanentKey(uploadId, validation.extension || 'bin');
                  await this.s3Service.moveObjectAtomic(tempKey, permanentKey);

                  await this.prisma.mediaAttachment.update({
                        where: { id: mediaId },
                        data: {
                              s3Key: permanentKey,
                              s3KeyTemp: null,
                              mimeType: validation.mimeType || 'application/octet-stream',
                              cdnUrl: this.s3Service.getCloudFrontUrl(permanentKey),
                              width: validation.metadata?.width,
                              height: validation.metadata?.height,
                              duration: validation.metadata?.duration,
                        },
                  });
                  return permanentKey;
            } catch (error) {
                  await this.s3Service.deleteFile(tempKey).catch(() => { });
                  throw error;
            } finally {
                  if (tempFilePath) await unlink(tempFilePath).catch(() => { });
            }
      }

      private generatePermanentKey(uploadId: string, extension: string): string {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const fileHash = createHash('md5').update(uploadId).digest('hex').substring(0, 12);
            return `permanent/${year}/${month}/unlinked/${fileHash}.${extension}`;
      }

      private async updateMediaStatus(
            mediaId: string,
            status: MediaProcessingStatus,
            s3Key?: string,
            size?: bigint,
      ): Promise<void> {
            const data: Prisma.MediaAttachmentUpdateInput = { processingStatus: status };
            if (s3Key) { data.s3Key = s3Key; data.s3KeyTemp = null; }
            if (size) data.size = size;
            await this.prisma.mediaAttachment.update({ where: { id: mediaId }, data });
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
