# Event Catalog

> **Scope:** In-process `EventEmitter2` domain events only (production).
> Bull/SQS media-worker jobs are **not** included — they run in a separate
> worker process (see `docker-compose.workers.yml`) and are not deployed in the
> current single-instance production setup.
>
> **Last updated:** 2026-03-17 — updated after Phase 4 Stage 7.6/7.7
> review. See `EVENT-CATALOG-REVIEW-REPORT.md` for full audit details.

---

## How events flow

```
Service / Gateway
  └─► EventPublisher.publish(Event)          ← structured events (persisted to domain_events table)
        └─► eventEmitter.emit(eventName, payload)
              └─► @OnEvent(eventName) listeners in other modules

  └─► eventEmitter.emit(eventName, payload)  ← lightweight events (not persisted)
        └─► @OnEvent(eventName) listeners
```

* **EventPublisher** (`shared/events/event-publisher.service.ts`) — central hub
  that validates, persists to `domain_events` table, adds correlation-id, and
  finally calls `eventEmitter.emit()`. Most business events go through it.
* **Direct emit** — some low-level or internal events (`user.logged_out`,
  Socket lifecycle, media, reminder) bypass the publisher and call
  `eventEmitter.emit()` directly.
* **Internal command port call** — cross-domain callers request conversation
  system-message broadcast via `CONVERSATION_SYSTEM_MESSAGE_PORT`.
  The owner-side adapter delegates to `SystemMessageBroadcasterService`.

---

## Legend

| Symbol | Meaning |
|--------|---------|
| 📤 | Emitted via **EventPublisher** (persisted) |
| ⚡ | Emitted via direct `eventEmitter.emit()` (not persisted) |
| 🔇 | Listener exists but **no emitter found** in current codebase (future-ready / dead code) |

---

## 1 — Identity & Auth Events

| Event Name | Type | Emitter (Module → Service) | Listener (Module → Class) | Action |
|---|---|---|---|---|
| `user.registered` | 📤 | User → `UsersService` | Admin → `StatsCounterListener` | Increment `stats:users:total` Redis counter |
| | | | Privacy → `PrivacyUserRegisteredListener` | Create default `PrivacySettings` row for new user |
| `user.profile.updated` | 📤 | User → `UsersService` | Conversation → `ConversationEventHandler` | Stub — idempotency only (`ConversationMember` không có cột `displayName`; display name resolved tại query time qua `DisplayNameResolver`) |
| | | | Search → `SearchEventListener` | Invalidate contact/user search cache |
| | | | Common → `DomainEventPersistenceListener` | Persist to `domain_events` audit table |
| `user.logged_out` | ⚡ | Auth → `AuthService` | *(no active listener)* | — |
| `auth.security.revoked` | ⚡ | Admin → `AdminUsersService` | Auth → `SecurityEventHandler` | Disconnect all sockets, invalidate tokens, force logout |

---

## 0 — Internal Typed Contract Events (Phase 4 baseline)

Source of truth for typed internal transport/search events:
- `backend/zalo_backend/src/common/contracts/events/event-names.ts`
- `backend/zalo_backend/src/common/contracts/events/event-contracts.ts`

Currently typed in contract map:
- `socket.outbound`
- `user.socket.connected`
- `user.socket.disconnected`
- `search.internal.newMatch`
- `search.internal.resultRemoved`

Notes:
- This is a scoped subset introduced in Phase 4 Stage 7.1.
- Domain-event catalog entries below remain the runtime reference for broader
  business events.

---

## 2 — Social Graph Events (Friendship)

| Event Name | Type | Emitter (Module → Service) | Listener (Module → Class) | Action |
|---|---|---|---|---|
| `friendship.request.sent` | 📤 | Friendship → `FriendshipService` | Socket → `FriendshipNotificationListener` | Emit `friendship:requestReceived` socket event to target |
| | | | Friendship → `FriendRequestSentListener` | Invalidate recipient's pending-requests cache |
| | | | Notifications → `FriendshipPushNotificationListener` | Send FCM push to target user |
| | | | Common → `DomainEventPersistenceListener` | Persist to `domain_events` audit table |
| `friendship.accepted` | 📤 | Friendship → `FriendshipService` | Socket → `FriendshipNotificationListener` | Emit `friendship:requestAccepted` socket event to requester |
| | | | Friendship → `FriendshipAcceptedListener` | Invalidate friend-lists + pending-requests cache |
| | | | Conversation → `FriendshipConversationListener` | Auto-create DIRECT conversation between new friends |
| | | | Privacy → `PrivacyFriendshipListener` | Invalidate permission caches for both users |
| | | | Search → `SearchEventListener` | Invalidate contact search cache |
| | | | Notifications → `FriendshipPushNotificationListener` | Send FCM push to requester |
| | | | Common → `DomainEventPersistenceListener` | Persist to `domain_events` audit table |
| `friendship.request.declined` | 📤 | Friendship → `FriendshipService` | Socket → `FriendshipNotificationListener` | Emit `friendship:requestDeclined` socket event |
| | | | Friendship → `FriendRequestDeclinedListener` | Invalidate requester's pending-requests cache |
| | | | Common → `DomainEventPersistenceListener` | Persist to `domain_events` audit table |
| `friendship.request.cancelled` | 📤 | Friendship → `FriendshipService` | Socket → `FriendshipNotificationListener` | Emit `friendship:requestCancelled` socket event |
| | | | Friendship → `FriendRequestRemovedListener` | Invalidate pending-requests + friend caches |
| | | | Common → `DomainEventPersistenceListener` | Persist to `domain_events` audit table |
| `friendship.unfriended` | 📤 | Friendship → `FriendshipService` | Socket → `FriendshipNotificationListener` | Emit `friendship:unfriended` socket event |
| | | | Friendship → `UnfriendedListener` | Invalidate friend-lists + call-history caches (distributed lock) |
| | | | Privacy → `PrivacyFriendshipListener` | Invalidate permission caches for both users |
| | | | Search → `SearchEventListener` | Invalidate contact search cache |
| | | | Common → `DomainEventPersistenceListener` | Persist to `domain_events` audit table |

---

## 3 — Block & Privacy Events

| Event Name | Type | Emitter (Module → Service) | Listener (Module → Class) | Action |
|---|---|---|---|---|
| `user.blocked` | 📤 | Block → `BlockService` | Block → `BlockCacheListener` | Invalidate block-status + permission caches |
| | | | Friendship → `FriendshipBlockListener` | Soft-delete friendship (set `deletedAt`), invalidate caches |
| | | | Message → `MessagingBlockListener` | Soft-delete (archive) DIRECT conversation |
| | | | Call → `CallBlockListener` | Terminate active calls between blocked users |
| | | | Privacy → `PrivacyBlockListener` | Invalidate permission caches for user pair |
| | | | Search → `SearchEventListener` | Invalidate contact search cache for both users |
| | | | Common → `DomainEventPersistenceListener` | Persist to `domain_events` audit table |
| `user.unblocked` | 📤 | Block → `BlockService` | Block → `BlockCacheListener` | Invalidate block-status + permission caches |
| | | | Friendship → `FriendshipBlockListener` | No-op (friendship stays deleted until re-added) |
| | | | Message → `MessagingBlockListener` | Restore (unhide) DIRECT conversation |
| | | | Call → `CallBlockListener` | No-op (log only; users must re-initiate calls) |
| | | | Privacy → `PrivacyBlockListener` | Invalidate permission caches for user pair |
| | | | Search → `SearchEventListener` | Invalidate contact search cache for both users |
| | | | Common → `DomainEventPersistenceListener` | Persist to `domain_events` audit table |
| `privacy.updated` | 📤 | Privacy → `PrivacyService` | Privacy → `PrivacyCacheListener` | Invalidate all privacy settings + permission caches |
| | | | Search → `SearchEventListener` | Invalidate contact search cache |
| | | | Common → `DomainEventPersistenceListener` | Persist to `domain_events` audit table |
| `cache.invalidate` | ⚡ | *(internal)* | Block → `CacheInvalidationListener` | Delete specified Redis cache keys (MVP single-instance) |

---

## 4 — Contact Events

| Event Name | Type | Emitter (Module → Service) | Listener (Module → Class) | Action |
|---|---|---|---|---|
| `contact.alias.updated` | 📤 | Contact → `ContactService` | Socket → `ContactNotificationListener` | Emit `contact:aliasUpdated` socket event to owner |
| | | | Contact → `ContactCacheListener` | Invalidate name-resolution cache |
| | | | Search → `SearchEventListener` | Invalidate contact search cache |
| `contact.removed` | 📤 | Contact → `ContactService` | Contact → `ContactCacheListener` | Invalidate name-resolution cache |
| `contacts.synced` | 📤 | Contact → `ContactService` | Contact → `ContactCacheListener` | Log sync metrics (analytics) |

---

## 5 — Messaging Events

| Event Name | Type | Emitter (Module → Service) | Listener (Module → Class) | Action |
|---|---|---|---|---|
| `message.sent` | 📤 | Message → `MessageService` | Conversation → `ConversationEventHandler` | Update `conversation.lastMessageAt` timestamp |
| | | | Message → `MessageBroadcasterListener` | Process broadcast (idempotent) |
| | | | Search → `SearchEventListener` | Invalidate search cache, notify active subscribers of new match |
| | | | Notifications → `MessageNotificationListener` | Batch offline recipients → FCM push (respects mute/archive) |
| | | | Admin → `StatsCounterListener` | Increment `stats:messages:daily:{YYYYMMDD}` Redis counter |
| `message.deleted` | 📤 | Message → `MessageService` | Search → `SearchEventListener` | Invalidate search cache, emit `search:resultRemoved` to active subscribers |
| | | | Common → `DomainEventPersistenceListener` | Persist to `domain_events` audit table |

> **Removed:** `system-message.broadcast` event name.
> Cross-domain callers now use `CONVERSATION_SYSTEM_MESSAGE_PORT` command port.
> Owner-side implementation delegates to `SystemMessageBroadcasterService`.

---

## 6 — Conversation Events

| Event Name | Type | Emitter (Module → Service) | Listener (Module → Class) | Action |
|---|---|---|---|---|
| `conversation.created` | 📤 | Conversation → `GroupService` | Conversation → `ConversationEventHandler` | Create GROUP system message, broadcast to members |
| | | | Message → `MessageBroadcasterListener` | Process broadcast (idempotent) |
| | | | Notifications → `GroupNotificationListener` | Send FCM push to all members except creator |
| `conversation.member.added` | 📤 | Conversation → `GroupService` / `GroupJoinService` | Conversation → `ConversationEventHandler` | Create system message, broadcast member-added notification |
| | | | Notifications → `GroupNotificationListener` | Send FCM push to new + existing members |
| | | | Notifications → `ConversationMemberCacheService` | Invalidate member-state cache |
| | | | Search → `SearchEventListener` | Invalidate conversation-membership cache |
| `conversation.member.left` | 📤 | Conversation → `GroupService` | Conversation → `ConversationEventHandler` | Create system message, broadcast member-left notification |
| | | | Notifications → `GroupNotificationListener` | Send FCM push to kicked/remaining members |
| | | | Notifications → `ConversationMemberCacheService` | Invalidate member-state cache |
| | | | Search → `SearchEventListener` | Invalidate conversation-membership cache |
| `conversation.member.promoted` | 📤 | Conversation → `GroupService` | Conversation → `ConversationEventHandler` | Create system message, broadcast role change |
| | | | Notifications → `GroupNotificationListener` | Send FCM push to promoted member |
| `conversation.member.demoted` | 📤 | Conversation → `GroupService` | Conversation → `ConversationEventHandler` | Stub — idempotency only (system message đã được tạo bởi `conversation.member.promoted` handler dưới dạng ADMIN_TRANSFERRED) |
| | | | Notifications → `GroupNotificationListener` | Send FCM push to demoted member |
| `conversation.dissolved` | 📤 | Conversation → `GroupService` | Conversation → `ConversationEventHandler` | Idempotency only (system message GROUP_DISSOLVED đã được tạo bởi `ConversationRealtimeService.dissolveGroup()` trước khi soft-delete; offline members được enqueue vào Redis offline queue) |
| `conversation.muted` | ⚡ | Conversation → `ConversationService` | Conversation → `ConversationGateway` | Emit socket notification for cross-device sync |
| | | | Notifications → `ConversationMemberCacheService` | Invalidate member-state cache (`isMuted` flag) |
| `conversation.archived` | ⚡ | Conversation → `ConversationService` | Conversation → `ConversationGateway` | Emit socket notification for cross-device sync |
| | | | Notifications → `ConversationMemberCacheService` | Invalidate member-state cache (`isArchived` flag) |
| `conversation.updated` | 📤 | Conversation → `GroupService` | Search → `SearchEventListener` | Invalidate conversation search cache |
| | | | Common → `DomainEventPersistenceListener` | Persist to `domain_events` audit table |

---

## 7 — Call Events

| Event Name | Type | Emitter (Module → Service) | Listener (Module → Class) | Action |
|---|---|---|---|---|
| `call.ended` | 📤 | Call → `CallHistoryService` | Message → `CallMessageListener` | Create SYSTEM message in conversation for call log + broadcast via `CONVERSATION_SYSTEM_MESSAGE_PORT` |
| | | | Conversation → `CallConversationListener` | Update `conversation.lastMessageAt` after call ends |
| | | | Notifications → `CallNotificationListener` | Send FCM push for missed/no-answer calls (per-receiver, group-aware) |
| | | | Socket → `CallEndedSocketListener` | Emit `call:ended` socket event to all participants |
| | | | Admin → `StatsCounterListener` | Increment `stats:calls:daily:{YYYYMMDD}` Redis counter |
| | | | Common → `DomainEventPersistenceListener` | Persist to `domain_events` audit table |
| `call.push_notification_needed` | ⚡ | Call → `CallSignalingGateway` | Notifications → `CallNotificationListener` | Send FCM push for incoming call (callee offline / no ack) |

> **Removed (R1 — Choreography refactor):** `call.log_message_needed`,
> `call.conversation_update_needed`, `call.missed_notification_needed` —
> intermediate events emitted by the deleted `CallEventHandler` middleman.
> All 3 listeners now consume `call.ended` directly with per-listener
> idempotency.

---

## 8 — Media Events

| Event Name | Type | Emitter (Module → Service) | Listener (Module → Class) | Action |
|---|---|---|---|---|
| `media.uploaded` | ⚡ | Media → `MediaUploadService` | Admin → `StatsCounterListener` | Increment `stats:media:daily:{YYYYMMDD}` Redis counter |
| | | | Search → `SearchEventListener` | Invalidate media search cache |
| `media.processed` | ⚡ | Media → `MediaUploadService` / `MediaConsumer`* / `SqsMediaConsumer`* | *(no active listener)* | — |
| `media.failed` | ⚡ | Media → `MediaConsumer`* / `SqsMediaConsumer`* | *(no active listener)* | — |
| `media.deleted` | ⚡ | Media → `MediaUploadService` | Search → `SearchEventListener` | Invalidate media search cache |

> \* `MediaConsumer` and `SqsMediaConsumer` run in the **worker process** — not
> active in current single-instance production. Events emitted from workers
> would only fire if the worker overlay is deployed.

---

## 9 — Reminder Events

| Event Name | Type | Emitter (Module → Service) | Listener (Module → Class) | Action |
|---|---|---|---|---|
| `reminder.created` | ⚡ | Reminder → `ReminderService` | Reminder → `ReminderSystemMessageListener` | Create SYSTEM message in conversation + broadcast via `CONVERSATION_SYSTEM_MESSAGE_PORT` |
| `reminder.triggered` | ⚡ | Reminder → `ReminderSchedulerService` | Reminder → `ReminderSocketListener` | Emit `socket.outbound` reminder notification (target `userId`/`userIds`) |
| `reminder.deleted` | ⚡ | Reminder → `ReminderService` | *(no active listener)* | — |

---

## 10 — Socket Lifecycle Events

| Event Name | Type | Emitter (Module → Service) | Listener (Module → Class) | Action |
|---|---|---|---|---|
| `user.socket.connected` | ⚡ | Socket → `SocketGateway` | Message → `MessageGateway` | Sync offline messages, subscribe to receipt channel |
| | | | Message → `MessagingUserPresenceListener` | Log presence change (idempotent) |
| | | | Call → `CallSignalingGateway` | Cancel disconnect grace timer, re-join call room, re-emit `call:incoming` |
| `user.socket.disconnected` | ⚡ | Socket → `SocketGateway` | Message → `MessageGateway` | Clean up message subscriptions |
| | | | Message → `MessagingUserPresenceListener` | Log presence change (idempotent) |
| | | | Call → `CallSignalingGateway` | Start disconnect grace period before ending call |
| | | | Search → `SearchGateway` | Clean up active search subscriptions |

---

## 11 — Search Internal Events

| Event Name | Type | Emitter (Module → Service) | Listener (Module → Class) | Action |
|---|---|---|---|---|
| `search.internal.newMatch` | ⚡ | Search → `RealTimeSearchService` | Search → `SearchGateway` | Push `search:newMatch` socket event to subscribed clients |
| `search.internal.resultRemoved` | ⚡ | Search → `SearchEventListener` | Search → `SearchGateway` | Push `search:resultRemoved` socket event to subscribed clients |

---

## 12 — Listeners Without Active Emitters 🔇

These `@OnEvent()` handlers exist in the codebase but **no corresponding
`.emit()` call** was found. They are either future-ready hooks or
awaiting feature implementation.

| Event Name | Listener (Module → Class) | Intended Action | Notes |
|---|---|---|---|
| `message.updated` | Search → `SearchEventListener` | Invalidate search cache for edited message | `// TODO(edit-message)` — activate when `editMessage()` is implemented |
| `message.edited` | Search → `SearchEventListener` | *(alias for `message.updated` — same handler)* | `// TODO(edit-message)` — same as above |

> **Resolved in P1–P4 (no longer dead code):**
> - `message.deleted` → now emitted by `MessageService.deleteMessage()` (C1)
> - `conversation.updated` → now emitted by `GroupService.updateGroup()` (C2)
> - `user.profile.updated` → now emitted by `UsersService.update()` (C3)
> - `friend_request.*` / `unfriended` → `MessagingFriendshipListener` deleted (W1, was 100% dead code)
