/**
 * DomainEventPersistenceListener - PHASE 6
 *
 * Supplemental persistence listener for non-critical / legacy direct-emitted
 * domain events that are not persisted by EventPublisher critical-path.
 *
 * Primary strategy (Phase 6, Option A):
 * - Critical events are persisted in EventPublisher before listener fan-out.
 * - This listener only handles non-critical/bridge events to avoid overlap.
 *
 * Events persisted (listener scope after overlap cleanup):
 * - FRIEND_REQUEST_SENT, FRIEND_REQUEST_REJECTED,
 *   FRIEND_REQUEST_CANCELLED, UNFRIENDED
 * - PRIVACY_SETTINGS_UPDATED
 *
 * Idempotency: eventId is unique in domain_events; duplicate inserts are ignored.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@database/prisma.service';
import { EventType, Prisma } from '@prisma/client';
import { InternalEventNames } from '@common/contracts/events/event-names';

interface PersistInput {
  eventId: string;
  eventType: EventType;
  aggregateId: string;
  aggregateType: string;
  version: number;
  source: string;
  correlationId?: string;
  payload: Record<string, unknown>;
  occurredAt: Date;
}

@Injectable()
export class DomainEventPersistenceListener {
  private readonly logger = new Logger(DomainEventPersistenceListener.name);

  constructor(private readonly prisma: PrismaService) {}

  @OnEvent(InternalEventNames.FRIENDSHIP_REQUEST_SENT, { async: true })
  async handleFriendRequestSent(payload: {
    eventId?: string;
    eventType?: string;
    requestId?: string;
    fromUserId?: string;
    toUserId?: string;
    timestamp?: Date;
    correlationId?: string;
  }): Promise<void> {
    const eventId = payload?.eventId;
    if (!eventId) {
      this.logger.warn('[PERSIST] friendship.request.sent missing eventId');
      return;
    }
    await this.persist({
      eventId,
      eventType: EventType.FRIEND_REQUEST_SENT,
      aggregateId: payload.requestId ?? payload.fromUserId ?? 'unknown',
      aggregateType: 'Friendship',
      version: 1,
      source: 'FriendshipModule',
      correlationId: payload.correlationId,
      payload: payload as Record<string, unknown>,
      occurredAt: payload.timestamp ?? new Date(),
    });
  }

  @OnEvent(InternalEventNames.FRIENDSHIP_REQUEST_DECLINED, { async: true })
  async handleFriendRequestDeclined(payload: {
    eventId?: string;
    requestId?: string;
    fromUserId?: string;
    toUserId?: string;
    timestamp?: Date;
    correlationId?: string;
  }): Promise<void> {
    const eventId = payload?.eventId;
    if (!eventId) {
      this.logger.warn('[PERSIST] friendship.request.declined missing eventId');
      return;
    }
    await this.persist({
      eventId,
      eventType: EventType.FRIEND_REQUEST_REJECTED,
      aggregateId: payload.requestId ?? payload.fromUserId ?? 'unknown',
      aggregateType: 'Friendship',
      version: 1,
      source: 'FriendshipModule',
      correlationId: payload.correlationId,
      payload: payload as Record<string, unknown>,
      occurredAt: payload.timestamp ?? new Date(),
    });
  }

  @OnEvent(InternalEventNames.FRIENDSHIP_REQUEST_CANCELLED, { async: true })
  async handleFriendRequestCancelled(payload: {
    eventId?: string;
    friendshipId?: string;
    cancelledBy?: string;
    targetUserId?: string;
    timestamp?: Date;
    correlationId?: string;
  }): Promise<void> {
    const eventId = payload?.eventId;
    if (!eventId) {
      this.logger.warn(
        '[PERSIST] friendship.request.cancelled missing eventId',
      );
      return;
    }
    await this.persist({
      eventId,
      eventType: EventType.FRIEND_REQUEST_CANCELLED,
      aggregateId: payload.friendshipId ?? payload.cancelledBy ?? 'unknown',
      aggregateType: 'Friendship',
      version: 1,
      source: 'FriendshipModule',
      correlationId: payload.correlationId,
      payload: payload as Record<string, unknown>,
      occurredAt: payload.timestamp ?? new Date(),
    });
  }

  @OnEvent(InternalEventNames.FRIENDSHIP_UNFRIENDED, { async: true })
  async handleUnfriended(payload: {
    eventId?: string;
    friendshipId?: string;
    initiatedBy?: string;
    user1Id?: string;
    user2Id?: string;
    timestamp?: Date;
    correlationId?: string;
  }): Promise<void> {
    const eventId = payload?.eventId;
    if (!eventId) {
      this.logger.warn('[PERSIST] friendship.unfriended missing eventId');
      return;
    }
    await this.persist({
      eventId,
      eventType: EventType.UNFRIENDED,
      aggregateId: payload.friendshipId ?? payload.initiatedBy ?? 'unknown',
      aggregateType: 'Friendship',
      version: 1,
      source: 'FriendshipModule',
      correlationId: payload.correlationId,
      payload: payload as Record<string, unknown>,
      occurredAt: payload.timestamp ?? new Date(),
    });
  }

  @OnEvent(InternalEventNames.PRIVACY_UPDATED, { async: true })
  async handlePrivacyUpdated(payload: {
    eventId?: string;
    userId?: string;
    settings?: Record<string, unknown>;
    timestamp?: Date;
  }): Promise<void> {
    const eventId = payload?.eventId;
    if (!eventId) {
      this.logger.warn('[PERSIST] privacy.updated missing eventId');
      return;
    }
    await this.persist({
      eventId,
      eventType: EventType.PRIVACY_SETTINGS_UPDATED,
      aggregateId: payload.userId ?? 'unknown',
      aggregateType: 'Privacy',
      version: 1,
      source: 'PrivacyModule',
      payload: payload as Record<string, unknown>,
      occurredAt: payload.timestamp ?? new Date(),
    });
  }

  /**
   * Persist event to domain_events table.
   * Idempotent: ON CONFLICT (eventId) DO NOTHING
   */
  private async persist(input: PersistInput): Promise<void> {
    try {
      // Ensure payload is JSON-serializable (Date → ISO string)
      const payload = JSON.parse(
        JSON.stringify(input.payload),
      ) as Prisma.InputJsonValue;

      await this.prisma.domainEvent.upsert({
        where: { eventId: input.eventId },
        create: {
          eventId: input.eventId,
          eventType: input.eventType,
          aggregateId: input.aggregateId,
          aggregateType: input.aggregateType,
          version: input.version,
          source: input.source,
          correlationId: input.correlationId ?? null,
          payload,
          occurredAt: input.occurredAt,
        },
        update: {}, // Idempotent: no-op if already exists
      });
      this.logger.debug(
        `[PERSIST] ${input.eventType} (${input.eventId.slice(0, 8)}...)`,
      );
    } catch (error) {
      this.logger.error(
        `[PERSIST] Failed to persist ${input.eventType}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
