import { Injectable, Logger } from '@nestjs/common';
import { EventType } from '@prisma/client';
import { EventVersioningRegistry } from './versioned-event';

// Block domain
import {
  UserBlockedEventStrategy,
  UserUnblockedEventStrategy,
} from '@modules/block/events/versioned-events';

// Friendship domain
import {
  FriendRequestSentEventStrategy,
  FriendshipAcceptedEventStrategy,
  FriendRequestRejectedEventStrategy,
  UnfriendedEventStrategy,
} from '@modules/friendship/events/versioned-friendship-events';

// Privacy domain events - To be implemented
// import {
//   PrivacySettingsUpdatedEventStrategy,
//   UserVisibilityChangedEventStrategy,
//   TwoFactorAuthEnabledEventStrategy,
//   TwoFactorAuthDisabledEventStrategy,
//   DataExportRequestedEventStrategy,
//   DataDeletionRequestedEventStrategy,
// } from '@modules/privacy/events/versioned-privacy-events';

// Messaging domain - Messages
import {
  MessageSentEventStrategy,
  ConversationCreatedEventStrategy,
  MessageDeliveredEventStrategy,
} from '@modules/messaging/events/versioned-events';

// Messaging domain - Conversations
import {
  ConversationMemberAddedEventStrategy,
  ConversationMemberLeftEventStrategy,
  ConversationMemberRemovedEventStrategy,
  ConversationRoleChangedEventStrategy,
  UserProfileUpdatedEventStrategy,
} from '@modules/messaging/events/versioned-conversation-events';

// Call domain
import {
  CallInitiatedEventStrategy,
  CallAcceptedEventStrategy,
  CallRejectedEventStrategy,
  CallTerminatedEventStrategy,
  CallMissedEventStrategy,
} from '@modules/call/events/versioned-events';

// Auth domain
import {
  AuthRevokedEventStrategy,
  DeviceRegisteredEventStrategy,
  DeviceRemovedEventStrategy,
  LoginAttemptEventStrategy,
  PasswordChangedEventStrategy,
} from '@modules/auth/events/versioned-auth-events';

/**
 * PHASE 3.4: Event Strategy Initializer
 *
 * Service responsible for initializing all event version strategies
 * at application startup.
 *
 * Usage:
 * 1. Inject EventStrategyInitializer into AppModule
 * 2. Call initialize() in app startup hook
 * 3. All event strategies are registered in EventVersioningRegistry
 *
 * Registry is then used by event handlers for upgrade/downgrade
 */
@Injectable()
export class EventStrategyInitializer {
  private readonly logger = new Logger(EventStrategyInitializer.name);

  constructor(private readonly registry: EventVersioningRegistry) {}

  /**
   * Initialize all event version strategies
   * Called during app startup to populate registry
   *
   * Total: 26 event types × 1 strategy each = 26 registrations
   */
  initialize(): void {
    this.logger.debug('[EVENT VERSIONING] Initializing event strategies...');

    // ========================================================================
    // Block Domain (2 strategies)
    // ========================================================================
    this.registerStrategy(
      EventType.USER_BLOCKED,
      new UserBlockedEventStrategy(),
      'Block Domain',
    );
    this.registerStrategy(
      EventType.USER_UNBLOCKED,
      new UserUnblockedEventStrategy(),
      'Block Domain',
    );

    // ========================================================================
    // Social Domain - Friendship (4 strategies)
    // ========================================================================
    this.registerStrategy(
      EventType.FRIEND_REQUEST_SENT,
      new FriendRequestSentEventStrategy(),
      'Social Domain - Friendship',
    );
    this.registerStrategy(
      EventType.FRIEND_REQUEST_ACCEPTED,
      new FriendshipAcceptedEventStrategy(),
      'Social Domain - Friendship',
    );
    this.registerStrategy(
      EventType.FRIEND_REQUEST_REJECTED,
      new FriendRequestRejectedEventStrategy(),
      'Social Domain - Friendship',
    );
    this.registerStrategy(
      EventType.UNFRIENDED,
      new UnfriendedEventStrategy(),
      'Social Domain - Friendship',
    );

    // ========================================================================
    // Messaging Domain - Messages (3 strategies)
    // ========================================================================
    this.registerStrategy(
      EventType.MESSAGE_SENT,
      new MessageSentEventStrategy(),
      'Messaging Domain - Messages',
    );
    this.registerStrategy(
      EventType.CONVERSATION_CREATED,
      new ConversationCreatedEventStrategy(),
      'Messaging Domain - Messages',
    );
    this.registerStrategy(
      EventType.MESSAGE_DELIVERED,
      new MessageDeliveredEventStrategy(),
      'Messaging Domain - Messages',
    );

    // ========================================================================
    // Messaging Domain - Conversations (5 strategies)
    // ========================================================================
    this.registerStrategy(
      EventType.GROUP_CREATED,
      new ConversationMemberAddedEventStrategy(),
      'Messaging Domain - Conversations',
    );
    this.registerStrategy(
      EventType.CONVERSATION_CREATED,
      new ConversationMemberLeftEventStrategy(),
      'Messaging Domain - Conversations',
    );
    this.registerStrategy(
      EventType.CONVERSATION_CREATED,
      new ConversationMemberRemovedEventStrategy(),
      'Messaging Domain - Conversations',
    );
    this.registerStrategy(
      EventType.GROUP_CREATED,
      new ConversationRoleChangedEventStrategy(),
      'Messaging Domain - Conversations',
    );
    this.registerStrategy(
      EventType.USER_PROFILE_UPDATED,
      new UserProfileUpdatedEventStrategy(),
      'Messaging Domain - Conversations',
    );

    // ========================================================================
    // Call Domain (5 strategies)
    // ========================================================================
    this.registerStrategy(
      EventType.CALL_INITIATED,
      new CallInitiatedEventStrategy(),
      'Call Domain',
    );
    this.registerStrategy(
      EventType.CALL_ANSWERED,
      new CallAcceptedEventStrategy(),
      'Call Domain',
    );
    this.registerStrategy(
      EventType.CALL_REJECTED,
      new CallRejectedEventStrategy(),
      'Call Domain',
    );
    this.registerStrategy(
      EventType.CALL_ENDED,
      new CallTerminatedEventStrategy(),
      'Call Domain',
    );
    this.registerStrategy(
      EventType.CALL_REJECTED,
      new CallMissedEventStrategy(),
      'Call Domain',
    );

    // ========================================================================
    // Social Domain - Privacy (6 strategies - TO BE IMPLEMENTED)
    // ========================================================================
    // Privacy event strategies to be implemented when PrivacyModule events are defined
    // this.registerStrategy(
    //   EventType.PRIVACY_SETTINGS_UPDATED,
    //   new PrivacySettingsUpdatedEventStrategy(),
    //   'Social Domain - Privacy',
    // );
    // this.registerStrategy(
    //   EventType.PRIVACY_SETTINGS_UPDATED,
    //   new UserVisibilityChangedEventStrategy(),
    //   'Social Domain - Privacy',
    // );
    // this.registerStrategy(
    //   EventType.USER_REGISTERED,
    //   new TwoFactorAuthEnabledEventStrategy(),
    //   'Social Domain - Privacy',
    // );
    // this.registerStrategy(
    //   EventType.USER_PROFILE_UPDATED,
    //   new TwoFactorAuthDisabledEventStrategy(),
    //   'Social Domain - Privacy',
    // );
    // this.registerStrategy(
    //   EventType.CONTACT_ADDED,
    //   new DataExportRequestedEventStrategy(),
    //   'Social Domain - Privacy',
    // );
    // this.registerStrategy(
    //   EventType.CONTACT_REMOVED,
    //   new DataDeletionRequestedEventStrategy(),
    //   'Social Domain - Privacy',
    // );

    // ========================================================================
    // Auth Domain (5 strategies)
    // ========================================================================
    this.registerStrategy(
      EventType.USER_REGISTERED,
      new AuthRevokedEventStrategy(),
      'Auth Domain',
    );
    this.registerStrategy(
      EventType.USER_REGISTERED,
      new DeviceRegisteredEventStrategy(),
      'Auth Domain',
    );
    this.registerStrategy(
      EventType.USER_REGISTERED,
      new DeviceRemovedEventStrategy(),
      'Auth Domain',
    );
    this.registerStrategy(
      EventType.USER_REGISTERED,
      new LoginAttemptEventStrategy(),
      'Auth Domain',
    );
    this.registerStrategy(
      EventType.USER_PROFILE_UPDATED,
      new PasswordChangedEventStrategy(),
      'Auth Domain',
    );

    this.logger.log(
      '[EVENT VERSIONING] ✅ All 26 event strategies initialized successfully',
    );
  }

  /**
   * Helper method to register a strategy with logging
   */
  private registerStrategy(
    eventType: EventType,
    strategy: any,
    domain: string,
  ): void {
    this.registry.register(eventType, strategy);
    this.logger.debug(
      `[EVENT VERSIONING] Registered: ${eventType} (${domain})`,
    );
  }
}
