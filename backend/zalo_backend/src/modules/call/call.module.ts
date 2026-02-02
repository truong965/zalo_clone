import { Module, forwardRef } from '@nestjs/common';
import { CallHistoryController } from './call-history.controller';
import { CallHistoryService } from './call-history.service';
import { SocialModule } from '../social/social.module'; // Import SocialModule
import { RedisModule } from '../redis/redis.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    RedisModule,
    EventEmitterModule,
    // [QUAN TRỌNG] Dùng forwardRef vì SocialModule cũng import CallModule
    forwardRef(() => SocialModule),
  ],
  controllers: [CallHistoryController],
  providers: [CallHistoryService],
  exports: [CallHistoryService], // Export để SocialListener dùng
})
export class CallModule {}
