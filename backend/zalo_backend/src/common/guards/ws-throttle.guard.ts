import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { RedisRateLimitService } from 'src/shared/redis/services/redis-rate-limit.service';
import { AuthenticatedSocket } from 'src/common/interfaces/socket-client.interface';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import redisConfig from 'src/config/redis.config';
import type { ConfigType } from '@nestjs/config';

@Injectable()
export class WsThrottleGuard implements CanActivate {
  private readonly logger = new Logger(WsThrottleGuard.name);

  constructor(
    private readonly rateLimitService: RedisRateLimitService,
    @Inject(redisConfig.KEY)
    private readonly config: ConfigType<typeof redisConfig>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: AuthenticatedSocket = context.switchToWs().getClient();

    const result = await this.rateLimitService.checkEventRateLimit(client.id);

    if (!result.allowed) {
      this.logger.warn(
        `Socket ${client.id} bị chặn do spam (Remaining: ${result.remaining}, Reset: ${result.resetAt.toDateString()})`,
      );

      client.emit(SocketEvents.ERROR, {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'You are sending requests too fast. Please try again later.',
        data: {
          resetAt: result.resetAt,
          limit: this.config.rateLimit.eventsPerTenSeconds,
          window: this.config.ttl.rateLimitEventWindow,
          remaining: result.remaining,
        },
      });

      throw new WsException('Rate limit exceeded');
    }

    return true;
  }
}
