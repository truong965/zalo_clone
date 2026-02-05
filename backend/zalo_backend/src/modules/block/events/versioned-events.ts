import { EventType } from '@prisma/client';
import {
  VersionedDomainEvent,
  LinearVersionStrategy,
} from '@common/events/versioned-event';

/**
 * PHASE 3.4: Versioned Block Domain Events
 *
 * Block domain events with versioning support for schema evolution
 * Version history:
 * - V1: blockerId, blockedId, blockId, reason
 * - V2 (future): Add severity levels, admin flags, etc.
 */

// ============================================================================
// USER_BLOCKED EVENT
// ============================================================================

/**
 * V1 (Current): UserBlockedEvent
 * Emitted when user blocks another user
 *
 * Payload:
 * - blockerId: User performing the block
 * - blockedId: User being blocked
 * - blockId: Reference to Block record
 * - reason: Optional reason for audit trail
 */
export class UserBlockedEvent extends VersionedDomainEvent {
  readonly version: number = 1;
  readonly eventType = EventType.USER_BLOCKED;

  constructor(
    readonly blockerId: string,
    readonly blockedId: string,
    readonly blockId: string,
    readonly reason?: string,
    correlationId?: string,
  ) {
    super(blockerId, 'BlockModule', 1, correlationId);
  }

  isValid(): boolean {
    return (
      super.isValid() && !!this.blockerId && !!this.blockedId && !!this.blockId
    );
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      blockerId: this.blockerId,
      blockedId: this.blockedId,
      blockId: this.blockId,
      reason: this.reason,
    };
  }
}

/**
 * Strategy for UserBlockedEvent versioning
 * Handles upgrades from V1 → V2 (future)
 */
export class UserBlockedEventStrategy extends LinearVersionStrategy<UserBlockedEvent> {
  protected currentVersion = 1;

  protected upgradeHandlers: Record<number, (event: any) => any> = {
    // V1 → V2: Add severity field
    // 1: (event) => ({
    //   ...event,
    //   version: 2,
    //   severity: 'NORMAL', // default for old events
    // }),
  };

  protected downgradeHandlers: Record<number, (event: any) => any> = {
    // V2 → V1: Remove severity field
    // 2: (event) => {
    //   const { severity, ...rest } = event;
    //   return { ...rest, version: 1 };
    // },
  };
}

// ============================================================================
// USER_UNBLOCKED EVENT
// ============================================================================

/**
 * V1 (Current): UserUnblockedEvent
 * Emitted when user unblocks another user
 *
 * Payload:
 * - blockerId: User performing the unblock
 * - blockedId: User being unblocked
 * - blockId: Reference to deleted Block record (for audit)
 */
export class UserUnblockedEvent extends VersionedDomainEvent {
  readonly version: number = 1;
  readonly eventType = EventType.USER_UNBLOCKED;

  constructor(
    readonly blockerId: string,
    readonly blockedId: string,
    readonly blockId: string,
    correlationId?: string,
  ) {
    super(blockerId, 'BlockModule', 1, correlationId);
  }

  isValid(): boolean {
    return (
      super.isValid() && !!this.blockerId && !!this.blockedId && !!this.blockId
    );
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      blockerId: this.blockerId,
      blockedId: this.blockedId,
      blockId: this.blockId,
    };
  }
}

/**
 * Strategy for UserUnblockedEvent versioning
 */
export class UserUnblockedEventStrategy extends LinearVersionStrategy<UserUnblockedEvent> {
  protected currentVersion = 1;
  protected upgradeHandlers: Record<number, (event: any) => any> = {};
  protected downgradeHandlers: Record<number, (event: any) => any> = {};
}
