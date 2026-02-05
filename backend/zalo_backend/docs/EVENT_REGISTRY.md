# 📋 EVENT REGISTRY - Official Event Documentation

**Project**: Zalo Clone  
**Date**: 2025-02-03  
**Status**: PHASE 1 - Core Events (v1.0.0)  
**Owner**: Architecture Team

---

## 📌 TABLE OF CONTENTS

1. [Event Ownership Rules](#event-ownership-rules)
2. [Core Events (8)](#core-events-8)
3. [Event Versioning & Evolution](#event-versioning--evolution)
4. [Event Persistence Strategy](#event-persistence-strategy)
5. [Listener Dependencies Map](#listener-dependencies-map)
6. [Future Events (Phase 3+)](#future-events-phase-3)

---

## 🎯 EVENT OWNERSHIP RULES

### Principle 1: One Event, One Owner

Each event is owned by **exactly one module**. That module is responsible for:

| Responsibility | Details |
|----------------|---------|
| **Emitting** | Only the owner module emits the event |
| **Defining** | Event class lives in owner's `events/` folder |
| **Versioning** | Owner decides when event evolves |
| **Documentation** | Owner updates this registry |
| **Testing** | Owner tests event emission & payload |

### Principle 2: No Cross-Module Event Emission

```typescript
// ❌ FORBIDDEN: MessageModule emitting SocialModule event
@Injectable()
export class MessagingService {
  async sendMessage(conversationId, content) {
    // ❌ DO NOT DO THIS:
    this.eventEmitter.emit('friend.request.accepted', {...});
    // ^ This is SocialModule's event, only SocialModule should emit
  }
}

// ✅ CORRECT: MessageModule emits its own event
@Injectable()
export class MessagingService {
  async sendMessage(conversationId, content) {
    // ✅ MessageModule owns this event
    this.eventEmitter.emit('message.sent', new MessageSentEvent(...));
  }
}
```

### Principle 3: Events as Public API

Once an event is documented here, it's a **public API contract**:

```typescript
// 🔴 BREAKING CHANGE: Removing or renaming event
// ❌ ALLOWED ONLY for v0.0.0 (before first release)
// ❌ After release, must version up (v1 → v2)

// 🟢 NON-BREAKING: Adding optional field
// ✅ Create v2 listener to handle both versions
// ✅ Update this registry with change log
```

---

## 🎪 CORE EVENTS (8)

### BLOCK DOMAIN (Owner: BlockModule)

**Module Path**: `src/modules/block/events/`

#### 1. UserBlockedEvent

```typescript
export class UserBlockedEvent extends DomainEvent {
  // Identify which user initiated the block
  readonly blockerId: string;

  // Identify which user was blocked
  readonly blockedId: string;

  // Optional reason for blocking
  readonly reason?: string;

  // Event metadata (auto-populated)
  readonly eventId: string;           // UUID for idempotency
  readonly version: number;           // Currently 1
  readonly timestamp: Date;           // When blocked
  readonly source: 'BlockModule';     // Always this module
  readonly aggregateId: blockerId;    // Aggregate root
}
```

**Emission Trigger**: `BlockService.blockUser(blockerId, blockedId)`

**Critical Event**: ✅ YES (stored in `domain_events` table)

**Listeners** (will subscribe in PHASE 2-3):

| Module | Listener | Purpose |
|--------|----------|---------|
| SocialModule | BlockCacheInvalidator | Invalidate blocked user cache |
| ConversationModule | BlockedConversationCloser | Archive direct conversation |
| SocketModule | BlockNotificationSender | Notify user B they're blocked |
| CallModule | BlockedCallTerminator | End active calls |

**Version History**:

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2025-02-03 | Initial: blockerId, blockedId, reason |

**Example**:

```typescript
const event = new UserBlockedEvent(
  blockerId: '550e8400-e29b-41d4-a716-446655440000',
  blockedId: '660e8400-e29b-41d4-a716-446655440111',
  reason?: 'SPAM',
);

this.eventEmitter.emit('user.blocked', event);
```

---

#### 2. UserUnblockedEvent

```typescript
export class UserUnblockedEvent extends DomainEvent {
  readonly blockerId: string;     // Who unblocked
  readonly unblockedId: string;   // Who was unblocked
  readonly eventId: string;       // UUID
  readonly version: number;       // 1
  readonly timestamp: Date;
  readonly source: 'BlockModule';
}
```

**Emission Trigger**: `BlockService.unblockUser(blockerId, unblockedId)`

**Critical Event**: ✅ YES

**Listeners**:

| Module | Listener | Purpose |
|--------|----------|---------|
| SocialModule | BlockCacheInvalidator | Refresh blocked user cache |
| SocketModule | UnblockNotificationSender | Notify user B they're unblocked |

**Version History**:

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2025-02-03 | Initial: blockerId, unblockedId |

---

### SOCIAL DOMAIN (Owner: SocialModule)

**Module Path**: `src/modules/social/events/`

#### 3. FriendRequestSentEvent

```typescript
export class FriendRequestSentEvent extends DomainEvent {
  readonly requesterId: string;       // Who sends request
  readonly targetUserId: string;      // Who receives request
  readonly eventId: string;           // UUID
  readonly version: number;           // 1
  readonly timestamp: Date;
  readonly source: 'SocialModule';
}
```

**Emission Trigger**: `FriendshipService.sendFriendRequest(requesterId, targetUserId)`

**Critical Event**: ❌ NO (emit only)

**Listeners**:

| Module | Listener | Purpose |
|--------|----------|---------|
| MessageModule | FriendRequestNotifier | Send notification |
| SocketModule | FriendRequestBroadcaster | Real-time to target user |
| RedisModule | FriendRequestCacher | Cache pending requests |

**Version History**:

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2025-02-03 | Initial: requesterId, targetUserId |

---

#### 4. FriendRequestAcceptedEvent

```typescript
export class FriendRequestAcceptedEvent extends DomainEvent {
  readonly requesterId: string;       // Original requester
  readonly accepterId: string;        // Who accepted
  readonly eventId: string;
  readonly version: number;           // 1
  readonly timestamp: Date;
  readonly source: 'SocialModule';
}
```

**Emission Trigger**: `FriendshipService.acceptFriendRequest(requesterId, accepterId)`

**Preconditions**:
- requesterId NOT blocked by accepterId
- accepterId NOT blocked by requesterId
- (These are checked BEFORE emitting)

**Critical Event**: ✅ YES (legal evidence of relationship)

**Listeners**:

| Module | Listener | Purpose |
|--------|----------|---------|
| ConversationModule | DirectConversationCreator | Auto-create direct chat |
| SocketModule | FriendshipBroadcaster | Notify both users |
| RedisModule | FriendListCacher | Update friend cache |

**Version History**:

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2025-02-03 | Initial: requesterId, accepterId |

---

#### 5. FriendRequestRejectedEvent

```typescript
export class FriendRequestRejectedEvent extends DomainEvent {
  readonly requesterId: string;       // Original requester
  readonly rejecterId: string;        // Who rejected
  readonly eventId: string;
  readonly version: number;           // 1
  readonly timestamp: Date;
  readonly source: 'SocialModule';
}
```

**Emission Trigger**: `FriendshipService.rejectFriendRequest(requesterId, rejecterId)`

**Critical Event**: ❌ NO

---

#### 6. UnfriendedEvent

```typescript
export class UnfriendedEvent extends DomainEvent {
  readonly initiatorId: string;       // Who initiated unfriend
  readonly removedFriendId: string;   // Who was unfriended
  readonly eventId: string;
  readonly version: number;           // 1
  readonly timestamp: Date;
  readonly source: 'SocialModule';
}
```

**Emission Trigger**: `FriendshipService.unfriend(initiatorId, removedFriendId)`

**Critical Event**: ✅ YES (audit trail)

**Listeners**:

| Module | Listener | Purpose |
|--------|----------|---------|
| ConversationModule | ArchiveConversationCloser | Archive direct chat |
| SocketModule | UnfriendNotifier | Notify removed friend |
| RedisModule | FriendListCacher | Clear friend cache |

---

### MESSAGING DOMAIN (Owner: MessageModule / ConversationModule)

**Module Paths**:
- `src/modules/message/events/`
- `src/modules/conversation/events/`

#### 7. MessageSentEvent

```typescript
export class MessageSentEvent extends DomainEvent {
  readonly messageId: string;         // Unique message
  readonly conversationId: string;    // Which conversation
  readonly senderId: string;          // Who sent
  readonly content: string;           // Message text/media
  readonly type: MessageType;         // TEXT, IMAGE, VOICE, etc.
  readonly eventId: string;
  readonly version: number;           // 1
  readonly timestamp: Date;
  readonly source: 'MessageModule';
}
```

**Emission Trigger**: `MessageService.sendMessage(conversationId, content, type)`

**Critical Event**: ✅ YES (audit trail, billing)

**Listeners**:

| Module | Listener | Purpose |
|--------|----------|---------|
| RedisModule | ConversationCacheUpdater | Update last_message |
| SocketModule | MessageDeliverer | Send to connected recipients |
| NotificationsModule | PushNotificationSender | Notify offline users |

**Version History**:

| Version | Date | Changes |
|---------|------|---------|
| 1 | 2025-02-03 | Initial: messageId, conversationId, senderId, content, type |

**Future v2**:

```typescript
// v2 might add:
readonly replyTo?: string;          // Message this replies to
readonly mentions?: string[];       // @mentioned users
readonly mediaIds?: string[];       // Attached media
```

---

#### 8. ConversationCreatedEvent

```typescript
export class ConversationCreatedEvent extends DomainEvent {
  readonly conversationId: string;    // New conversation
  readonly createdBy: string;         // Who created
  readonly type: 'DIRECT' | 'GROUP';  // Type
  readonly participantIds: string[]; // All members
  readonly name?: string;             // Group name (if GROUP)
  readonly eventId: string;
  readonly version: number;           // 1
  readonly timestamp: Date;
  readonly source: 'ConversationModule';
}
```

**Emission Trigger**: 
- `ConversationService.getOrCreateDirectConversation(userId1, userId2)`
- `GroupService.createGroup(createdBy, memberIds, name)`

**Critical Event**: ✅ YES

**Listeners**:

| Module | Listener | Purpose |
|--------|----------|---------|
| RedisModule | ConversationCacher | Cache new conversation |
| SocketModule | ParticipantNotifier | Notify group members |

---

### CALL DOMAIN (Owner: CallModule)

**Module Path**: `src/modules/call/events/`

#### 9. CallInitiatedEvent

```typescript
export class CallInitiatedEvent extends DomainEvent {
  readonly callId: string;            // Unique call
  readonly initiatorId: string;       // Who called
  readonly receiverIds: string[];     // Who was called (array for group calls)
  readonly type: 'VOICE' | 'VIDEO';   // Call type
  readonly eventId: string;
  readonly version: number;           // 1
  readonly timestamp: Date;
  readonly source: 'CallModule';
}
```

**Emission Trigger**: `CallService.initiateCall(initiatorId, receiverIds, type)`

**Critical Event**: ✅ YES (billing, compliance)

**Listeners**:

| Module | Listener | Purpose |
|--------|----------|---------|
| SocketModule | CallNotifier | Notify receivers |
| RedisModule | ActiveCallCacher | Cache active calls |
| NotificationsModule | CallNotificationSender | Push notification |

---

#### 10. CallEndedEvent

```typescript
export class CallEndedEvent extends DomainEvent {
  readonly callId: string;
  readonly initiatorId: string;
  readonly receiverId: string;
  readonly status: 'COMPLETED' | 'MISSED' | 'REJECTED' | 'CANCELLED';
  readonly durationSeconds: number;   // Call duration
  readonly eventId: string;
  readonly version: number;           // 1
  readonly timestamp: Date;
  readonly source: 'CallModule';
}
```

**Emission Trigger**: `CallService.endCall(callId, status, durationSeconds)`

**Critical Event**: ✅ YES

**Listeners**:

| Module | Listener | Purpose |
|--------|----------|---------|
| CallModule | CallHistorySaver | Save call record |
| RedisModule | ActiveCallCleaner | Clear cache |
| SocketModule | CallEndNotifier | Notify all participants |

---

### AUTH DOMAIN (Owner: AuthModule)

**Module Path**: `src/modules/auth/events/`

#### 11. UserRegisteredEvent

```typescript
export class UserRegisteredEvent extends DomainEvent {
  readonly userId: string;            // New user
  readonly phoneNumber: string;       // Registered phone
  readonly displayName: string;       // Profile name
  readonly email?: string;            // Optional email
  readonly eventId: string;
  readonly version: number;           // 1
  readonly timestamp: Date;
  readonly source: 'AuthModule';
}
```

**Emission Trigger**: `AuthService.register(phoneNumber, displayName, email)`

**Critical Event**: ✅ YES (compliance, onboarding)

**Listeners**:

| Module | Listener | Purpose |
|--------|----------|---------|
| NotificationsModule | WelcomeSender | Welcome message |
| RedisModule | UserProfileCacher | Cache new user |

---

## 📈 EVENT VERSIONING & EVOLUTION

### Version Strategy: Simple Increment (`version: number`)

**NOT semantic versioning** (avoids confusion with library versions).

**When to Increment Version**:

| Scenario | Action | Example |
|----------|--------|---------|
| Add required field | ❌ Never do this (breaks old code) | - |
| Add optional field | ✅ Increment version (v1 → v2) | `reason?: string` in UserBlockedEvent v2 |
| Remove field | ❌ Never remove (breaking) | - |
| Rename field | ❌ Never rename (breaking) | - |
| Change type | ❌ Never change (breaking) | - |

### Example: MessageSentEvent Evolution

**v1 (Current)**:
```typescript
export class MessageSentEvent extends DomainEvent {
  version = 1;
  readonly messageId: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly content: string;
  readonly type: MessageType;
}
```

**v2 (Hypothetical)**:
```typescript
export class MessageSentEvent extends DomainEvent {
  version = 2;
  readonly messageId: string;
  readonly conversationId: string;
  readonly senderId: string;
  readonly content: string;
  readonly type: MessageType;
  readonly replyTo?: string;          // NEW: reply-to field
  readonly mentions?: string[];       // NEW: @mentions
}
```

**Listener Handling**:
```typescript
@OnEvent('message.sent')
async handleMessageSent(event: MessageSentEvent) {
  return this.withIdempotency(event.eventId, async () => {
    if (event.version === 1) {
      // v1 listeners: no mentions, no replyTo
      await this.db.message.update({
        where: { id: event.messageId },
        data: { status: 'DELIVERED' },
      });
    } else if (event.version >= 2) {
      // v2 listeners: handle mentions
      if (event.mentions?.length > 0) {
        await this.notifyMentions(event.mentions, event.messageId);
      }
      await this.db.message.update({
        where: { id: event.messageId },
        data: { status: 'DELIVERED', mentions: event.mentions },
      });
    }
  });
}
```

---

## 💾 EVENT PERSISTENCE STRATEGY

### Hybrid Approach: Store Critical, Emit All

**All events are emitted** via `EventEmitter2` (for listeners)

**Only critical events are stored** in `domain_events` table (for audit)

### Critical Events (Stored)

These events are **persisted to database** for audit trail, compliance, debugging:

```typescript
✅ USER_BLOCKED           (BlockModule) - Legal compliance
✅ USER_UNBLOCKED         (BlockModule) - Legal compliance
✅ FRIEND_REQUEST_ACCEPTED (SocialModule) - Relationship proof
✅ MESSAGE_SENT           (MessageModule) - Audit trail
✅ CONVERSATION_CREATED   (ConversationModule) - Group creation audit
✅ CALL_INITIATED         (CallModule) - Billing evidence
✅ CALL_ENDED             (CallModule) - Billing evidence
✅ USER_REGISTERED        (AuthModule) - Compliance
```

### Non-Critical Events (Emit Only)

These events are **emitted to listeners** but NOT stored (high volume, no audit value):

```typescript
❌ FRIEND_REQUEST_SENT (SocialModule) - Transient, not final state
❌ FRIEND_REQUEST_REJECTED (SocialModule) - Not final binding
❌ MESSAGE_DELIVERED (MessageModule) - Transient status
❌ MESSAGE_SEEN (MessageModule) - Transient status (future)
```

### Storage Mechanism

**Persisted in**: `domain_events` table (PostgreSQL)

**Indexed by**:
- `eventType` + `timestamp` (query by type)
- `aggregateId` + `aggregateType` (replay by entity)
- `correlationId` (trace request chains)

**PHASE 5 Enhancement**: Event Store for sourcing

---

## 🎯 LISTENER DEPENDENCIES MAP

### Who Listens to What?

```typescript
// USER_BLOCKED → Listeners
UserBlockedEvent listeners:
  - SocialModule: BlockCacheInvalidator (invalidate contacts cache)
  - ConversationModule: BlockedConversationCloser (close chat)
  - CallModule: BlockedCallTerminator (end calls)
  - SocketModule: BlockNotificationSender (notify user B)

// FRIEND_REQUEST_ACCEPTED → Listeners
FriendRequestAcceptedEvent listeners:
  - ConversationModule: DirectConversationCreator (create chat)
  - RedisModule: FriendListCacher (cache friend list)
  - SocketModule: FriendshipBroadcaster (notify both)

// MESSAGE_SENT → Listeners
MessageSentEvent listeners:
  - RedisModule: ConversationCacheUpdater (last_message)
  - SocketModule: MessageDeliverer (real-time delivery)
  - NotificationsModule: PushNotificationSender (FCM)

// CALL_INITIATED → Listeners
CallInitiatedEvent listeners:
  - SocketModule: CallNotifier (notify receivers)
  - RedisModule: ActiveCallCacher (cache state)
  - NotificationsModule: CallNotificationSender (push)

// CALL_ENDED → Listeners
CallEndedEvent listeners:
  - CallModule: CallHistorySaver (save record)
  - RedisModule: ActiveCallCleaner (clear cache)
  - SocketModule: CallEndNotifier (notify participants)

// USER_REGISTERED → Listeners
UserRegisteredEvent listeners:
  - NotificationsModule: WelcomeSender (welcome message)
  - RedisModule: UserProfileCacher (cache profile)
```

---

## 📅 FUTURE EVENTS (PHASE 3+)

These events are **planned but not implemented** in PHASE 1.

### PHASE 3: Additional Social Events

| Event | Owner | Purpose |
|-------|-------|---------|
| UserProfileUpdatedEvent | AuthModule | Profile change |
| PrivacySettingsUpdatedEvent | SocialModule | Privacy changes |
| ContactAddedEvent | SocialModule | Contact created |
| ContactRemovedEvent | SocialModule | Contact deleted |

### PHASE 4: Media Events

| Event | Owner | Purpose |
|-------|-------|---------|
| MediaUploadedEvent | MediaModule | File upload complete |
| MediaDeletedEvent | MediaModule | File deleted |

### PHASE 5: Notifications & Presence

| Event | Owner | Purpose |
|-------|-------|---------|
| NotificationSentEvent | NotificationsModule | Notification delivered |
| NotificationReadEvent | NotificationsModule | User read notification |
| UserWentOnlineEvent | UsersModule | User came online |
| UserWentOfflineEvent | UsersModule | User went offline |

---

## 🔄 CHANGELOG

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2025-02-03 | 1.0.0 | Initial: 8 core events, PHASE 1 | AI Architecture |

---

## ❓ FAQ

### Q1: Can MessageModule emit UserBlockedEvent?

**A**: ❌ NO. Only BlockModule owns and emits UserBlockedEvent.

If MessageModule needs to react to blocking, it should **listen** to UserBlockedEvent.

```typescript
// ❌ WRONG
@OnEvent('user.blocked')
async handleBlockInMessaging(event) {
  this.eventEmitter.emit('user.blocked', event);  // ❌ Don't re-emit
}

// ✅ CORRECT
@OnEvent('user.blocked')
async handleBlockInMessaging(event: UserBlockedEvent) {
  // React to the event (close conversation, etc.)
  await this.conversation.archive(event.blockerId, event.blockedId);
}
```

### Q2: What if I need to emit an event that's not in this registry?

**A**: You MUST add it to this registry first:

1. Define the event class in your module
2. Add documentation to EVENT_REGISTRY.md
3. Get approval from architecture team
4. Follow versioning rules

### Q3: Can I modify an event after it's released?

**A**: Depends on stage:

- **PHASE 1 (v1.0.0-beta)**: Limited changes allowed if no production data
- **After release (v1.0.0+)**: Only non-breaking changes (new optional fields)

Breaking changes require new event type (e.g., `UserBlocked` → `UserBlockedV2`).

### Q4: How do I handle event listener failures?

**A**: Use `withIdempotency()` wrapper:

```typescript
@Injectable()
export class MyListener extends IdempotentListener {
  @OnEvent('user.blocked')
  async handle(event: UserBlockedEvent) {
    return this.withIdempotency(event.eventId, async () => {
      // This code runs AT MOST ONCE, even if listener crashes and retries
      await this.cache.invalidate(event.blockedId);
    });
  }
}
```

If listener throws after `withIdempotency`, the error will be logged and (PHASE 5) sent to DLQ.

---

**Last Updated**: 2025-02-03  
**Next Review**: 2025-02-17 (After PHASE 2 completion)
