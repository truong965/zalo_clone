import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UserEventHandler } from './listeners/user-event.handler';
import { RedisModule } from '@shared/redis/redis.module';
import { BullModule } from '@nestjs/bullmq';
import { ACCOUNT_PURGE_QUEUE } from './constants/purge-queue.constant';
import { AccountPurgeWorker } from './workers/account-purge.worker';
import { USER_READ_PORT } from '@common/contracts/internal-api';
import { UserReadAdapter } from './internal-api/user-read.adapter';
import { AuthorizationModule } from '@modules/authorization/authorization.module';

@Module({
  imports: [
    RedisModule,
    BullModule.registerQueue({
      name: ACCOUNT_PURGE_QUEUE,
    }),
    AuthorizationModule,
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    UserEventHandler,
    AccountPurgeWorker,
    { provide: USER_READ_PORT, useClass: UserReadAdapter },
  ],
  exports: [UsersService, BullModule, USER_READ_PORT],
})
export class UsersModule { }
