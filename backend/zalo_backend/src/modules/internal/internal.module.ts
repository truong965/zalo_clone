import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AIInternalController } from './ai-internal.controller';
import { DatabaseModule } from 'src/database/prisma.module';
import { AIInternalListener } from './listeners/ai-internal.listener';

@Module({
  imports: [
    DatabaseModule,
    BullModule.registerQueue(
      {
        name: 'embed',
        configKey: 'ai',
      },
      {
        name: 'automod',
        configKey: 'ai',
      },
      {
        name: 'ai-job',
        configKey: 'ai',
      },
    ),
  ],
  providers: [AIInternalListener],
  controllers: [AIInternalController],
  exports: [BullModule],
})
export class InternalModule { }
