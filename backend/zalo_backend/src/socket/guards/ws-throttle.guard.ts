import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { RedisRateLimitService } from 'src/modules/redis/services/redis-rate-limit.service'; // Import Service
import { AuthenticatedSocket } from 'src/common/interfaces/socket-client.interface';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import redisConfig from 'src/config/redis.config';
import type { ConfigType } from '@nestjs/config';

@Injectable()
export class WsThrottleGuard implements CanActivate {
  private readonly logger = new Logger(WsThrottleGuard.name);

  constructor(
    // Inject RedisRateLimitService để kiểm tra
    private readonly rateLimitService: RedisRateLimitService,
    @Inject(redisConfig.KEY)
    private readonly config: ConfigType<typeof redisConfig>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: AuthenticatedSocket = context.switchToWs().getClient();

    // Bỏ qua rate limit cho các event hệ thống nếu cần (VD: ping/pong)
    // Nhưng với Socket.IO, ping/pong được xử lý ngầm, guard chỉ chặn message custom.

    // 1. Kiểm tra Rate Limit cho Socket ID hiện tại
    const result = await this.rateLimitService.checkEventRateLimit(client.id);

    if (!result.allowed) {
      this.logger.warn(
        `Socket ${client.id} bị chặn do spam (Remaining: ${result.remaining}, Reset: ${result.resetAt.toDateString()})`,
      );

      // 2. Gửi thông báo lỗi về cho Client biết
      // Quan trọng: Client cần biết mình bị chặn để hiển thị UI hoặc chờ đợi
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

      // 3. Chặn request (Return false)
      // Ném Exception để NestJS filter bắt được (Optional, nhưng emit trực tiếp ở trên UX tốt hơn)
      throw new WsException('Rate limit exceeded');
    }

    return true; // Cho phép đi tiếp
  }
}
