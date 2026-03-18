/**
 * EventPersistenceModule - PHASE 6
 *
 * Provides DomainEventPersistenceListener as supplemental persistence path
 * for non-critical / legacy direct-emitted events.
 *
 * Critical persistence is handled by EventPublisher (Option A).
 *
 * Listens to: friendship.request.* (except accepted), unfriended, privacy.updated
 */

import { Module } from '@nestjs/common';
import { DatabaseModule } from '@database/prisma.module';
import { DomainEventPersistenceListener } from './domain-event-persistence.listener';

@Module({
  imports: [DatabaseModule],
  providers: [DomainEventPersistenceListener],
  exports: [DomainEventPersistenceListener],
})
export class EventPersistenceModule {}
