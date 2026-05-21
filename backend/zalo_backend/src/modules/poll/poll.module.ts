import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DatabaseModule } from 'src/database/prisma.module';
import { SharedModule } from '@shared/shared.module';
import { PollService } from './services/poll.service';
import { PollSocketListener } from './listeners/poll-socket.listener';
import { PollController } from './poll.controller';

@Module({
  imports: [DatabaseModule, EventEmitterModule, SharedModule],
  controllers: [PollController],
  providers: [PollService, PollSocketListener],
  exports: [PollService],
})
export class PollModule {}
