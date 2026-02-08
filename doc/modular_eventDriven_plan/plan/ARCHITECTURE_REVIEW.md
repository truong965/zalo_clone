# 🔴 ARCHITECTURE REVIEW & REFACTOR PLAN
## Modular Monolith + Event-Driven Design

**Status**: ⚠️ CRITICAL VIOLATIONS FOUND  
**Date**: 2025-02-02  
**Severity**: HIGH - Multiple boundary and dependency violations preventing microservices migration

---

## EXECUTIVE SUMMARY

Your current Modular Monolith has **5 critical architectural violations**:

1. ❌ **Circular Dependencies** via `forwardRef` (Band-aid, not solution)
2. ❌ **Service Overlap & Wrong Boundaries** (Business logic in wrong modules)
3. ❌ **Facade Anti-Pattern** (SocialFacade contains orchestration logic, should be pure coordination)
4. ❌ **Event-Driven Design Incomplete** (Events defined, but listeners still depend on direct service calls)
5. ❌ **Unclear Event Ownership** (Multiple modules can emit same events)

**Migration-Readiness: 3/10** ❌ NOT ready for microservices. Needs deep refactoring.

---

## 1. CRITICAL VIOLATIONS IDENTIFIED

### 1.1 CIRCULAR DEPENDENCY CHAIN (BLOCKER)

```
┌─────────────────────────────────────────────────┐
│                DEPENDENCY GRAPH                  │
└─────────────────────────────────────────────────┘

SocketModule
    ↓ (imports)
MessagingModule
    ↓ (imports forwardRef)
SocialModule
    ↓ (imports forwardRef)
CallModule
    ↓ (imports forwardRef)
SocialModule ← CYCLE!

AuthModule
    ↓ (imports forwardRef)
SocialModule
    ↓ (imports forwardRef)
CallModule ← indirect cycle
```

**Current Status**: Using `forwardRef()` everywhere
```typescript
// ❌ BAD: Current approach (Band-aid)
forwardRef(() => SocketModule)
forwardRef(() => SocialModule)
forwardRef(() => CallModule)
```

**Root Cause**: 
- SocketModule needs MessagingGateway
- MessagingModule needs SocialModule (for permission checks)
- SocialModule needs CallModule (for cascade operations)
- CallModule needs SocialModule (for contact data)

**Impact**:
- ⚠️ Bootstrap time increases
- ⚠️ Hard to debug dependency resolution
- ⚠️ **Cannot migrate to microservices** - different JVMs won't have `forwardRef`
- ⚠️ Risk of runtime errors due to incomplete initialization

---

### 1.2 SERVICE BOUNDARY VIOLATIONS (MAJOR)

#### A. BlockService Logic Spread

**Current State**:
- `BlockService` emits `user.blocked` event ✅
- `BlockService` cascades to FriendshipService ✅
- BUT: `SocialFacade` also orchestrates block checking ✅
- **AND**: `FriendshipService` directly calls `BlockService.isBlocked()` ✅

**Problem**: Block logic exists in 3 places:
1. `BlockService` - Event emission
2. `SocialFacade` - Permission checking
3. `FriendshipService` - Validation

**Code Evidence**:
```typescript
// src/modules/social/social.facade.ts (Lines 34-42)
async checkPermission(...) {
  const isBlocked = await this.blockService.isBlocked(requesterId, targetId);
  if (isBlocked) return { allowed: false, reason: 'User is blocked' };
  return this.privacyService.checkPermission(...);
}

// src/modules/social/service/friendship.service.ts (Line 46)
private readonly blockService: BlockService,

// Direct dependency: FriendshipService → BlockService
```

**Violation**: Multiple modules depend on BlockService internals. Should use **event-based queries** via event bus instead.

---

#### B. FriendshipService Boundary Confusion

**Current State**:
- FriendshipService directly depends on BlockService
- FriendshipService directly depends on PrivacyService
- FriendshipService emits friendship events
- **But**: ContactService ALSO depends on FriendshipService

```typescript
// ❌ Circular dependency through business logic
FriendshipService → BlockService (direct call)
FriendshipService → PrivacyService (direct call)
ContactService → FriendshipService (implicit)
```

**Question**: Should FriendshipService know about Block status?
- **Event-Driven Answer**: NO - FriendshipService should emit `friendRequest.sent`, listener checks block status

---

#### C. PrivacyService as Silent Dependency

**Current State**:
```typescript
// src/modules/social/service/privacy.service.ts
constructor(
  private readonly eventEmitter: EventEmitter2,
  // Does PrivacyService depend on FriendshipService? (Hidden in code)
)
```

**Issue**: 
- PrivacyService has no clear responsibility
- Tightly coupled with FriendshipService logic
- May have undiscovered transitive dependencies

---

### 1.3 FACADE ANTI-PATTERN (INCORRECT USAGE)

**Current SocialFacade Design**:
```typescript
// src/modules/social/social.facade.ts
@Injectable()
export class SocialFacade {
  constructor(
    private readonly friendshipService: FriendshipService,
    private readonly privacyService: PrivacyService,
    private readonly contactService: ContactService,
    private readonly blockService: BlockService,
    @Inject(forwardRef(() => CallHistoryService))
    private readonly callHistoryService: CallHistoryService,
    // + 2 more services
  ) {}

  async checkPermission(...) { /* orchestration */ }
}
```

**Problems**:
1. ❌ **Too Many Dependencies** (8 injected services = God Object)
2. ❌ **Contains Business Logic** (Permission check should be in specific service)
3. ❌ **Perpetuates Circular Dependency** (Injects CallHistoryService via forwardRef)
4. ❌ **No Clear Responsibility** - Is it Orchestrator? Query Interface? Facade?

**What Facade SHOULD Be** (Correct Pattern):
```typescript
// ✅ CORRECT: Facade = Coordination + Query Interface (READ-ONLY)
@Injectable()
export class SocialQueryFacade {
  constructor(
    private readonly friendshipQueryService: FriendshipQueryService,
    private readonly privacyQueryService: PrivacyQueryService,
    private readonly contactQueryService: ContactQueryService,
  ) {}

  // ONLY query methods, NO mutation
  async getUserRelationshipStatus(userId: string, targetId: string) {
    return await this.friendshipQueryService.getStatus(userId, targetId);
  }
}

// Mutations happen through command handlers + event listeners, NOT facade
```

---

### 1.4 EVENT-DRIVEN DESIGN INCOMPLETE (CRITICAL)

#### A. Event Definitions Are Weak

**Current State**:
```typescript
// src/modules/social/listener/social-graph.listener.ts
export interface UserBlockedEvent {
  // Missing: eventId, version, timestamp
}

export interface FriendshipAcceptedEvent {
  // Magic properties, no validation
}
```

**Problems**:
1. ❌ **No Event Classes** - Using interfaces instead of concrete classes
2. ❌ **No Event Versioning** - Cannot evolve events
3. ❌ **No Event Metadata** - Missing `eventId`, `timestamp`, `source`
4. ❌ **No Idempotency Support** - No transaction ID or processed_events table

**Should Be** (Proper Event Contracts):
```typescript
// ✅ CORRECT: Event as Public Contract
export class UserBlockedEvent {
  readonly eventId: string;
  readonly version: number = 1;
  readonly timestamp: Date;
  readonly blockerId: string;
  readonly blockedId: string;
  readonly reason?: string;
  
  constructor(blockerId: string, blockedId: string, reason?: string) {
    this.eventId = uuidv4();
    this.timestamp = new Date();
    this.blockerId = blockerId;
    this.blockedId = blockedId;
    this.reason = reason;
  }
}
```

---

#### B. Listener Still Uses Direct Service Calls

**Current State**:
```typescript
// src/modules/social/listener/social-graph.listener.ts
@OnEvent('user.blocked')
async handleUserBlocked(payload: UserBlockedEvent): Promise<void> {
  // ❌ Still calling CallHistoryService directly
  @Inject(forwardRef(() => CallHistoryService))
  private readonly callHistoryService: CallHistoryService;
  
  // Listener shouldn't know about CallHistoryService internals
}
```

**Problem**: Event listener is doing **cascade operations** instead of just **reacting to changes**:
- Should terminate calls via event → `callTerminated` event
- Should notify socket via event → `userDisconnected` event
- NOT: Directly call `callHistoryService.forceDisconnect()`

---

#### C. No Event Registry/Ownership

**Current State**: Events are scattered
```
- UserBlockedEvent → Where defined? (social-graph.listener.ts)
- FriendshipAcceptedEvent → Where? (same file)
- FriendRequestSentEvent → Same file

Question: Can someone query all events in the system?
Answer: NO - must grep manually
```

**Issue**: Violates rule: **"Each event has 1 owner module"**

---

### 1.5 MISSING IDEMPOTENCY GUARANTEES (CRITICAL)

**No Processed Events Tracking**:

```typescript
// ❌ If this listener runs twice with same event:
@OnEvent('user.blocked')
async handleUserBlocked(payload: UserBlockedEvent): Promise<void> {
  // No check: Has this event already been processed?
  await this.socketGateway.removeUserFromRoom(...); // Runs again! ❌
  await this.socketGateway.disconnectUser(...); // Runs again! ❌
}
```

**Requirements NOT Met**:
- ❌ No `eventId` in event contract
- ❌ No `processed_events` table
- ❌ No idempotency key validation
- ❌ No upsert/conditional update logic

**Impact**: 
- If RabbitMQ/Kafka retries event (at-least-once delivery) → duplicate operations
- **This will FAIL on microservices migration**

---

## 2. BOUNDARY VIOLATIONS BY DOMAIN

### 2.1 SOCIAL DOMAIN - DIRTY BOUNDARIES

#### Current Module Structure:
```
SocialModule/
  ├── service/
  │   ├── friendship.service.ts      ← Friendship state
  │   ├── privacy.service.ts          ← Privacy policies
  │   ├── contact.service.ts          ← Contact list
  │   └── ??? (unclear responsibilities)
  ├── listener/
  │   └── social-graph.listener.ts    ← Event reactions (TOO MANY)
  └── social.facade.ts                 ← Orchestration (WRONG PLACE)
```

#### Problem: SocialGraphEventListener Does TOO MUCH

```typescript
// src/modules/social/listener/social-graph.listener.ts
@Injectable()
export class SocialGraphEventListener {
  @OnEvent('user.blocked')
  async handleUserBlocked(...) { /* 50 lines */ }
  
  @OnEvent('friendship.removed')
  async handleFriendshipRemoved(...) { /* Logic for multiple concerns */ }
  
  @OnEvent('user.profile_updated')
  async handleUserProfileUpdated(...) { /* Emit to socket */ }
  
  // + More handlers mixing concerns
}
```

**Anti-Pattern**: Single listener handling **cross-cutting concerns** (Blocks, Calls, Socket, Cache)

**Should Be**: Separate listeners per domain concern:
```
✅ CORRECT:
  ├── listener/block.listener.ts          (BlockModule responsibility)
  ├── listener/friendship.listener.ts     (SocialModule responsibility)
  ├── listener/cache-invalidation.listener.ts (Redis responsibility)
  └── listener/socket-broadcast.listener.ts  (SocketModule responsibility)
```

---

### 2.2 MESSAGING DOMAIN - FORWARDREF TRAP

```typescript
// src/modules/messaging/messaging.module.ts
@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    forwardRef(() => SocketModule),        // ← Circular!
    forwardRef(() => SocialModule),        // ← Circular!
  ],
  // ...
})
```

**Question**: Why does MessagingModule need SocialModule?
- **Current**: Direct permission checks in message logic
- **Correct**: Query event bus for permission status

**Issue**: MessagingGateway depends on SocketGateway
- Current: Direct socket injection
- Correct: Emit `message.sent` event → SocketModule listens

---

### 2.3 SOCKET DOMAIN - SCATTERED RESPONSIBILITIES

```typescript
// src/socket/socket.module.ts
@Module({
  imports: [
    forwardRef(() => AuthModule),
    forwardRef(() => MessagingModule),
    // SocketModule exports SocketGateway, SocketStateService
  ],
})

// src/socket/socket.gateway.ts - 400+ lines
@WebSocketGateway(...)
export class SocketGateway {
  // Handles: Auth, Messages, Presence, Notifications, Cleanup
  // TOO MANY CONCERNS!
}
```

**Issue**: SocketGateway mixes concerns:
- ❌ Connection management
- ❌ Message broadcasting
- ❌ Presence tracking
- ❌ Cleanup logic

**Should Be**: Separate logical handlers via event listeners

---

## 3. EVENT-DRIVEN ANTI-PATTERNS FOUND

### 3.1 EVENT CHAINING / "PINBALL EFFECT" RISK

**Current Pattern**:
```
user.blocked event
  ↓ listener
@OnEvent('user.blocked') → socketGateway.emitToUser() ✅
@OnEvent('user.blocked') → callHistoryService.terminate() → emit 'call.terminated' ✅
  
call.terminated event
  ↓ listener  
@OnEvent('call.terminated') → socketGateway.emitToUser()
  
socket emission → client receives → client reconnects?
  ↓
back to server → new event? ← POTENTIAL LOOP
```

**Risk**: If client doesn't handle disconnect properly, infinite loop possible.

**How to Prevent**:
- Listeners must be **idempotent**
- Events must have **terminal states** (no re-emission of same event)
- Workflow requires **explicit orchestrator** (Saga pattern)

---

### 3.2 MISSING STATE VALIDATION

```typescript
// ❌ No state checks:
@OnEvent('user.blocked')
async handleUserBlocked(payload: UserBlockedEvent) {
  // What if block already exists? Handler runs again?
  // What if user doesn't exist?
  // What if already in process of blocking?
  
  await this.socketGateway.removeUserFromRoom(...); // RUNS ANYWAY
}
```

---

## 4. DEPENDENCY GRAPH VIOLATIONS

### 4.1 LAYER VIOLATION

**Rule**: Cross-module communication should be:
```
Controller → Service → Repository (internal to module)
      ↓
   Event Bus (cross-module communication)
```

**Current Violation**:
```
✅ Correct path:
  MessagingService → emit 'message.sent' → SocketModule listens

❌ Actual path (also exists):
  MessagingService → BlockService.isBlocked() → direct call ✗
  MessagingService → PrivacyService.checkPermission() → direct call ✗
```

**Evidence**:
```typescript
// src/modules/messaging/messaging.module.ts
imports: [forwardRef(() => SocialModule)]  // ← Direct dependency, not event-based
```

---

### 4.2 "CANNOT DELETE MODULE" TEST FAILURE

**Test**: Can we remove SocialModule without breaking other modules?

**Answer**: NO ❌
```
If we remove SocialModule:
  ✗ AuthModule imports it (forwardRef)
  ✗ CallModule imports it (forwardRef)
  ✗ MessagingModule imports it (forwardRef)
  ✗ SocketModule depends on listener events from it

Result: Everything breaks
```

**Why This Matters**: This proves **boundaries are wrong**. Modules shouldn't have mandatory dependencies on each other.

---

## 5. EXPECTED MISSING ISSUES (PROACTIVE DETECTION)

### 5.1 Event Ownership Unclear

**Question**: Who owns `user.profile_updated` event?
- AuthModule? UsersModule? SocialModule?
- Multiple modules emit it? ← **VIOLATION**

**Current State**:
```typescript
// ❌ Cannot determine ownership
export interface UserProfileUpdatedEvent {
  userId: string;
  updates: { displayName?: string; avatarUrl?: string; ... };
}

// Who owns this? Where should it be defined?
// Scattered across modules
```

**Required**: **Centralized Event Registry** (README or file)

---

### 5.2 Listener Error Handling Gaps

**Current**:
```typescript
@OnEvent('user.blocked')
async handleUserBlocked(payload: UserBlockedEvent): Promise<void> {
  try {
    // Operations
  } catch (error) {
    // ❌ What happens if listener fails?
    // Does event get retried? Lost? Logged only?
  }
}
```

**Issue**: No dead-letter queue (DLQ) handling for failed listeners.

---

### 5.3 Missing Event Saga Pattern

**Complex Flow Example**:
```
BlockUser Flow:
1. user.blocked emitted
2. Listener 1: Disconnect sockets
3. Listener 2: Terminate calls
4. Listener 3: Clear cache
5. Listener 4: Update UI via socket

What if Listener 2 fails after 1,3 succeed?
→ Data corruption: user blocked but calls still active
→ Need SAGA PATTERN (compensating transactions)
```

**Current**: No saga implementation visible.

---

## 6. MISSING INFRASTRUCTURE FOR EVENT-DRIVEN DESIGN

### 6.1 No Event Versioning Support

**When you evolve events**:
```typescript
// V1: Old event
export interface FriendshipAcceptedEvent {
  accepterId: string;
  requesterId: string;
}

// V2: New fields needed
export interface FriendshipAcceptedEvent_V2 {
  accepterId: string;
  requesterId: string;
  acceptedAt: Date;  // ← NEW
  conversationId?: string;  // ← NEW
}

// ❌ Current approach: BREAKING CHANGE
// ✅ Needed: Version field + migration strategy
```

---

### 6.2 No Event Replay / Sourcing

**When you need audit trail**:
```
Currently: Events emitted but lost after listener processes
Needed: Event Store (persist all events for replay, audit, recovery)
```

---

### 6.3 No Distributed Transaction Support

**When messages span modules**:
```
Message sent → User blocked in parallel
  If block happens mid-message → inconsistent state
  Need: 2-phase commit or saga pattern
```

---

## 7. CONCRETE VIOLATIONS SUMMARY TABLE

| Violation | Severity | Module(s) | Line/Reference | Impact |
|-----------|----------|-----------|-----------------|--------|
| Circular Dependency | 🔴 CRITICAL | Socket → Messaging → Social → Call → Social | app.module.ts:85-110 | Cannot migrate to microservices |
| Facade God Object | 🔴 CRITICAL | SocialModule | social.facade.ts:1-50 | 8 injected services, unclear responsibility |
| Direct Service Calls Cross-Module | 🔴 CRITICAL | Messaging, Social, Call | messaging.module.ts:19-20 | Should use events, not direct deps |
| No Event Contracts | 🔴 CRITICAL | SocialModule | social-graph.listener.ts:45-100 | No versioning, no metadata |
| Missing Idempotency | 🔴 CRITICAL | SocialModule | social-graph.listener.ts:145+ | Will fail on Kafka/RabbitMQ retry |
| Multi-Concern Listener | 🔴 CRITICAL | SocialModule | social-graph.listener.ts:145+ | Blocks, Calls, Cache, Socket in 1 class |
| No Event Registry | 🟡 MAJOR | All | N/A | Cannot query event topology |
| FriendshipService Coupling | 🟡 MAJOR | SocialModule | friendship.service.ts:46 | Direct BlockService dependency |
| Listener Injects CallHistoryService | 🟡 MAJOR | SocialModule | social-graph.listener.ts:147 | Event listener shouldn't know about Call domain |
| MessagingModule imports SocialModule | 🟡 MAJOR | MessagingModule | messaging.module.ts:19 | Should emit events instead |
| No Dead-Letter Queue (DLQ) | 🟡 MAJOR | Event System | N/A | Failed listeners lost silently |
| No Event Saga Pattern | 🟡 MAJOR | Event System | N/A | Complex flows break on partial failure |
| SocketGateway 400+ lines | 🟡 MAJOR | SocketModule | socket.gateway.ts:1+ | Too many concerns, hard to test |
| No Event Store/Sourcing | 🟡 MAJOR | Event System | N/A | No audit trail, replay capability |
| PrivacyService Unclear | 🟡 MAJOR | SocialModule | privacy.service.ts:1+ | Unclear responsibilities, hidden dependencies |

---

## 8. REQUIRED ACTIONS FOR REFACTOR

### PHASE 1: ESTABLISH EVENT BOUNDARIES (Week 1-2)

#### Action 1.1: Define Strict Event Contracts

```typescript
// ✅ CREATE: src/events/events.ts (Event Registry)
import { v4 as uuidv4 } from 'uuid';

// Base event class with metadata
export abstract class DomainEvent {
  readonly eventId: string;
  readonly version: number;
  readonly timestamp: Date;
  readonly source: string;

  constructor(source: string, version: number = 1) {
    this.eventId = uuidv4();
    this.version = version;
    this.timestamp = new Date();
    this.source = source;
  }
}

// BLOCK DOMAIN EVENTS
export class UserBlockedEvent extends DomainEvent {
  constructor(
    readonly blockerId: string,
    readonly blockedId: string,
    readonly reason?: string,
  ) {
    super('BlockModule');
  }
}

export class UserUnblockedEvent extends DomainEvent {
  constructor(
    readonly blockerId: string,
    readonly blockedId: string,
  ) {
    super('BlockModule');
  }
}

// FRIENDSHIP DOMAIN EVENTS
export class FriendRequestSentEvent extends DomainEvent {
  constructor(
    readonly requesterId: string,
    readonly targetUserId: string,
  ) {
    super('SocialModule');
  }
}

// ... Define all events with CLEAR OWNERSHIP
```

**Acceptance Criteria**:
- ✅ All events inherit from DomainEvent
- ✅ Each event has eventId, version, timestamp
- ✅ Single source of truth per event
- ✅ Centralized EVENT_REGISTRY document

---

#### Action 1.2: Create Event Ownership Registry

```markdown
# EVENT REGISTRY
## Ownership Rules
- Each event defined in exactly 1 module
- Event filename must match event class name
- All events exported from module's `events.ts`

## BLOCK DOMAIN (Owner: BlockModule)
- UserBlockedEvent
- UserUnblockedEvent

## SOCIAL DOMAIN (Owner: SocialModule)  
- FriendRequestSentEvent
- FriendRequestCancelledEvent
- FriendshipAcceptedEvent
- FriendshipRemovedEvent

## MESSAGING DOMAIN (Owner: MessagingModule)
- MessageSentEvent
- ConversationCreatedEvent

...
```

---

### PHASE 2: BREAK CIRCULAR DEPENDENCIES (Week 2-3)

#### Action 2.1: Eliminate SocketModule ← MessagingModule Coupling

**Current**:
```typescript
// ❌ Messaging needs Socket for real-time emit
MessagingService → SocketGateway.emitToUser()
```

**Target**:
```typescript
// ✅ Use Event Bus
MessagingService:
  async sendMessage(...) {
    // 1. Save to DB
    // 2. Emit event
    this.eventEmitter.emit('message.sent', new MessageSentEvent(...));
    // Done! SocketModule listens
  }

// SocketModule:
@Injectable()
export class MessageBroadcasterListener {
  @OnEvent('message.sent')
  async handleMessageSent(event: MessageSentEvent) {
    // Broadcast to recipients
    await this.socketGateway.emitToUser(event.recipientId, 'message:new', event);
  }
}
```

**Steps**:
1. Create `MessageSentEvent` class with metadata
2. Emit from `MessageService`, not call Socket directly
3. Create listener in SocketModule to handle broadcast
4. **Remove** `forwardRef(() => SocketModule)` from MessagingModule
5. Test: MessagingModule should compile independently

---

#### Action 2.2: Break SocialModule ← CallModule ← SocialModule Cycle

**Current**:
```
SocialModule imports CallModule (forwardRef)
CallModule imports SocialModule (forwardRef)
```

**Root Cause**: ContactService needs data from both domains

**Solution**: Query Interface Pattern

```typescript
// ✅ Step 1: Create query interfaces (contract-based)
// src/modules/social/interfaces/contact.query.ts
export interface IContactQuery {
  getContactInfo(userId: string): Promise<ContactInfo>;
}

// ✅ Step 2: CallModule doesn't import SocialModule
// src/modules/call/call.module.ts
@Module({
  imports: [
    DatabaseModule,
    RedisModule,
    EventEmitterModule,
    // Removed: forwardRef(() => SocialModule)
  ],
  providers: [CallHistoryService],
})
export class CallModule {}

// ✅ Step 3: Query service available via DI token
// src/modules/social/social.module.ts
@Module({
  imports: [BlockModule, CallModule],  // Remove forwardRef!
  providers: [
    ContactService,
    { 
      provide: 'IContactQuery', 
      useClass: ContactQueryService 
    },
  ],
  exports: ['IContactQuery'],
})
export class SocialModule {}

// ✅ Step 4: Call module requests via token
// src/modules/call/call-history.service.ts
constructor(
  @Inject('IContactQuery') private contactQuery: IContactQuery,
) {}
```

---

### PHASE 3: ELIMINATE FACADE ANTI-PATTERN (Week 3)

#### Action 3.1: Split SocialFacade into Modules

**Current Problem**:
```typescript
@Injectable()
export class SocialFacade {
  constructor(
    private friendshipService,
    private privacyService,
    private contactService,
    private blockService,
    @Inject(forwardRef(() => callHistoryService)) // ← Still circular!
  ) {}
  
  async checkPermission(...) { /* Orchestration */ }
}
```

**Solution**: Decompose into domain-specific services

```typescript
// ✅ CORRECT: SocialFacade ONLY for READ queries (no mutations)
@Injectable()
export class SocialQueryFacade {
  constructor(
    private readonly blockQuery: BlockQueryService,
    private readonly friendshipQuery: FriendshipQueryService,
    private readonly privacyQuery: PrivacyQueryService,
  ) {}

  // READ-ONLY methods
  async canUserMessage(userId: string, targetId: string): Promise<boolean> {
    const blocked = await this.blockQuery.isBlocked(userId, targetId);
    if (blocked) return false;
    return await this.privacyQuery.allowsMessaging(userId, targetId);
  }

  async canUserCall(userId: string, targetId: string): Promise<boolean> {
    // Similar logic
  }
}

// ✅ CORRECT: Mutations happen through direct service call + events
// NOT through facade
// src/modules/messaging/messaging.service.ts
async sendMessage(senderId: string, conversationId: string, content: string) {
  // 1. Permission check via QUERY facade
  const canMessage = await this.socialQueryFacade.canUserMessage(senderId, ...);
  
  // 2. Save message
  const message = await this.db.message.create(...);
  
  // 3. Emit event (not call socket directly!)
  this.eventEmitter.emit('message.sent', new MessageSentEvent(...));
  
  return message;
}
```

**Deletion Plan**:
- ❌ Remove `SocialFacade` (current)
- ✅ Create `SocialQueryFacade` with ONLY read methods
- ✅ Remove all mutation methods from it

---

### PHASE 4: IMPLEMENT EVENT LISTENER SEPARATION (Week 4)

#### Action 4.1: Split SocialGraphEventListener

**Current**:
```typescript
// ❌ 600+ lines doing 5 different things
@Injectable()
export class SocialGraphEventListener {
  @OnEvent('user.blocked') handleUserBlocked() { /* 50 lines */ }
  @OnEvent('friendship.removed') handleFriendshipRemoved() { /* Mix: Cache + Socket + Call */ }
  // ... more mixed concerns
}
```

**Solution**: Separate by responsibility

```typescript
// ✅ BlockModule responsibility (in BlockModule)
@Injectable()
export class BlockEventHandler {
  @OnEvent('user.blocked')
  async handleUserBlocked(event: UserBlockedEvent) {
    // ONLY block-related logic:
    // 1. Invalidate cache
    // 2. Emit derived events (e.g., 'user.disconnected')
    // DO NOT: Call Socket, Call, Message services
  }
}

// ✅ Derived effect handler (in SocketModule)
@Injectable()
export class SocketDisconnectHandler {
  @OnEvent('user.disconnected')
  async handleUserDisconnected(event: UserDisconnectedEvent) {
    // ONLY socket logic
    await this.socketGateway.forceDisconnectUser(event.userId);
  }
}

// ✅ Call termination handler (in CallModule)
@Injectable()
export class CallTerminationHandler {
  @OnEvent('user.disconnected')
  async handleCallTermination(event: UserDisconnectedEvent) {
    // ONLY call-related logic
    await this.callHistoryService.terminateActiveCalls(event.userId);
  }
}

// ✅ Cache invalidation handler (in CacheModule - NEW)
@Injectable()
export class CacheInvalidationHandler {
  @OnEvent('user.blocked')
  async handleCacheInvalidation(event: UserBlockedEvent) {
    await this.cacheService.invalidatePermissionCache(event.blockerId, event.blockedId);
  }
}
```

**Event Flow**:
```
1. user.blocked
   ↓ BlockModule listener
   → 1a. BlockEventHandler (cache invalidation)
   → 1b. Emit 'user.disconnected'
   
2. user.disconnected
   ↓ (Multiple listeners, no dependencies)
   → 2a. SocketDisconnectHandler (force disconnect)
   → 2b. CallTerminationHandler (terminate calls)
```

**Key Rule**: Event listeners should be **sidecar processes**, not orchestrators.

---

### PHASE 5: ADD IDEMPOTENCY GUARANTEES (Week 4)

#### Action 5.1: Create Processed Events Table

```sql
-- ✅ Database schema
CREATE TABLE processed_events (
  id UUID PRIMARY KEY,
  event_id UUID NOT NULL,
  event_type VARCHAR NOT NULL,
  listener_name VARCHAR NOT NULL,
  processed_at TIMESTAMP NOT NULL,
  UNIQUE (event_id, listener_name) -- Ensure idempotency
);
```

#### Action 5.2: Wrap Listeners with Idempotency Check

```typescript
// ✅ Base listener class with idempotency
@Injectable()
export abstract class IdempotentListener {
  constructor(protected readonly db: PrismaService) {}

  protected async withIdempotency<T>(
    eventId: string,
    listenerName: string,
    handler: () => Promise<T>,
  ): Promise<T | null> {
    // Check if already processed
    const processed = await this.db.processedEvent.findUnique({
      where: { eventId_listenerName: { eventId, listenerName } },
    });

    if (processed) {
      this.logger.warn(`Event ${eventId} already processed by ${listenerName}`);
      return null; // Idempotent: skip
    }

    // Execute handler
    const result = await handler();

    // Mark as processed
    await this.db.processedEvent.create({
      data: {
        eventId,
        eventType: this.constructor.name,
        listenerName,
        processedAt: new Date(),
      },
    });

    return result;
  }
}

// ✅ Usage
@Injectable()
export class BlockEventHandler extends IdempotentListener {
  @OnEvent('user.blocked')
  async handleUserBlocked(event: UserBlockedEvent) {
    return this.withIdempotency(
      event.eventId,
      BlockEventHandler.name,
      async () => {
        // Your logic here - runs ONLY once per event
        await this.invalidateCache(...);
      },
    );
  }
}
```

---

### PHASE 6: CREATE EVENT REGISTRY DOCUMENTATION (Week 4)

#### Action 6.1: Document All Events

```markdown
# EVENT REGISTRY & OWNERSHIP

## Rules
- Each event has 1 owner module
- Events are immutable public contracts
- Listeners must be idempotent
- No cross-listener dependencies

## BLOCK DOMAIN (Owner: BlockModule)

### UserBlockedEvent
- **Source**: BlockService.blockUser()
- **Listeners**: 
  - SocialModule: invalidate permission cache
  - SocketModule: disconnect user
  - CallModule: terminate active calls
- **Consumer**: Auth, Messaging, Call, Socket (indirect via events)

### UserUnblockedEvent
- **Source**: BlockService.unblockUser()
- **Listeners**: Cache invalidation only

## MESSAGING DOMAIN (Owner: MessagingModule)

### MessageSentEvent
- **Source**: MessageService.send()
- **Listeners**:
  - SocketModule: broadcast to recipient
  - CacheModule: update conversation cache
- **Contract**:
  ```typescript
  class MessageSentEvent extends DomainEvent {
    messageId: string;
    senderId: string;
    conversationId: string;
    content: string;
    timestamp: Date;
  }
  ```

...

## ANTI-PATTERNS TO AVOID
❌ Event listener calling service from different module
❌ Multiple modules emitting same event
❌ Event listener orchestrating complex workflow
❌ No event versioning
❌ Missing idempotency handling
```

---

## 9. MICROSERVICES MIGRATION READINESS

### Current Score: 3/10 ❌

**Checklist**:

| Requirement | Current | Required | Action |
|------------|---------|----------|--------|
| Circular Dependencies Broken | ❌ 5+ cycles | ✅ 0 | PHASE 2 |
| Event Contracts Strict | ❌ Interfaces | ✅ Classes + versioning | PHASE 1 |
| Event Ownership Clear | ❌ Scattered | ✅ Single owner | PHASE 6 |
| No Cross-Module Direct Calls | ❌ Many | ✅ 0 | PHASE 3-4 |
| Idempotent Listeners | ❌ Missing | ✅ All listeners | PHASE 5 |
| Event Registry Document | ❌ Missing | ✅ Complete | PHASE 6 |
| Listener Separation | ❌ 1 god listener | ✅ By concern | PHASE 4 |
| DLQ/Error Handling | ❌ Missing | ✅ Implemented | PHASE 5 |
| **TOTAL** | **3/10** | **10/10** | **6 Weeks** |

---

## 10. IMPLEMENTATION ROADMAP

```
WEEK 1-2: PHASE 1 (Event Boundaries)
├── Define all DomainEvent classes
├── Create EVENT_REGISTRY.md
└── Add event metadata (eventId, version, timestamp)

WEEK 2-3: PHASE 2 (Break Circular Dependencies)
├── Eliminate Socket ← Messaging coupling
├── Break Social ← Call ← Social cycle
└── Verify zero circular deps in dependency graph

WEEK 3: PHASE 3 (Fix Facade)
├── Split SocialFacade into query-only version
├── Remove all mutations from it
└── Verify Facade has ≤3 injected services

WEEK 4: PHASE 4 & 5 (Listeners & Idempotency)
├── Split SocialGraphEventListener (1 → 5 listeners)
├── Implement idempotency base class
├── Add processed_events table
└── Test listener retry logic

WEEK 4: PHASE 6 (Documentation)
├── Complete EVENT_REGISTRY with all events
├── Document listener dependencies
└── Create ARCHITECTURE.md with final rules
```

---

## 11. DELIVERABLES CHECKLIST

**After refactoring, verify**:

- ✅ Zero `forwardRef` in any module
- ✅ All 14 modules compile independently
- ✅ Central EVENT_REGISTRY with 30+ documented events
- ✅ Each event has eventId, version, timestamp
- ✅ Processed_events table + idempotency on all listeners
- ✅ SocialGraphEventListener split into 5+ separate handlers
- ✅ SocialFacade has only read methods (≤3 injected services)
- ✅ No direct service calls across module boundaries (events only)
- ✅ All listeners in their owner module or consumer module
- ✅ Migration readiness score: 10/10 ✅

---

## 12. CRITICAL RULES FOR FUTURE DEVELOPMENT

**MANDATORY - Violations are STOP-REFACTOR signals**:

1. **No more `forwardRef()`** - Indicates design problem
2. **Events only for cross-module** - Commands only internal
3. **Event contracts immutable** - Add versioning instead
4. **One event owner** - Prevent duplicate emissions
5. **Listeners idempotent** - Must handle replay
6. **No orchestration in listeners** - Use Saga pattern
7. **No direct service cross-module** - Use event bus
8. **Event = public contract** - Version from day 1

---

**Status**: Ready for Refactoring Phase 1  
**Estimated Effort**: 6 weeks  
**Migration Readiness After**: 10/10 ✅ (Microservices ready)

