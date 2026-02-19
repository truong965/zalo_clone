// src/modules/media/queues/sqs-media-queue.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
      SendMessageCommand,
      GetQueueAttributesCommand,
      QueueAttributeName,
} from '@aws-sdk/client-sqs';
import { MediaType } from '@prisma/client';
import {
      IMediaQueueService,
      FileProcessingJob,
      ImageProcessingJob,
      VideoProcessingJob,
      MediaJobData,
} from './media-queue.interface';
import { SqsClientFactory } from './sqs-client.factory';
import queueConfig from 'src/config/queue.config';

@Injectable()
export class SqsMediaQueueService implements IMediaQueueService {
      private readonly logger = new Logger(SqsMediaQueueService.name);
      private readonly imageQueueUrl: string;
      private readonly videoQueueUrl: string;

      constructor(
            private readonly sqsFactory: SqsClientFactory,
            @Inject(queueConfig.KEY)
            private readonly queueCfg: ConfigType<typeof queueConfig>,
      ) {
            this.imageQueueUrl = this.queueCfg.sqs.imageQueueUrl;
            this.videoQueueUrl = this.queueCfg.sqs.videoQueueUrl;
      }

      // -------------------------------------------------------------------------
      // Enqueue helpers
      // -------------------------------------------------------------------------

      async enqueueImageProcessing(
            payload: ImageProcessingJob,
      ): Promise<string> {
            const jobData: MediaJobData = { type: MediaType.IMAGE, payload };
            return this.sendMessage(this.imageQueueUrl, jobData, payload.mediaId);
      }

      async enqueueVideoProcessing(
            payload: VideoProcessingJob,
      ): Promise<string> {
            const jobData: MediaJobData = { type: MediaType.VIDEO, payload };
            return this.sendMessage(this.videoQueueUrl, jobData, payload.mediaId);
      }

      async enqueueFileProcessing(
            payload: FileProcessingJob,
            mediaType: MediaType,
      ): Promise<string> {
            const jobData: MediaJobData = { type: mediaType, payload };
            const queueUrl =
                  mediaType === MediaType.VIDEO
                        ? this.videoQueueUrl
                        : this.imageQueueUrl;
            return this.sendMessage(queueUrl, jobData, payload.mediaId);
      }

      // -------------------------------------------------------------------------
      // Queue stats (approximate — SQS is eventually-consistent)
      // -------------------------------------------------------------------------

      async getQueueStats() {
            const attrs = [
                  QueueAttributeName.ApproximateNumberOfMessages,
                  QueueAttributeName.ApproximateNumberOfMessagesNotVisible,
                  QueueAttributeName.ApproximateNumberOfMessagesDelayed,
            ];

            const [imageAttrs, videoAttrs] = await Promise.all([
                  this.fetchAttributes(this.imageQueueUrl, attrs),
                  this.fetchAttributes(this.videoQueueUrl, attrs),
            ]);

            const waiting =
                  (imageAttrs.waiting ?? 0) + (videoAttrs.waiting ?? 0);
            const active =
                  (imageAttrs.active ?? 0) + (videoAttrs.active ?? 0);
            const delayed =
                  (imageAttrs.delayed ?? 0) + (videoAttrs.delayed ?? 0);

            return {
                  waiting,
                  active,
                  completed: 0,   // SQS does not track completed
                  failed: 0,      // SQS does not track failed (goes to DLQ)
                  delayed,
                  total: waiting + active + delayed,
            };
      }

      // -------------------------------------------------------------------------
      // Private helpers
      // -------------------------------------------------------------------------

      private async sendMessage(
            queueUrl: string,
            body: MediaJobData,
            deduplicationKey: string,
      ): Promise<string> {
            const command = new SendMessageCommand({
                  QueueUrl: queueUrl,
                  MessageBody: JSON.stringify(body),
                  // Use mediaId as deduplication key for FIFO queues (ignored on standard)
                  ...(queueUrl.endsWith('.fifo')
                        ? {
                              MessageGroupId: deduplicationKey,
                              MessageDeduplicationId: `${deduplicationKey}-${Date.now()}`,
                        }
                        : {}),
            });

            const result = await this.sqsFactory.client.send(command);
            this.logger.debug(
                  `SQS enqueued ${body.type} job for media ${body.payload.mediaId}: ${result.MessageId}`,
            );
            return result.MessageId ?? '';
      }

      private async fetchAttributes(
            queueUrl: string,
            attributeNames: QueueAttributeName[],
      ) {
            try {
                  const res = await this.sqsFactory.client.send(
                        new GetQueueAttributesCommand({ QueueUrl: queueUrl, AttributeNames: attributeNames }),
                  );
                  const a = res.Attributes ?? {};
                  return {
                        waiting: parseInt(
                              a[QueueAttributeName.ApproximateNumberOfMessages] ?? '0',
                              10,
                        ),
                        active: parseInt(
                              a[QueueAttributeName.ApproximateNumberOfMessagesNotVisible] ?? '0',
                              10,
                        ),
                        delayed: parseInt(
                              a[QueueAttributeName.ApproximateNumberOfMessagesDelayed] ?? '0',
                              10,
                        ),
                  };
            } catch (e) {
                  this.logger.warn(`Failed to get SQS attributes for ${queueUrl}: ${(e as Error).message}`);
                  return { waiting: 0, active: 0, delayed: 0 };
            }
      }
}
