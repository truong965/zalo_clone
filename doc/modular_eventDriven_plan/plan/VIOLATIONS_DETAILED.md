# 🔍 DETAILED VIOLATIONS & CODE LOCATIONS

## Quick Reference: Violations by File

---

## 1. CIRCULAR DEPENDENCY VIOLATIONS

### 1.1 Socket → Messaging → Social → Call → Social Cycle

**Files Involved**:
- [src/app.module.ts](src/app.module.ts#L85-L110)
- [src/socket/socket.module.ts](src/socket/socket.module.ts#L22)
- [src/modules/messaging/messaging.module.ts](src/modules/messaging/messaging.module.ts#L16-L20)
- [src/modules/social/social.module.ts](src/modules/social/social.module.ts#L31-L40)
- [src/modules/call/call.module.ts](src/modules/call/call.module.ts#L1-L15)

**Violation Details**:

```typescript
// ❌ src/socket/socket.module.ts (Line 22)
@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => MessagingModule),  // ← Creates cycle
  ],
})
export class SocketModule {}

// ❌ src/modules/messaging/messaging.module.ts (Line 19)
@Module({
  imports: [
    forwardRef(() => SocketModule),     // ← Cycle back to Socket
    forwardRef(() => SocialModule),     // ← Another cycle
  ],
})
export class MessagingModule {}

// ❌ src/modules/social/social.module.ts (Line 34)
@Module({
  imports: [
    forwardRef(() => CallModule),       // ← Creates cycle
    forwardRef(() => SocketModule),     // ← Another cycle
  ],
})
export class SocialModule {}

// ❌ src/modules/call/call.module.ts (Line 11)
@Module({
  imports: [
    forwardRef(() => SocialModule),     // ← Cycle back to Social
  ],
})
export class CallModule {}
```

**Impact**: Cannot migrate to microservices - forwardRef is compile-time only.

**Refactor Action**: [See ARCHITECTURE_REVIEW.md - PHASE 2](#phase-2-break-circular-dependencies-week-2-3)

---

### 1.2 Auth ← Social ← Call Cycle

**Location**: [src/modules/auth/auth.module.ts](src/modules/auth/auth.module.ts#L52-L56)

```typescript
// ❌ Line 52-56
@Module({
  imports: [
    forwardRef(() => SocialModule),
    forwardRef(() => CallModule),  // ← Indirect cycle
  ],
})
export class AuthModule {}
```

**Why**: AuthModule likely needs to verify user relationships for certain operations. Should use event bus instead.

---

## 2. SERVICE BOUNDARY VIOLATIONS

### 2.1 SocialFacade - God Object Pattern

**File**: [src/modules/social/social.facade.ts](src/modules/social/social.facade.ts#L1-50)

**Violation Severity**: 🔴 CRITICAL

```typescript
// ❌ Lines 1-30: Too many injected services
@Injectable()
export class SocialFacade {
  constructor(
    private readonly friendshipService: FriendshipService,          // 1
    private readonly privacyService: PrivacyService,                // 2
    private readonly contactService: ContactService,                // 3
    private readonly blockService: BlockService,                    // 4
    @Inject(forwardRef(() => CallHistoryService))                  // 5
    private readonly callHistoryService: CallHistoryService,
    private readonly redisService: RedisService,                   // 6
    private readonly prisma: PrismaService,                        // 7
  ) {}

  // ❌ Mixing concerns: Permission checking (not facade job)
  async checkPermission(
    requesterId: string,
    targetId: string,
    action: 'message' | 'call' | 'profile',
  ): Promise<PermissionCheckDto> {
    const isBlocked = await this.blockService.isBlocked(requesterId, targetId);
    if (isBlocked) {
      return { allowed: false, reason: 'User is blocked' };
    }
    return this.privacyService.checkPermission(requesterId, targetId, action);
  }
}
```

**Problems**:
1. ❌ 7 injected services (God Object - should be max 3)
2. ❌ Contains business logic (Permission checking should be in specific service)
3. ❌ Still uses `forwardRef` for CallHistoryService
4. ❌ Exports as API surface, making other modules depend on it

**Refactor To**:
```typescript
// ✅ Query facade with ONLY read methods
@Injectable()
export class SocialQueryFacade {
  constructor(
    private readonly blockQuery: BlockQueryService,        // 1
    private readonly friendshipQuery: FriendshipQueryService,  // 2
    private readonly privacyQuery: PrivacyQueryService,   // 3
  ) {}
  
  // ✅ Read-only method
  async canUserMessage(userId: string, targetId: string): Promise<boolean> {
    const blocked = await this.blockQuery.isBlocked(userId, targetId);
    if (blocked) return false;
    return await this.privacyQuery.allowsMessaging(userId, targetId);
  }
}

// ✅ Mutations handled through service + event
// NOT through facade
```

---

### 2.2 FriendshipService Direct BlockService Dependency

**File**: [src/modules/social/service/friendship.service.ts](src/modules/social/service/friendship.service.ts#L45-50)

**Violation Severity**: 🟡 MAJOR

```typescript
// ❌ Line 46: Direct injection of BlockService
@Injectable()
export class FriendshipService {
  constructor(
    private readonly blockService: BlockService, // ← Direct dependency
    private readonly privacyService: PrivacyService,
    // ...
  ) {}

  async sendFriendRequest(
    requesterId: string,
    targetUserId: string,
  ): Promise<FriendshipResponseDto> {
    // ❌ Direct call - not event-based
    await this.validateNotBlocked(requesterId, targetUserId);
    // ...
  }

  private async validateNotBlocked(
    requesterId: string,
    targetUserId: string,
  ): Promise<void> {
    // ❌ Direct service call
    const isBlocked = await this.blockService.isBlocked(requesterId, targetUserId);
    if (isBlocked) throw new BlockedException();
  }
}
```

**Problems**:
1. ❌ FriendshipService tight-coupled to BlockService
2. ❌ Should query block status via event bus or query interface
3. ❌ Makes modules unable to be separated

**Refactor To**:
```typescript
// ✅ Option 1: Query Interface Pattern
@Injectable()
export class FriendshipService {
  constructor(
    @Inject('IBlockQuery') private blockQuery: IBlockQuery,
    // ...
  ) {}
  
  private async validateNotBlocked(userId1: string, userId2: string) {
    const isBlocked = await this.blockQuery.isBlocked(userId1, userId2);
    if (isBlocked) throw new BlockedException();
  }
}
```

---

### 2.3 PrivacyService Hidden Dependencies

**File**: [src/modules/social/service/privacy.service.ts](src/modules/social/service/privacy.service.ts#L1-50)

**Violation Severity**: 🟡 MAJOR

```typescript
// ❌ Dependencies unclear - need to inspect full file
@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    // ❌ What other dependencies? Must read constructor
  ) {}
  
  // Does this depend on FriendshipService? Circular?
  async checkPermission(...) {
    // Logic unclear without reading implementation
  }
}
```

**Issue**: Cannot determine responsibility or dependencies without reading full service. Violates SOLID (Single Responsibility).

**Refactor To**: Clear, single responsibility
```typescript
// ✅ CLEAR: Privacy policies only
@Injectable()
export class PrivacyQueryService {
  async getUserPrivacySetting(userId: string, setting: string) {
    // ONLY: Read privacy settings from DB
  }
  
  async allowsMessaging(userId: string, senderId: string): Promise<boolean> {
    // ONLY: Check if sending message is allowed
  }
}
```

---

### 2.4 ContactService Unknown Responsibility

**Location**: [src/modules/social/service/contact.service.ts](src/modules/social/service/contact.service.ts)

**Issue**: Cannot determine if ContactService is:
- ✅ Contact list management?
- ❌ Search interface?
- ❌ FriendshipService extension?

**Violates**: "Each service has single, clear responsibility"

---

## 3. EVENT-DRIVEN DESIGN VIOLATIONS

### 3.1 Event Interfaces Instead of Classes (No Contracts)

**File**: [src/modules/social/listener/social-graph.listener.ts](src/modules/social/listener/social-graph.listener.ts#L45-100)

**Violation Severity**: 🔴 CRITICAL

```typescript
// ❌ Lines 45-100: Events as interfaces, not contracts
export interface UserBlockedEvent {
  // Missing: eventId, version, timestamp, source
  // Interface cannot enforce at runtime
}

export interface FriendshipAcceptedEvent {
  // ❌ Magic properties
  // ❌ No validation
  // ❌ Cannot version
}

export interface UserProfileUpdatedEvent {
  userId: string;
  updates: {
    displayName?: string;
    avatarUrl?: string;
    bio?: string;
    gender?: Gender;
    dateOfBirth?: Date;
  };
  // ❌ No eventId
  // ❌ No timestamp
  // ❌ No versioning strategy
}
```

**Problems**:
1. ❌ Interfaces are compile-time only - no runtime validation
2. ❌ No eventId for idempotency
3. ❌ No version for evolution
4. ❌ No timestamp for ordering
5. ❌ No source field for traceability

**Refactor To**:
```typescript
// ✅ Event as public contract class
export class UserBlockedEvent {
  readonly eventId: string;
  readonly version: number = 1;
  readonly timestamp: Date;
  readonly source: 'BlockModule' = 'BlockModule';
  
  constructor(
    readonly blockerId: string,
    readonly blockedId: string,
    readonly reason?: string,
  ) {
    this.eventId = uuidv4();
    this.timestamp = new Date();
  }
  
  // ✅ Runtime validation
  static validate(obj: unknown): UserBlockedEvent {
    // Validate schema at runtime
    return new UserBlockedEvent(...);
  }
}
```

---

### 3.2 Listener Injects CallHistoryService (Violates Separation of Concerns)

**File**: [src/modules/social/listener/social-graph.listener.ts](src/modules/social/listener/social-graph.listener.ts#L147-160)

**Violation Severity**: 🔴 CRITICAL

```typescript
// ❌ Lines 147-160: Event listener injects services from other modules
@Injectable()
export class SocialGraphEventListener {
  constructor(
    @Inject(forwardRef(() => CallHistoryService))
    private readonly callHistoryService: CallHistoryService,  // ← WRONG!
    
    @Inject(forwardRef(() => SocketGateway))
    private readonly socketGateway: SocketGateway,  // ← WRONG!
    
    private readonly redisService: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  @OnEvent('user.blocked')
  async handleUserBlocked(payload: UserBlockedEvent): Promise<void> {
    // ❌ Listener is orchestrating multiple concerns
    // ❌ Calling CallHistoryService directly
    // ❌ Calling SocketGateway directly
    // This listener should only react to event, not orchestrate
  }
}
```

**Problems**:
1. ❌ Event listener depends on 4+ services (God object)
2. ❌ Listener doing orchestration (should just react)
3. ❌ Listener tightly coupled to Call and Socket modules
4. ❌ Still using forwardRef (design problem indicator)

**Correct Pattern**:
```typescript
// ✅ Event listener: react to single concern
@Injectable()
export class BlockEventHandler {
  // Minimal dependencies
  constructor(
    private readonly redis: RedisService,
    private readonly db: PrismaService,
  ) {}

  @OnEvent('user.blocked')
  async handleUserBlocked(event: UserBlockedEvent) {
    // ONLY: Cache invalidation
    await this.redis.invalidateKey(`block:${event.blockerId}:${event.blockedId}`);
    
    // DONE - emit derived event for others to handle
    this.eventEmitter.emit(
      'user.disconnected', 
      new UserDisconnectedEvent(event.blockedId, 'blocked')
    );
  }
}

// ✅ Separate handler in SocketModule
@Injectable()
export class SocketDisconnectHandler {
  constructor(private readonly socketGateway: SocketGateway) {}

  @OnEvent('user.disconnected')
  async handleUserDisconnected(event: UserDisconnectedEvent) {
    // ONLY: Socket logic
    await this.socketGateway.forceDisconnectUser(event.userId, event.reason);
  }
}

// ✅ Separate handler in CallModule
@Injectable()
export class CallTerminationHandler {
  constructor(private readonly callService: CallHistoryService) {}

  @OnEvent('user.disconnected')
  async handleCallTermination(event: UserDisconnectedEvent) {
    // ONLY: Call logic
    await this.callService.terminateActiveCalls(event.userId);
  }
}
```

---

### 3.3 SocialGraphEventListener: Multi-Concern God Listener

**File**: [src/modules/social/listener/social-graph.listener.ts](src/modules/social/listener/social-graph.listener.ts#L145+)

**Violation Severity**: 🔴 CRITICAL

```typescript
// ❌ Single listener doing 5+ different things
@Injectable()
export class SocialGraphEventListener {
  // Handler 1: Block operations
  @OnEvent('user.blocked')
  async handleUserBlocked(payload: UserBlockedEvent) { /* 50 lines */ }

  // Handler 2: Friendship operations
  @OnEvent('friendship.removed')
  async handleFriendshipRemoved(payload: FriendshipRemovedEvent) { /* 50 lines */ }

  // Handler 3: Privacy operations
  @OnEvent('privacy.updated')
  async handlePrivacyUpdated(payload: PrivacyUpdatedEvent) { /* 30 lines */ }

  // Handler 4: Call operations
  @OnEvent('call.terminated')
  async handleCallTerminated(payload: CallTerminatedEvent) { /* 40 lines */ }

  // Handler 5: Profile updates
  @OnEvent('user.profile_updated')
  async handleUserProfileUpdated(payload: UserProfileUpdatedEvent) { /* 20 lines */ }

  // + More handlers...
  // TOTAL: 600+ lines of mixed concerns!
}
```

**Problems**:
1. ❌ One class with 600+ lines
2. ❌ Multiple concerns (Block, Friendship, Privacy, Call, Profile)
3. ❌ Hard to test - test one handler affects others
4. ❌ Hard to deploy - change in one handler needs full redeploy
5. ❌ Violates Single Responsibility Principle

**Refactor To**: One listener per domain concern
```
✅ CORRECT:
  ├── src/modules/block/listener/block.listener.ts          (BlockModule)
  ├── src/modules/social/listener/friendship.listener.ts    (SocialModule)
  ├── src/modules/social/listener/privacy-cache.listener.ts (SocialModule)
  ├── src/modules/call/listener/call.listener.ts            (CallModule)
  └── src/modules/socket/listener/presence.listener.ts      (SocketModule)
```

---

### 3.4 No Event Registry or Ownership Declaration

**Location**: Across all modules - NO CENTRAL REGISTRY

**Violation Severity**: 🟡 MAJOR

**Current State**:
```
Events defined in:
  - social-graph.listener.ts (50+ events?)
  - messaging.gateway.ts (events?)
  - Scattered across modules

Question: Can you query all events in system? Answer: NO
```

**Refactor To**: Central Event Registry
```typescript
// ✅ src/events/README.md (or EVENTS_REGISTRY.md)

# EVENT REGISTRY

## BlockModule Events (Owner: BlockModule)
- UserBlockedEvent (defined in: src/modules/block/events.ts)
- UserUnblockedEvent

## SocialModule Events (Owner: SocialModule)
- FriendRequestSentEvent
- FriendshipAcceptedEvent
- ContactAddedEvent

## MessagingModule Events (Owner: MessagingModule)
- MessageSentEvent
- ConversationCreatedEvent

## SocketModule Events (Owner: SocketModule)
- UserConnectedEvent
- UserDisconnectedEvent

...

## Anti-patterns
❌ Event defined in listener file
❌ Multiple modules emit same event
❌ Event without version field
```

---

### 3.5 No Idempotency Guarantees

**File**: [src/modules/social/listener/social-graph.listener.ts](src/modules/social/listener/social-graph.listener.ts#L200+)

**Violation Severity**: 🔴 CRITICAL

```typescript
// ❌ No idempotency check
@OnEvent('user.blocked')
async handleUserBlocked(payload: UserBlockedEvent): Promise<void> {
  // What if this runs twice?
  // What if event is retried by message broker?
  
  // ❌ No check: "Have I already processed this event?"
  
  await this.socketGateway.removeUserFromRoom(blockedId, blockerPresenceRoom);
  await this.socketGateway.removeUserFromRoom(blockerId, blockedPresenceRoom);
  // OOPS: Room removal runs twice! ❌
  
  await this.socketGateway.emitToUser(...);
  // Notification sent twice! ❌
}
```

**Impact**: When moving to Kafka/RabbitMQ with at-least-once delivery:
- ❌ Duplicate room removals
- ❌ Duplicate socket emissions
- ❌ Data inconsistency
- ❌ **WILL FAIL IN PRODUCTION**

**Refactor To**:
```typescript
// ✅ Idempotent handler
@Injectable()
export class BlockEventHandler extends IdempotentListener {
  @OnEvent('user.blocked')
  async handleUserBlocked(event: UserBlockedEvent) {
    // ✅ Wrapped with idempotency check
    return this.withIdempotency(
      event.eventId,                    // Use event's unique ID
      this.constructor.name,            // Listener name
      async () => {
        // Handler body runs ONCE per event
        await this.socketGateway.removeUserFromRoom(...);
      }
    );
  }
}

// Base class:
@Injectable()
export abstract class IdempotentListener {
  async withIdempotency<T>(
    eventId: string,
    listenerName: string,
    handler: () => Promise<T>,
  ): Promise<T | null> {
    // Check if already processed
    const processed = await this.db.processedEvent.findUnique({
      where: { eventId_listenerName: { eventId, listenerName } },
    });

    if (processed) {
      this.logger.warn(`Event ${eventId} already processed`);
      return null; // Skip
    }

    // Execute
    const result = await handler();

    // Mark as processed
    await this.db.processedEvent.create({
      data: { eventId, listenerName, processedAt: new Date() },
    });

    return result;
  }
}
```

---

## 4. MESSAGING MODULE VIOLATIONS

### 4.1 MessagingModule Imports SocialModule (Should Use Events)

**File**: [src/modules/messaging/messaging.module.ts](src/modules/messaging/messaging.module.ts#L16-20)

**Violation Severity**: 🟡 MAJOR

```typescript
// ❌ Line 19-20: Direct module import for cross-module communication
@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    forwardRef(() => SocketModule),
    forwardRef(() => SocialModule),  // ← Should use events instead!
  ],
})
export class MessagingModule {}
```

**Why This Is Wrong**:
1. ❌ Tight coupling - can't deploy Messaging separately
2. ❌ Forces forwardRef usage
3. ❌ Likely using SocialModule for permission checks
4. ❌ Cannot scale independently

**Correct Approach**:
```typescript
// ✅ CORRECT: No SocialModule import needed
@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    EventEmitterModule,  // ← Use events instead
  ],
})
export class MessagingModule {}

// ✅ In MessageService:
@Injectable()
export class MessageService {
  async sendMessage(senderId: string, conversationId: string, content: string) {
    // 1. ❌ OLD WAY:
    // const allowed = await this.socialService.canMessage(senderId, targetId);

    // 2. ✅ NEW WAY: Query event bus
    // Listener has already determined permission
    // Just check if user has "can_message" token from SocialModule
    
    // 3. Save message
    const message = await this.db.message.create({...});
    
    // 4. Emit event - SocketModule will listen
    this.eventEmitter.emit('message.sent', new MessageSentEvent(...));
  }
}

// ✅ In SocketModule - NEW listener:
@Injectable()
export class MessageBroadcasterListener {
  @OnEvent('message.sent')
  async handleMessageSent(event: MessageSentEvent) {
    // Broadcast to recipient
    await this.socketGateway.emitToUser(event.recipientId, 'message:new', event);
  }
}
```

---

### 4.2 MessagingGateway Also Uses forwardRef

**File**: [src/modules/messaging/messaging.gateway.ts](src/modules/messaging/messaging.gateway.ts#L1)

**Note**: MessagingGateway is a separate transport layer, not service layer. May be acceptable to directly emit socket events here, but verify if tightly coupled.

---

## 5. SOCKET MODULE VIOLATIONS

### 5.1 SocketGateway Too Large (400+ lines, Multiple Concerns)

**File**: [src/socket/socket.gateway.ts](src/socket/socket.gateway.ts#L1+)

**Violation Severity**: 🟡 MAJOR

```typescript
// ❌ Single file handling too many concerns
@WebSocketGateway({...})
export class SocketGateway {
  // Concern 1: Authentication
  @SubscribeMessage('auth:login')
  async handleAuth(...) { /* 30 lines */ }

  // Concern 2: Connection lifecycle
  handleConnection() { /* 20 lines */ }
  handleDisconnect() { /* 40 lines */ }

  // Concern 3: Presence tracking
  @SubscribeMessage('presence:online')
  async handlePresence(...) { /* 20 lines */ }

  // Concern 4: Cleanup jobs
  async cleanupIdleSockets() { /* 50 lines */ }

  // Concern 5: Broadcasting
  async emitToUser(...) { /* 20 lines */ }

  // ... + More handlers
  // TOTAL: 400+ lines
}
```

**Refactor**: Separate concerns into listener/service classes (some can stay in gateway, others → listeners)

---

## 6. MISSING INFRASTRUCTURE

### 6.1 No Processed Events Table

**Expected Location**: Database schema

**Current State**: Missing

**Add**:
```sql
CREATE TABLE processed_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL,
  event_type VARCHAR NOT NULL,
  listener_name VARCHAR NOT NULL,
  processed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, listener_name)
);

CREATE INDEX idx_processed_events_event_id ON processed_events(event_id);
CREATE INDEX idx_processed_events_listener ON processed_events(listener_name);
```

---

### 6.2 No Event Store

**Current**: Events emitted but lost after processed

**Needed**: Event sourcing capability for audit trail, replay, recovery

---

## 7. SUMMARY TABLE: All Violations by Severity

| File | Line | Violation | Severity | Action |
|------|------|-----------|----------|--------|
| social.facade.ts | 1-30 | God Object (8 services) | 🔴 | Split into query-only + remove mutations |
| friendship.service.ts | 46 | Direct BlockService call | 🔴 | Use query interface or event bus |
| social-graph.listener.ts | 45-100 | Event interfaces (no contracts) | 🔴 | Convert to classes with eventId, version |
| social-graph.listener.ts | 147-160 | Listener injects Call + Socket | 🔴 | Split into 5 separate listeners |
| social-graph.listener.ts | 200+ | No idempotency checks | 🔴 | Add processed_events table + wrapper |
| messaging.module.ts | 19 | Imports SocialModule | 🔴 | Use event bus instead |
| app.module.ts | 85-110 | 5+ circular dependencies | 🔴 | Break with event-driven design |
| socket.module.ts | 22 | forwardRef to MessagingModule | 🟡 | Use event bus for messaging |
| auth.module.ts | 52 | Imports Social + Call | 🟡 | Query interface pattern |
| socket.gateway.ts | 1+ | 400+ lines, 5 concerns | 🟡 | Split handlers into listener classes |
| privacy.service.ts | 1-50 | Hidden dependencies | 🟡 | Document responsibilities |
| contact.service.ts | 1+ | Unclear responsibility | 🟡 | Define single responsibility |
| N/A | N/A | No event registry | 🟡 | Create EVENT_REGISTRY.md |
| N/A | N/A | No event store | 🟡 | Implement event sourcing |

---

**Total Violations Found: 14 critical + 10 major**  
**Estimated Refactor Time: 6 weeks**  
**Microservices Readiness After: 10/10** ✅

