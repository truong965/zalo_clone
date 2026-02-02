import { Module } from '@nestjs/common';
import { BlockService } from './block.service';
import { BlockController } from './block.controller';
import { RedisModule } from 'src/modules/redis/redis.module';
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    // Import các module hạ tầng cần thiết
    RedisModule,
    EventEmitterModule,
  ],
  controllers: [BlockController],
  providers: [BlockService],
  exports: [BlockService], // [QUAN TRỌNG] Export để SocialModule dùng
})
export class BlockModule {}
