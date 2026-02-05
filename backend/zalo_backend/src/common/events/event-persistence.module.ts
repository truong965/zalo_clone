/**
 * EventPersistenceModule - PHASE 6
 *
 * Provides DomainEventPersistenceListener to persist critical domain events
 * to domain_events table for audit trail and event sourcing.
 *
 * Listens to: user.blocked, user.unblocked, friendship.*, privacy.updated
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
