// src/modules/media/queues/sqs-client.factory.ts
//
// Single shared SQSClient built from the typed config tree.
// Both SqsMediaQueueService and SqsMediaConsumer inject this factory so
// credentials are read and validated in exactly one place (TD-38 / TD-10).
//
import { Injectable, Inject, OnModuleDestroy, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { SQSClient } from '@aws-sdk/client-sqs';
import s3Config from 'src/config/s3.config';
import queueConfig from 'src/config/queue.config';

@Injectable()
export class SqsClientFactory implements OnModuleDestroy {
      private readonly logger = new Logger(SqsClientFactory.name);
      readonly client: SQSClient;

      constructor(
            @Inject(s3Config.KEY)
            private readonly s3Cfg: ConfigType<typeof s3Config>,
            @Inject(queueConfig.KEY)
            private readonly queueCfg: ConfigType<typeof queueConfig>,
      ) {
            const { accessKeyId, secretAccessKey } = this.s3Cfg.credentials;
            const region = this.queueCfg.sqs.region;

            this.client = new SQSClient({
                  region,
                  // On EC2 with IAM Instance Profile, omit explicit credentials so the
                  // SDK resolves them from the instance metadata endpoint automatically.
                  ...(accessKeyId && secretAccessKey
                        ? { credentials: { accessKeyId, secretAccessKey } }
                        : {}),
            });

            this.logger.log(`SqsClientFactory initialised (region=${region})`);
      }

      onModuleDestroy() {
            this.client.destroy();
            this.logger.log('SQS client destroyed');
      }
}
