// src/services/api-notifier.service.ts
import { Injectable, Logger, Inject } from '@nestjs/common';
import axios from 'axios';
import type { ConfigType } from '@nestjs/config';
import workerConfig from '../config/worker.config';

@Injectable()
export class ApiNotifierService {
  private readonly logger = new Logger(ApiNotifierService.name);

  constructor(
    @Inject(workerConfig.KEY)
    private readonly config: ConfigType<typeof workerConfig>,
  ) { }

  async emitToUser(userId: string, event: string, payload: any): Promise<void> {
    // PHASE 5: Internal API routing — /internal/* instead of /api/v1/internal/*
    const url = `${this.config.apiUrl}/internal/media/broadcast`;
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        await axios.post(
          url,
          { userId, event, payload },
          {
            headers: { 'x-api-key': this.config.apiKey },
            timeout: 5000,
          }
        );
        this.logger.debug(`Broadcasted to ${userId}: ${event}`);
        return; // Success, exit
      } catch (error) {
        attempt++;
        const errorMessage = (error as Error).message;
        if (attempt >= maxRetries) {
          this.logger.error(`Failed to broadcast to ${userId} after 3 attempts: ${errorMessage}`);
          return;
        }
        this.logger.warn(`API broadcast failed (Attempt ${attempt}/${maxRetries}): ${errorMessage}. Retrying...`);
        // Wait before retry (e.g., 1000ms, 2000ms)
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      }
    }
  }
}
