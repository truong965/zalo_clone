import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '@database/prisma.module';
import { EventPublisher } from './event-publisher.service';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [EventPublisher],
  exports: [EventPublisher],
})
export class EventsModule {}
