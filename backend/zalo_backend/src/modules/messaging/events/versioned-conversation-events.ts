import { EventType } from '@prisma/client';
import {
  VersionedDomainEvent,
  LinearVersionStrategy,
} from '@common/events/versioned-event';

/**
 * PHASE 3.4: Versioned Conversation Domain Events
 *
 * Conversation management events with full versioning support
 * Version history:
 * - V1: conversationId, memberId, action (ADDED|LEFT|REMOVED|ADMIN_PROMOTED)
 * - V2 (future): Add role-based permissions, member metadata
 */

// ============================================================================
// CONVERSATION_MEMBER_ADDED EVENT
// ============================================================================

/**
 * V1 (Current): ConversationMemberAddedEvent
 * Emitted when a member is added to a conversation
 */
export class ConversationMemberAddedEvent extends VersionedDomainEvent {
  readonly version: number = 1;
  readonly eventType = EventType.GROUP_CREATED;

  constructor(
    readonly conversationId: string,
    readonly memberId: string,
    readonly addedBy: string,
    readonly role: 'MEMBER' | 'ADMIN' = 'MEMBER',
    correlationId?: string,
  ) {
    super(conversationId, 'ConversationModule', 1, correlationId);
  }

  isValid(): boolean {
    return (
      super.isValid() &&
      !!this.conversationId &&
      !!this.memberId &&
      !!this.addedBy
    );
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      conversationId: this.conversationId,
      memberId: this.memberId,
      addedBy: this.addedBy,
      role: this.role,
    };
  }
}

export class ConversationMemberAddedEventStrategy extends LinearVersionStrategy<ConversationMemberAddedEvent> {
  protected currentVersion = 1;

  protected upgradeHandlers: Record<number, (event: any) => any> = {
    // V1 → V2: Add permission flags
    // 1: (event) => ({
    //   ...event,
    //   version: 2,
    //   permissions: { canDeleteMessages: event.role === 'ADMIN' },
    // }),
  };

  protected downgradeHandlers: Record<number, (event: any) => any> = {
    // V2 → V1: Remove permission flags
    // 2: (event) => {
    //   const { permissions, ...rest } = event;
    //   return { ...rest, version: 1 };
    // },
  };
}

// ============================================================================
// CONVERSATION_MEMBER_LEFT EVENT
// ============================================================================

export class ConversationMemberLeftEvent extends VersionedDomainEvent {
  readonly version: number = 1;
  readonly eventType = EventType.CONVERSATION_CREATED;

  constructor(
    readonly conversationId: string,
    readonly memberId: string,
    readonly leftAt: Date,
    readonly reason?: string,
    readonly kickedBy?: string,
    correlationId?: string,
  ) {
    super(conversationId, 'ConversationModule', 1, correlationId);
  }

  isValid(): boolean {
    return (
      super.isValid() &&
      !!this.conversationId &&
      !!this.memberId &&
      this.leftAt instanceof Date
    );
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      conversationId: this.conversationId,
      memberId: this.memberId,
      leftAt: this.leftAt,
      reason: this.reason,
    };
  }
}

export class ConversationMemberLeftEventStrategy extends LinearVersionStrategy<ConversationMemberLeftEvent> {
  protected currentVersion = 1;
  protected upgradeHandlers: Record<number, (event: any) => any> = {};
  protected downgradeHandlers: Record<number, (event: any) => any> = {};
}

// ============================================================================
// CONVERSATION_MEMBER_REMOVED EVENT
// ============================================================================

export class ConversationMemberRemovedEvent extends VersionedDomainEvent {
  readonly version: number = 1;
  readonly eventType = EventType.CONVERSATION_CREATED;

  constructor(
    readonly conversationId: string,
    readonly memberId: string,
    readonly removedBy: string,
    readonly removedAt: Date,
    readonly reason?: string,
    correlationId?: string,
  ) {
    super(conversationId, 'ConversationModule', 1, correlationId);
  }

  isValid(): boolean {
    return (
      super.isValid() &&
      !!this.conversationId &&
      !!this.memberId &&
      !!this.removedBy
    );
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      conversationId: this.conversationId,
      memberId: this.memberId,
      removedBy: this.removedBy,
      removedAt: this.removedAt,
      reason: this.reason,
    };
  }
}

export class ConversationMemberRemovedEventStrategy extends LinearVersionStrategy<ConversationMemberRemovedEvent> {
  protected currentVersion = 1;
  protected upgradeHandlers: Record<number, (event: any) => any> = {};
  protected downgradeHandlers: Record<number, (event: any) => any> = {};
}

// ============================================================================
// CONVERSATION_ROLE_CHANGED EVENT
// ============================================================================

export class ConversationRoleChangedEvent extends VersionedDomainEvent {
  readonly version: number = 1;
  readonly eventType = EventType.GROUP_CREATED;

  constructor(
    readonly conversationId: string,
    readonly memberId: string,
    readonly changedBy: string,
    readonly oldRole: 'MEMBER' | 'ADMIN',
    readonly newRole: 'MEMBER' | 'ADMIN',
    correlationId?: string,
  ) {
    super(conversationId, 'ConversationModule', 1, correlationId);
  }

  isValid(): boolean {
    return (
      super.isValid() &&
      !!this.conversationId &&
      !!this.memberId &&
      !!this.changedBy &&
      !!this.oldRole &&
      !!this.newRole
    );
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      conversationId: this.conversationId,
      memberId: this.memberId,
      changedBy: this.changedBy,
      oldRole: this.oldRole,
      newRole: this.newRole,
    };
  }
}

export class ConversationRoleChangedEventStrategy extends LinearVersionStrategy<ConversationRoleChangedEvent> {
  protected currentVersion = 1;
  protected upgradeHandlers: Record<number, (event: any) => any> = {};
  protected downgradeHandlers: Record<number, (event: any) => any> = {};
}

// ============================================================================
// USER_PROFILE_UPDATED EVENT (in context of conversations/messaging)
// ============================================================================

export class UserProfileUpdatedEvent extends VersionedDomainEvent {
  readonly version: number = 1;
  readonly eventType = EventType.USER_PROFILE_UPDATED;

  constructor(
    readonly userId: string,
    readonly updates: {
      name?: string;
      avatar?: string;
      status?: string;
      statusMessage?: string;
    },
    correlationId?: string,
  ) {
    super(userId, 'UserModule', 1, correlationId);
  }

  isValid(): boolean {
    return super.isValid() && !!this.userId && !!this.updates;
  }

  toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      userId: this.userId,
      updates: this.updates,
    };
  }
}

export class UserProfileUpdatedEventStrategy extends LinearVersionStrategy<UserProfileUpdatedEvent> {
  protected currentVersion = 1;

  protected upgradeHandlers: Record<number, (event: any) => any> = {
    // V1 → V2: Add profile metadata
    // 1: (event) => ({
    //   ...event,
    //   version: 2,
    //   updateTimestamp: new Date().toISOString(),
    // }),
  };

  protected downgradeHandlers: Record<number, (event: any) => any> = {
    // V2 → V1: Remove profile metadata
    // 2: (event) => {
    //   const { updateTimestamp, ...rest } = event;
    //   return { ...rest, version: 1 };
    // },
  };
}
