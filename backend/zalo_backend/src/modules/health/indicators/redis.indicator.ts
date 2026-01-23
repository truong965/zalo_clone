import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult } from '@nestjs/terminus';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class RedisHealthIndicator {
  constructor(private readonly redisService: RedisService) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const isHealthy = await this.redisService.isHealthy();
    const info = await this.redisService.getInfo();

    return {
      [key]: {
        ...info,
        status: isHealthy ? 'up' : 'down',
      },
    };
  }
}
