import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AiProxyController } from './ai-proxy.controller';
import { AiProxyService } from './ai-proxy.service';
import { AiStreamBridgeService } from './ai-stream-bridge.service';
import { ConversationModule } from '../conversation/conversation.module';
import { DatabaseModule } from 'src/database/prisma.module';

@Module({
  imports: [
    HttpModule,
    ConversationModule,
    DatabaseModule,
  ],
  controllers: [AiProxyController],
  providers: [AiProxyService, AiStreamBridgeService],
  exports: [AiProxyService],
})
export class AiProxyModule {}
