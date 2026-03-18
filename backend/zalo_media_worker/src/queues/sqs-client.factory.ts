// src/queues/sqs-client.factory.ts
import { Injectable, Inject, OnModuleDestroy, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { SQSClient } from '@aws-sdk/client-sqs';
import queueConfig from '../config/queue.config';

@Injectable()
export class SqsClientFactory implements OnModuleDestroy {
      private readonly logger = new Logger(SqsClientFactory.name);
      readonly client: SQSClient;

      constructor(
            @Inject(queueConfig.KEY)
            private readonly queueCfg: ConfigType<typeof queueConfig>,
      ) {
            const region = this.queueCfg.sqs.region;

            // Credentials are resolved automatically by the AWS SDK provider chain:
            // - EC2 production: IAM Instance Profile (ZaloSQSAccess policy)
            // - Local dev: ~/.aws/credentials or AWS_PROFILE
            // Never pass explicit credentials here.
            this.client = new SQSClient({ region });

            this.logger.log(`SqsClientFactory initialised (region=${region})`);
      }

      onModuleDestroy() {
            this.client.destroy();
            this.logger.log('SQS client destroyed');
      }
}
