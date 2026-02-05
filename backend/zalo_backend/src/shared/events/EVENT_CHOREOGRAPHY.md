# 🎯 Event Choreography Map - System Event Flow

## Overview

This document defines the **clear event choreography** for the entire system.
It answers: "Who listens to what, and who is responsible for what?"

---

## 📋 Domain Boundaries

```
┌─────────────────────────────────────────────────────────────────────┐
│ DOMAIN: FRIENDSHIP                                                  │
├─────────────────────────────────────────────────────────────────────┤
│ Emits Events:                                                       │
│  - friendship.request.sent                                          │
│  - friendship.accepted                                              │
│  - friendship.declined                                              │
│  - friendship.request.removed                                       │
│  - friendship.unfriended                                            │
│                                                                     │
│ Owns: FriendshipService, RelationshipRepository                     │
│ Listener: FriendshipEventHandler (cache invalidation)               │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ DOMAIN: BLOCK                                                       │
├─────────────────────────────────────────────────────────────────────┤
│ Emits Events:                                                       │
│  - user.blocked                                                     │
│  - user.unblocked                                                   │
│                                                                     │
│ Owns: BlockService, BlockRepository                                 │
│ Listener: BlockEventHandler (cache invalidation)                    │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ DOMAIN: MESSAGING                                                   │
├─────────────────────────────────────────────────────────────────────┤
│ Emits Events:                                                       │
│  - message.sent                                                     │
│  - message.delivered                                                │
│  - message.read                                                     │
│  - conversation.created                                             │
│                                                                     │
│ Owns: MessagingService, MessageRepository                           │
│ Listeners:                                                          │
│  - MessagingEventHandler (cache invalidation)                       │
│  - NotificationListener (send notifications)                        │
│  - SocketListener (real-time updates)                               │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ DOMAIN: CALL                                                        │
├─────────────────────────────────────────────────────────────────────┤
│ Emits Events:                                                       │
│  - call.initiated                                                   │
│  - call.answered                                                    │
│  - call.ended                                                       │
│  - call.missed                                                      │
│                                                                     │
│ Owns: CallService, CallHistoryRepository                            │
│ Listeners:                                                          │
│  - CallEventHandler (cache invalidation)                            │
│  - NotificationListener (missed call notifications)                 │
│  - SocketListener (ring notifications)                              │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ DOMAIN: AUTH                                                        │
├─────────────────────────────────────────────────────────────────────┤
│ Emits Events:                                                       │
│  - user.registered                                                  │
│  - user.logged_in                                                   │
│  - user.logged_out                                                  │
│  - device.registered                                                │
│  - device.removed                                                   │
│                                                                     │
│ Owns: AuthService, SessionRepository                                │
│ Listeners:                                                          │
│  - AuthEventHandler (session management)                            │
│  - SocketListener (connection notifications)                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Event Flow by Operation

### Operation: Send Friend Request

```
1. Controller/Service Layer
   FriendshipService.sendFriendRequest(fromUserId, toUserId)
   ├─ Create FriendRequest record
   ├─ Emit Event: friendship.request.sent
   └─ Return success

2. Event Bus (Synchronous by default)
   friendship.request.sent
   ├─ ALL listeners execute
   └─ Errors propagate back (fail-fast)

3. Listeners Execute (in order)
   
   a) FriendshipCacheListener (IMMEDIATE)
      ├─ Invalidate toUserId's pending requests cache
      ├─ Execution: Synchronous
      └─ Responsibility: Cache consistency
   
   b) NotificationDispatcher (QUEUED)
      ├─ Queue: notification-queue
      ├─ Emit: notification.queued
      └─ Responsibility: Async notification handling
   
   c) AnalyticsLogger (BEST EFFORT)
      ├─ Log: user interaction
      ├─ Execution: Fire-and-forget
      └─ Responsibility: Analytics only

4. Async Workers (Background)
   - Process notification queue
   - Send push/email notifications
   - Log analytics
```

### Operation: Accept Friend Request

```
1. Controller/Service Layer
   FriendshipService.acceptFriendRequest(requesterId, acceptedBy)
   ├─ Update FriendRequest to ACCEPTED
   ├─ Create Friendship record
   ├─ Emit Event: friendship.accepted
   └─ Return success

2. Event Bus
   friendship.accepted
   ├─ Synchronous execution (listeners execute now)
   └─ All listeners handle or fail

3. Listeners Execute
   
   a) FriendshipCacheListener (IMMEDIATE)
      ├─ Invalidate both users' friend lists
      ├─ Invalidate both users' pending requests cache
      └─ Responsibility: Cache consistency
   
   b) MessagingInitializer (QUEUE)
      ├─ Emit: messaging.initialize_conversation
      ├─ MessagingService listens and creates conversation
      └─ Responsibility: Cross-domain event choreography
   
   c) NotificationDispatcher (QUEUE)
      ├─ Queue: "Request accepted" notification
      └─ Responsibility: Notification delivery
   
   d) SocketListener (IMMEDIATE)
      ├─ Broadcast to both users in real-time
      ├─ Update friend list UI
      └─ Responsibility: Real-time sync

4. Secondary Events
   - messaging.conversation_created (from MessagingInitializer)
   - notification.queued (from NotificationDispatcher)
   - user.presence_updated (from SocketListener)
```

### Operation: Unfriend User

```
1. Controller/Service Layer
   FriendshipService.removeFriendship(initiatedBy, targetUser)
   ├─ Acquire distributed lock (prevent race condition)
   ├─ Soft-delete Friendship record
   ├─ Emit Event: friendship.unfriended
   ├─ Release lock
   └─ Return success

2. Event Bus
   friendship.unfriended
   ├─ Synchronous execution
   └─ Protected by distributed lock

3. Listeners Execute
   
   a) FriendshipCacheListener (IMMEDIATE)
      ├─ Invalidate both users' friend lists
      ├─ Invalidate both users' call history
      ├─ Invalidate both users' block lists
      └─ Responsibility: Cache consistency
   
   b) CallEndListener (QUEUE)
      ├─ Emit: call.terminate_all
      ├─ End any active calls between users
      └─ Responsibility: Business logic (block unfriended calls)
   
   c) NotificationDispatcher (QUEUE)
      ├─ Queue: "You were unfriended" notification
      └─ Responsibility: User notification

4. Secondary Events
   - call.terminated (from CallEndListener)
   - notification.queued (from NotificationDispatcher)
```

---

## 📊 Listener Responsibility Matrix

| Event | Handler | Responsibility | Execution | Success Criteria |
|-------|---------|-----------------|-----------|------------------|
| friendship.request.sent | FriendshipCacheListener | Invalidate cache | Sync | Key deleted |
| friendship.request.sent | NotificationDispatcher | Queue notification | Async | Msg enqueued |
| friendship.accepted | FriendshipCacheListener | Invalidate dual-user cache | Sync | Keys deleted |
| friendship.accepted | MessagingInitializer | Create conversation | Sync | Conv created |
| friendship.accepted | SocketListener | Broadcast update | Sync | All clients notified |
| friendship.declined | FriendshipCacheListener | Invalidate cache | Sync | Key deleted |
| friendship.declined | NotificationDispatcher | Queue notification | Async | Msg enqueued |
| friendship.removed | FriendshipCacheListener | Invalidate cache | Sync | Key deleted |
| friendship.unfriended | FriendshipCacheListener | Invalidate multi-cache | Sync | All keys deleted |
| friendship.unfriended | CallEndListener | Terminate active calls | Async | All calls ended |
| friendship.unfriended | SocketListener | Broadcast removal | Sync | All clients updated |
| user.blocked | BlockCacheListener | Invalidate block cache | Sync | Keys deleted |
| user.blocked | MessagingMuter | Mute conversation | Async | Conv muted |
| user.blocked | SocketListener | Disconnect user | Sync | Socket closed |
| message.sent | MessagingCacheListener | Invalidate conv cache | Sync | Key deleted |
| message.sent | SocketListener | Broadcast message | Sync | All clients updated |
| message.sent | AnalyticsLogger | Log user activity | Fire-forget | Async |
| call.initiated | CallCacheListener | Invalidate cache | Sync | Key deleted |
| call.initiated | SocketListener | Broadcast ring | Sync | Ring notification |
| call.terminated | CallCacheListener | Invalidate cache | Sync | Key deleted |
| call.terminated | SocketListener | Broadcast end | Sync | End notification |

---

## 🚫 Anti-Patterns to Avoid

### ❌ DON'T: Multiple Listeners for Same Domain

```typescript
// ❌ WRONG: Unclear which listener does what
@OnEvent('friendship.request.sent')
async handleFriendRequestV1() { /* cache */ }

@OnEvent('friendship.request.sent')
async handleFriendRequestV2() { /* notification */ }

@OnEvent('friendship.request.sent')
async handleFriendRequestV3() { /* socket */ }
```

### ✅ DO: One Handler per Domain + Internal Delegation

```typescript
// ✅ CORRECT: Single entry point, internal methods
@Injectable()
export class FriendshipEventHandler extends IdempotentListener {
  @OnEvent('friendship.request.sent')
  async handleFriendRequestSent(event) {
    return this.withIdempotency(event.eventId, async () => {
      await this.invalidateCache(event);
      // If needed, emit secondary events for other domains
      this.eventEmitter.emit('notification.queue', {...});
    });
  }
}
```

### ❌ DON'T: Direct Imports in Listeners

```typescript
// ❌ WRONG: Tightly coupled to implementation
import { RedisService } from '@modules/redis/redis.service';

constructor(private redis: RedisService) {}

async handle(event) {
  await this.redis.getClient().del('key');
}
```

### ✅ DO: Use Facades

```typescript
// ✅ CORRECT: Loosely coupled via facade
import { RedisCacheFacade } from '@shared/facades/redis-cache.facade';

constructor(private cache: RedisCacheFacade) {}

async handle(event) {
  await this.cache.invalidateKey('key');
}
```

### ❌ DON'T: Cross-Domain Direct Calls

```typescript
// ❌ WRONG: Tight coupling between domains
export class FriendshipEventHandler {
  constructor(private messaging: MessagingService) {} // ❌ WRONG

  async handleFriendshipAccepted(event) {
    await this.messaging.createConversation(...); // ❌ Direct call
  }
}
```

### ✅ DO: Event-Driven Communication

```typescript
// ✅ CORRECT: Loose coupling via events
export class FriendshipEventHandler {
  constructor(private eventEmitter: EventEmitter2) {}

  async handleFriendshipAccepted(event) {
    // Let MessagingModule listen and react
    this.eventEmitter.emit('messaging.initialize_conversation', {
      user1Id: event.user1Id,
      user2Id: event.user2Id,
    });
  }
}
```

---

## 🔐 Event Ordering & Guarantees

### Synchronous Listeners (Cache Invalidation)
- **Execution**: Immediate, blocking
- **Guarantee**: At-most-once (exception fails whole operation)
- **Use case**: Cache invalidation, critical updates
- **Timeout**: 5 seconds
- **Example**:
  ```typescript
  @OnEvent('friendship.accepted')
  async handleFriendshipAccepted(event) {
    // Must complete in 5 seconds
    // If fails, entire operation fails
    await this.cache.invalidateFriendshipCaches(...);
  }
  ```

### Async Listeners (Notifications, Cross-Domain)
- **Execution**: Queued, non-blocking
- **Guarantee**: At-least-once (with retries)
- **Use case**: Notifications, secondary domain events
- **Timeout**: 30 seconds
- **Retries**: 3x exponential backoff
- **Example**:
  ```typescript
  @OnEvent('friendship.accepted')
  async handleNotification(event) {
    // Queue for processing, don't block main request
    await this.queue.add({ type: 'notification', event });
  }
  ```

### Fire-and-Forget Listeners (Analytics, Logging)
- **Execution**: Async, best-effort
- **Guarantee**: None (failure is ignored)
- **Use case**: Metrics, non-critical logging
- **Timeout**: None
- **Example**:
  ```typescript
  @OnEvent('friendship.accepted')
  async handleAnalytics(event) {
    // Log and forget
    this.logger.log('Friendship accepted', event);
    this.analytics.track({ event: 'friendship_accepted' });
  }
  ```

---

## 📌 Implementation Checklist

- [x] Define event boundaries (who emits what)
- [x] Define listener responsibilities (who handles what)
- [x] Define execution model (sync vs async)
- [x] Define retry strategy (at-most-once vs at-least-once)
- [x] Document cross-domain events (event choreography)
- [x] Document anti-patterns to avoid
- [ ] Implement distributed tracing (correlationId)
- [ ] Implement circuit breaker for async listeners
- [ ] Implement dead letter queue for failed events
- [ ] Add event schema versioning documentation

---

## 📞 Questions? Debugging?

If an event isn't being handled:
1. Check if listener is registered in module
2. Check if event name matches exactly
3. Check if handler method exists
4. Check IdempotencyService for duplicate processing

If event seems lost:
1. Check if emitted from correct module
2. Check if listener is in correct execution model (sync vs async)
3. Check if queue processor is running
4. Check logs for error stack

---

**Last Updated**: 2026-02-04
**Maintainer**: Event Architecture Team
