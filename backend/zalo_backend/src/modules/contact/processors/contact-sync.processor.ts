import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ContactService } from '../contact.service';
import { CONTACT_SYNC_QUEUE, CONTACT_SYNC_JOB } from '../contact.constants';

export interface ContactSyncJobPayload {
  ownerId: string;
  contacts: any[];
}

@Processor(CONTACT_SYNC_QUEUE)
export class ContactSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(ContactSyncProcessor.name);

  constructor(private readonly contactService: ContactService) {
    super();
  }

  async process(job: Job<ContactSyncJobPayload, any, string>): Promise<any> {
    if (job.name === CONTACT_SYNC_JOB) {
      const { ownerId, contacts } = job.data;
      this.logger.log(`Starting background sync job for user: ${ownerId}`);
      
      try {
        await this.contactService.processSyncInBackground(ownerId, contacts);
        this.logger.log(`Background sync job completed for user: ${ownerId}`);
      } catch (error) {
        this.logger.error(`Background sync job failed for user: ${ownerId}`, error.stack);
        throw error;
      }
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Job ${job.id} has been completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job ${job.id} has failed with error: ${error.message}`);
  }
}
