import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserEventHandler } from './listeners/user-event.handler';
import { RedisModule } from '@shared/redis/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [UsersController],
  providers: [UsersService, UserEventHandler],
  exports: [UsersService],
})
export class UsersModule {}
