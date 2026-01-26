// // src/modules/media/guards/upload-rate-limit.guard.ts

// import {
//   Injectable,
//   CanActivate,
//   ExecutionContext,
//   HttpException,
//   HttpStatus,
//   Logger,
// } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { RedisCacheService } from 'src/modules/redis/services/redis-cache.service';

// @Injectable()
// export class UploadRateLimitGuard implements CanActivate {
//   private readonly logger = new Logger(UploadRateLimitGuard.name);
//   private readonly limit: number;
//   private readonly ttl: number;

//   constructor(
//     private readonly redis: RedisCacheService,
//     private readonly config: ConfigService,
//   ) {
//     this.limit = this.config.get('media.rateLimit.uploadRequestLimit', 10);
//     this.ttl = this.config.get('media.rateLimit.uploadRequestTtl', 60);
//   }

//   async canActivate(context: ExecutionContext): Promise<boolean> {
//     const request = context.switchToHttp().getRequest();
//     const userId = request.user?.id;

//     if (!userId) {
//       throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
//     }

//     const key = `upload:ratelimit:${userId}`;
//     const current = await this.redis.incr(key);

//     if (current === 1) {
//       // First request, set expiry
//       await this.redis.expire(key, this.ttl);
//     }

//     if (current > this.limit) {
//       this.logger.warn(
//         `Upload rate limit exceeded for user ${userId}: ${current}/${this.limit}`,
//       );

//       throw new HttpException(
//         {
//           statusCode: HttpStatus.TOO_MANY_REQUESTS,
//           message: `Upload rate limit exceeded. Max ${this.limit} requests per ${this.ttl} seconds.`,
//           retryAfter: await this.redis.ttl(key),
//         },
//         HttpStatus.TOO_MANY_REQUESTS,
//       );
//     }

//     return true;
//   }
// }
