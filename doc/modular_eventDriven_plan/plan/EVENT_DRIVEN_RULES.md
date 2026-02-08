# 📋 EVENT-DRIVEN DESIGN RULES & CHECKLIST

**MANDATORY RULES FOR THIS PROJECT**  
*Violations = Stop development, fix first*

---

## RULE 1: STRICT EVENT CONTRACTS

### ✅ REQUIRED

```typescript
// Every event MUST be a concrete class
export class UserBlockedEvent {
  // ✅ Required metadata
  readonly eventId: string;           // Unique per emission
  readonly version: number;           // For evolution
  readonly timestamp: Date;           // For ordering
  readonly source: string;            // Which module owns this?
  
  // ✅ Event-specific data
  readonly blockerId: string;
  readonly blockedId: string;
  readonly reason?: string;
  
  constructor(blockerId: string, blockedId: string, reason?: string) {
    this.eventId = uuidv4();          // ← Never use magic strings!
    this.version = 1;
    this.timestamp = new Date();
    this.source = 'BlockModule';      // ← Explicit ownership
    this.blockerId = blockerId;
    this.blockedId = blockedId;
    this.reason = reason;
  }
}
```

### ❌ FORBIDDEN

```typescript
// ❌ NO interfaces (runtime contract missing)
export interface UserBlockedEvent {
  blockerId: string;
  blockedId: string;
}

// ❌ NO magic strings
this.eventEmitter.emit('user.blocked', { blockerId, blockedId });

// ❌ NO anonymous objects
new Promise(resolve => {
  this.eventEmitter.emit('user.blocked', {
    blockerId: '123',
    blockedId: '456',
    // Where's eventId? version? timestamp?
  });
});

// ❌ NO version in event name
export class UserBlockedEventV2 { }  // Store version in EVENT, not class name
```

### ✅ DO: Runtime Validation

```typescript
@Injectable()
export class EventValidator {
  validate(event: unknown): DomainEvent {
    if (!event || typeof event !== 'object') {
      throw new Error('Event must be object');
    }
    if (!('eventId' in event) || typeof event.eventId !== 'string') {
      throw new Error('Event missing eventId');
    }
    if (!('version' in event) || typeof event.version !== 'number') {
      throw new Error('Event missing version');
    }
    if (!('timestamp' in event) || !(event.timestamp instanceof Date)) {
      throw new Error('Event missing timestamp');
    }
    return event as DomainEvent;
  }
}
```

---

## RULE 2: EVENT vs COMMAND (Critical Distinction)

| Aspect | Event | Command |
|--------|-------|---------|
| **Coupling** | Loose (fire-and-forget) | Tight (request-response) |
| **Scope** | Cross-module | Internal to module |
| **Direction** | Broadcast to unknown listeners | Send to known handler |
| **Timing** | Asynchronous (eventual consistency) | Synchronous or async |
| **Response** | No response expected | Response required |
| **Example** | `user.blocked` (past tense) | `blockUser()` method call |

### ✅ CORRECT USAGE

```typescript
// ✅ COMMAND: Only internal to module
async blockUser(blockerId: string, blockedId: string) {
  // Internal method call - tight coupling acceptable
  this.validateBlockRules(blockerId, blockedId);
  const block = await this.prisma.block.create({...});
  
  // After successful operation, emit event for others
  this.eventEmitter.emit('user.blocked', new UserBlockedEvent(blockerId, blockedId));
}

// ✅ EVENT: Cross-module communication
@OnEvent('user.blocked')
async handleUserBlocked(event: UserBlockedEvent) {
  // Don't call blockService.doSomething()
  // Instead, react to the fact that user was blocked
  await this.socketGateway.disconnectUser(event.blockedId);
}
```

### ❌ WRONG USAGE

```typescript
// ❌ COMMAND used cross-module
@Injectable()
export class MessageService {
  constructor(
    private blockService: BlockService  // ← Wrong coupling!
  ) {}

  async sendMessage(senderId: string, recipientId: string, content: string) {
    // ❌ Direct cross-module command
    const isBlocked = await this.blockService.isBlocked(senderId, recipientId);
    
    // Should instead:
    // 1. Query permission cache or
    // 2. Emit event and wait for response or
    // 3. Check permission in handler before sending
  }
}

// ❌ EVENT used internal to module
async sendFriendRequest(requesterId: string, targetId: string) {
  // ❌ Should use direct method call
  this.eventEmitter.emit('friendRequest.send', { requesterId, targetId });
  
  // Should instead:
  // const result = this.sendFriendRequest_Internal(requesterId, targetId);
}
```

---

## RULE 3: EVENT NAMING & SEMANTICS

### ✅ CORRECT: Past Tense, Domain-Driven

```typescript
// ✅ PAST TENSE (what happened)
export class UserBlockedEvent { }           // ✓ Good
export class FriendshipAcceptedEvent { }    // ✓ Good
export class MessageSentEvent { }           // ✓ Good
export class ConversationCreatedEvent { }   // ✓ Good

// ✅ DOMAIN-DRIVEN (includes domain)
export class BlockModule_UserBlockedEvent { }      // ✓ Acceptable (scope clarity)
export class SocialModule_FriendshipAcceptedEvent { } // ✓ Acceptable

// ✅ NO internal implementation details
export class FriendshipAcceptedViaREST { }  // ✓ Acceptable (channel info)
export class FriendshipAcceptedViaSocket { } // ✓ Acceptable

// ✅ AVOID: Business-specific action verbs
export class NotificationSent { }           // ✓ Better than sendNotification
export class CacheFlushed { }              // ✓ Better than flushCache
```

### ❌ INCORRECT: Imperative, Action-Oriented

```typescript
// ❌ PRESENT/FUTURE TENSE (imperative)
export class BlockUser { }              // ✗ Should be UserBlocked
export class SendFriendRequest { }      // ✗ Should be FriendRequestSent
export class RemoveFromGroup { }        // ✗ Should be UserRemovedFromGroup
export class DisconnectSocket { }       // ✗ Should be SocketDisconnected

// ❌ LEAKS implementation detail
export class BlockUserInDatabase { }    // ✗ Internal implementation
export class FlushRedisCache { }        // ✗ Internal detail
export class SendNotification { }       // ✗ Imperative (use NotificationSent)

// ❌ VAGUE or non-domain
export class Update { }                 // ✗ Too vague
export class Action { }                 // ✗ Too generic
```

---

## RULE 4: EVENT VERSIONING & EVOLUTION

### ✅ CORRECT: Version in Event

```typescript
// Version 1 (Original)
export class UserBlockedEvent {
  readonly version: number = 1;
  readonly eventId: string;
  readonly timestamp: Date;
  readonly blockerId: string;
  readonly blockedId: string;
}

// Version 2 (Add new field)
export class UserBlockedEvent {
  readonly version: number = 2;           // ← Increment version
  readonly eventId: string;
  readonly timestamp: Date;
  readonly blockerId: string;
  readonly blockedId: string;
  readonly reason?: string;               // ← New optional field
  readonly blockedAt?: Date;              // ← New optional field
}

// Listener handles multiple versions
@OnEvent('user.blocked')
async handleUserBlocked(event: UserBlockedEvent) {
  if (event.version === 1) {
    // Handle V1 logic (legacy)
  } else if (event.version === 2) {
    // Handle V2 logic (new)
  }
}
```

### ❌ WRONG: Version in Class Name

```typescript
// ❌ DON'T do this
export class UserBlockedEventV1 { }
export class UserBlockedEventV2 { }

// Problem: Can't cast properly, listeners need to check both classes
@OnEvent('user.blocked')
async handle(event: UserBlockedEventV1 | UserBlockedEventV2) {
  // Messy union types
}
```

---

## RULE 5: EVENT OWNERSHIP - ONE MODULE, ONE OWNER

### ✅ CORRECT: Single Owner

```typescript
// ✅ OWNERSHIP: BlockModule owns block events
// File: src/modules/block/events/block.events.ts
export class UserBlockedEvent { readonly source = 'BlockModule'; }
export class UserUnblockedEvent { readonly source = 'BlockModule'; }

// ✅ OWNERSHIP: SocialModule owns friendship events
// File: src/modules/social/events/friendship.events.ts
export class FriendRequestSentEvent { readonly source = 'SocialModule'; }
export class FriendshipAcceptedEvent { readonly source = 'SocialModule'; }

// ✅ OWNERSHIP: MessagingModule owns message events
// File: src/modules/messaging/events/message.events.ts
export class MessageSentEvent { readonly source = 'MessagingModule'; }
export class ConversationCreatedEvent { readonly source = 'MessagingModule'; }

// Central Registry
export const EVENT_REGISTRY = {
  BlockModule: [UserBlockedEvent, UserUnblockedEvent],
  SocialModule: [FriendRequestSentEvent, FriendshipAcceptedEvent],
  MessagingModule: [MessageSentEvent, ConversationCreatedEvent],
};
```

### ❌ WRONG: Multiple Emitters

```typescript
// ❌ Multiple modules emit same event
// src/modules/block/block.service.ts
this.eventEmitter.emit('user.blocked', event);

// src/modules/friendship/friendship.service.ts
this.eventEmitter.emit('user.blocked', event);  // ← DUPLICATE!

// Problem: Different event structures?
// Problem: Listener can't know who emitted?
// Problem: Audit trail is confused
```

---

## RULE 6: IDEMPOTENCY GUARANTEE

### ✅ REQUIRED

```typescript
// Step 1: Event MUST have eventId
export class UserBlockedEvent {
  readonly eventId: string;  // ← Unique per emission
}

// Step 2: Database table to track processed events
CREATE TABLE processed_events (
  id UUID PRIMARY KEY,
  event_id UUID NOT NULL,
  listener_name VARCHAR NOT NULL,
  processed_at TIMESTAMP,
  UNIQUE (event_id, listener_name)  -- Idempotency key
);

// Step 3: Listener wrapped with idempotency check
@Injectable()
export class BlockEventHandler extends IdempotentListener {
  @OnEvent('user.blocked')
  async handleUserBlocked(event: UserBlockedEvent) {
    return this.withIdempotency(
      event.eventId,
      this.constructor.name,
      async () => {
        // Handler body
        // Runs ONLY once per event, even if RabbitMQ retries
      }
    );
  }
}

// Step 4: Base class implements idempotency logic
@Injectable()
export abstract class IdempotentListener {
  async withIdempotency<T>(
    eventId: string,
    listenerName: string,
    handler: () => Promise<T>,
  ): Promise<T | null> {
    // Check if already processed
    const processed = await this.prisma.processedEvent.findUnique({
      where: { eventId_listenerName: { eventId, listenerName } },
    });

    if (processed) {
      this.logger.warn(`Event ${eventId} already processed by ${listenerName}`);
      return null;  // Idempotent: skip execution
    }

    // Execute handler
    const result = await handler();

    // Mark as processed
    await this.prisma.processedEvent.create({
      data: {
        eventId,
        listenerName,
        processedAt: new Date(),
      },
    });

    return result;
  }
}
```

### ❌ WRONG: No Idempotency

```typescript
// ❌ If event is processed twice (broker retry)
@OnEvent('user.blocked')
async handleUserBlocked(event: UserBlockedEvent) {
  // No idempotency check - runs TWICE
  await this.socketGateway.disconnectUser(event.blockedId);  // Runs twice! ✗
  await this.cache.clear(`user:${event.blockedId}`);         // Runs twice! ✗
}

// Result: Duplicate disconnections, cache thrashing, data corruption
```

---

## RULE 7: NO EVENT CHAINING / PINBALL EFFECT

### ✅ CORRECT: Event Termination

```typescript
// Event Flow: Single chain, no loops

1. user.blocked event emitted
   ↓
2. BlockEventHandler (BlockModule)
   - Invalidates cache
   - Emits: 'user.disconnected' (DERIVED event, terminal)
   ↓
3a. SocketDisconnectHandler (SocketModule)
    - Force disconnects socket
    - DONE (no re-emission)
    
3b. CallTerminationHandler (CallModule)
    - Terminates active calls
    - Emits: 'call.terminated' (scoped to Call domain)
    
4. (Optional) Call listeners can emit more events
   - But NEVER loop back to 'user.blocked'
```

### ❌ WRONG: Infinite Loop Risk

```typescript
// ❌ PINBALL: Each listener re-emits the same event
1. user.blocked
   ↓
2. BlockEventHandler
   - Calls socketService.disconnect()
   - Emits: 'user.blocked' again (LOOP!)
   ↓
3. BlockEventHandler triggers again
   - Infinite loop!
   
// Even worse:
1. user.blocked
   ↓
2. Handler A: Emits 'user.disconnected'
   ↓
3. Handler B: Emits 'user.blocked' (back to step 1)
   ↓
   INFINITE LOOP!
```

### ✅ Prevention Pattern

```typescript
// Rule 1: Listeners emit DERIVED events only
@OnEvent('user.blocked')
async handleUserBlocked(event: UserBlockedEvent) {
  // ✓ OK: Emit a different event (terminal signal)
  this.eventEmitter.emit(
    'user.disconnected',
    new UserDisconnectedEvent(event.blockedId, 'blocked')
  );
  
  // ✗ WRONG: Re-emit same event
  // this.eventEmitter.emit('user.blocked', event);
}

// Rule 2: Listener execution is IDEMPOTENT (won't repeat on retry)
// Rule 3: Each listener has clear terminal responsibility
// Rule 4: Complex flows need Saga Orchestrator (not listener chain)
```

---

## RULE 8: LISTENER SEPARATION BY CONCERN

### ✅ CORRECT: Listeners Grouped by Responsibility

```
BlockModule/
  ├── block.service.ts           (Emit events)
  └── listener/
      └── block.listener.ts       (ONLY: invalidate cache)

SocialModule/
  ├── friendship.service.ts      (Emit events)
  └── listener/
      ├── friendship-cache.listener.ts   (Invalidate cache)
      └── friendship-socket.listener.ts  (Broadcast to socket)

SocketModule/
  ├── socket.gateway.ts
  └── listener/
      ├── user-connect.listener.ts       (Handle connection)
      ├── message-broadcast.listener.ts  (Broadcast messages)
      └── presence-update.listener.ts    (Update presence)

CallModule/
  ├── call.service.ts
  └── listener/
      ├── call-termination.listener.ts   (Terminate on block)
      └── call-recording.listener.ts     (Record on terminate)

CacheModule/ (New)
  ├── cache.service.ts
  └── listener/
      └── cache-invalidation.listener.ts (Listen to ALL domain events)
```

### ❌ WRONG: God Listener

```typescript
// ❌ ONE listener doing 600+ lines of everything
@Injectable()
export class SocialGraphEventListener {
  // Block handling (40 lines)
  @OnEvent('user.blocked')
  async handleUserBlocked() { ... }
  
  // Friendship handling (60 lines)
  @OnEvent('friendship.removed')
  async handleFriendshipRemoved() { ... }
  
  // Cache (20 lines)
  @OnEvent('cache.invalidate')
  async handleCache() { ... }
  
  // Socket (50 lines)
  @OnEvent('user.connected')
  async handleUserConnected() { ... }
  
  // + 10 more handlers
  // TOTAL: 600 lines, unmaintainable, untestable
}
```

---

## RULE 9: NO DIRECT SERVICE CALLS ACROSS MODULES

### ✅ CORRECT: Event-Based Communication

```typescript
// ✅ Module A: Emit event
// src/modules/messaging/message.service.ts
@Injectable()
export class MessageService {
  async sendMessage(senderId: string, recipientId: string, content: string) {
    // 1. Permission check (internal or query interface)
    // 2. Save message
    const message = await this.db.message.create({...});
    
    // 3. Emit event (not call socket directly!)
    this.eventEmitter.emit(
      'message.sent',
      new MessageSentEvent(message.id, senderId, recipientId, content)
    );
    
    return message;
  }
}

// ✅ Module B: Listen to event
// src/modules/socket/listener/message-broadcast.listener.ts
@Injectable()
export class MessageBroadcasterListener {
  @OnEvent('message.sent')
  async handleMessageSent(event: MessageSentEvent) {
    // Broadcast to recipient
    await this.socketGateway.emitToUser(
      event.recipientId,
      'message:new',
      event
    );
  }
}
```

### ❌ WRONG: Direct Service Calls

```typescript
// ❌ Module A: Calls Module B directly
// src/modules/messaging/message.service.ts
@Injectable()
export class MessageService {
  constructor(
    private socketGateway: SocketGateway,  // ← Cross-module direct call!
    private blockService: BlockService,     // ← Cross-module!
    private privacyService: PrivacyService, // ← Cross-module!
  ) {}

  async sendMessage(senderId: string, recipientId: string, content: string) {
    // ❌ Direct call to other modules
    const allowed = await this.blockService.canMessage(senderId, recipientId);
    if (!allowed) throw new Error('Blocked');
    
    const permission = await this.privacyService.checkPermission(...);
    if (!permission) throw new Error('Not allowed');
    
    // ❌ Direct call to socket
    await this.socketGateway.emitToUser(recipientId, 'message:new', {...});
  }
}

// Problems:
// - Can't scale MessageModule independently
// - Must include BlockModule, PrivacyService, SocketModule in deployment
// - Cannot migrate to microservices (different JVMs)
// - Circular dependencies
```

---

## RULE 10: FACADE PATTERN MISUSE PREVENTION

### ✅ CORRECT: Facade for Query/Read Interface Only

```typescript
// ✅ CORRECT: Facade = Read-only interface
@Injectable()
export class SocialQueryFacade {
  constructor(
    private readonly blockQuery: BlockQueryService,        // 1
    private readonly friendshipQuery: FriendshipQueryService, // 2
    private readonly privacyQuery: PrivacyQueryService,   // 3
  ) {}
  
  // ✅ ONLY read methods
  async canUserMessage(userId: string, targetId: string): Promise<boolean> {
    const blocked = await this.blockQuery.isBlocked(userId, targetId);
    if (blocked) return false;
    return await this.privacyQuery.allowsMessaging(userId, targetId);
  }
  
  async canUserCall(userId: string, targetId: string): Promise<boolean> {
    // Similar logic
  }
  
  // ✅ NO mutations in facade!
  // Mutations go through service + events
}

// ✅ Usage:
// src/modules/messaging/message.service.ts
async sendMessage(senderId: string, recipientId: string, content: string) {
  // 1. Permission check via facade
  const canSend = await this.socialQueryFacade.canUserMessage(senderId, recipientId);
  if (!canSend) throw new ForbiddenException();
  
  // 2. Save and emit (not through facade!)
  const message = await this.db.message.create({...});
  this.eventEmitter.emit('message.sent', new MessageSentEvent(...));
}
```

### ❌ WRONG: Facade as God Object with Mutations

```typescript
// ❌ WRONG: Too many services, contains business logic
@Injectable()
export class SocialFacade {
  constructor(
    private friendshipService: FriendshipService,
    private privacyService: PrivacyService,
    private contactService: ContactService,
    private blockService: BlockService,
    @Inject(forwardRef(() => callHistoryService))  // ← Still using forwardRef!
    private callHistoryService: CallHistoryService,
    private redisService: RedisService,
    private prisma: PrismaService,
  ) {}
  
  // ❌ Business logic in facade (should be in service)
  async checkPermission(requesterId: string, targetId: string, action: string) {
    const isBlocked = await this.blockService.isBlocked(requesterId, targetId);
    if (isBlocked) return { allowed: false };
    return this.privacyService.checkPermission(requesterId, targetId, action);
  }
  
  // ❌ Mutations in facade (should call service + emit event)
  async blockUser(blockerId: string, blockedId: string) {
    // Logic that should be in BlockService
    await this.prisma.block.create({...});
    // Emit event - but then where?
  }
}

// Problems:
// - 7-8 injected services (God object)
// - Business logic scattered across Facade + Service
// - Mutations and queries mixed
// - Still has circular dependencies via forwardRef
// - Cannot be tested independently
```

---

## RULE 11: NO MISSING EVENT METADATA

### ✅ REQUIRED EVENT STRUCTURE

```typescript
export abstract class DomainEvent {
  abstract readonly eventType: string;        // 'user.blocked'
  
  readonly eventId: string;                   // UUID: Unique per emission
  readonly version: number;                   // 1, 2, 3... for evolution
  readonly timestamp: Date;                   // When emitted
  readonly source: string;                    // 'BlockModule'
  readonly correlationId?: string;            // Link related events
  readonly causationId?: string;              // What caused this
  readonly userId?: string;                   // Audit: who triggered
  readonly traceId?: string;                  // Distributed tracing
  
  protected constructor(
    eventType: string,
    source: string,
    version: number = 1,
  ) {
    this.eventType = eventType;
    this.source = source;
    this.version = version;
    this.eventId = uuidv4();
    this.timestamp = new Date();
  }
}

export class UserBlockedEvent extends DomainEvent {
  constructor(
    readonly blockerId: string,
    readonly blockedId: string,
    readonly reason?: string,
  ) {
    super('user.blocked', 'BlockModule', 1);
  }
}
```

### ❌ MISSING METADATA

```typescript
// ❌ Missing eventId, version, timestamp
export interface UserBlockedEvent {
  blockerId: string;
  blockedId: string;
}

// ❌ Cannot track, version, or guarantee idempotency
```

---

## RULE 12: NO LISTENER INTERDEPENDENCIES

### ✅ CORRECT: Independent Listeners

```typescript
// Each listener is independent - doesn't depend on other listeners

@OnEvent('user.blocked')
async handleBlockCacheInvalidation(event: UserBlockedEvent) {
  // ONLY: Cache logic
  await this.cache.invalidate(...);
}

@OnEvent('user.blocked')
async handleBlockSocketDisconnect(event: UserBlockedEvent) {
  // ONLY: Socket logic
  await this.socketGateway.disconnectUser(event.blockedId);
}

@OnEvent('user.blocked')
async handleBlockCallTermination(event: UserBlockedEvent) {
  // ONLY: Call logic
  await this.callService.terminateActiveCalls(event.blockedId);
}

// All run in parallel, independent
// No one listener waits for another
```

### ❌ WRONG: Listener Choreography / Dependencies

```typescript
// ❌ Listener 1 waits for Listener 2 (creates coupling)
@OnEvent('user.blocked')
async handleUserBlocked_Master(event: UserBlockedEvent) {
  // Wait for socket to disconnect (bad!)
  await this.socketListener.handleDisconnect(event);
  
  // Then call
  await this.callListener.handleTermination(event);
}

// Problems:
// - Listener A depends on Listener B (tight coupling)
// - Listener order matters (fragile)
// - Cannot parallelize
// - Hard to test independently
```

---

## RULE 13: ERROR HANDLING IN LISTENERS

### ✅ CORRECT: Fail-Safe with DLQ

```typescript
@Injectable()
export class BlockEventHandler {
  @OnEvent('user.blocked')
  async handleUserBlocked(event: UserBlockedEvent) {
    try {
      return this.withIdempotency(
        event.eventId,
        this.constructor.name,
        async () => {
          await this.invalidateCache(event);
        }
      );
    } catch (error) {
      this.logger.error(`Failed to handle user.blocked: ${error.message}`);
      
      // Send to Dead-Letter Queue (DLQ)
      await this.dlqService.sendToDLQ({
        eventId: event.eventId,
        listenerName: this.constructor.name,
        error: error.message,
        originalEvent: event,
      });
      
      // Decide: Re-throw or continue?
      // Usually: Log + DLQ, don't crash
      throw error;  // NestJS will retry if configured
    }
  }
}

// DLQ Table
CREATE TABLE event_dlq (
  id UUID PRIMARY KEY,
  event_id UUID NOT NULL,
  listener_name VARCHAR NOT NULL,
  error_message TEXT,
  original_event JSONB,
  created_at TIMESTAMP,
  processed BOOLEAN DEFAULT FALSE
);
```

### ❌ WRONG: Silent Failures

```typescript
// ❌ Error swallowed silently
@OnEvent('user.blocked')
async handleUserBlocked(event: UserBlockedEvent) {
  try {
    await this.invalidateCache(event);
  } catch (error) {
    // ❌ No logging, no DLQ, error lost!
    // Event never processed, but nobody knows
  }
}

// ❌ Result: Data inconsistency, no way to recover
```

---

## CHECKLIST: Before Committing Event-Driven Code

```
□ Event is a concrete class (not interface)
□ Event has eventId, version, timestamp
□ Event name is past tense (UserBlocked, not BlockUser)
□ Event source is set explicitly
□ Event ownership is documented (which module owns it?)
□ Listener is idempotent (withIdempotency wrapper)
□ Listener handles single concern (max 3 injected services)
□ Listener has error handling + DLQ
□ No forwardRef() used in imports
□ No direct service calls between modules
□ Facade (if used) is READ-ONLY
□ No event chaining / pinball effects
□ EVENT_REGISTRY.md is updated
□ processed_events table exists in DB
□ Listener is in correct module (owner or consumer)
□ No magic strings in event names or types
□ All listeners are independent (no choreography)
□ Test listener idempotency (handle same event twice)
```

---

## Anti-Patterns Reference

| Anti-Pattern | Description | Fix |
|---|---|---|
| Magic Strings | `emit('user.blocked', ...)` | Use event classes: `emit('user.blocked', new UserBlockedEvent(...))` |
| God Listener | 600+ lines, 5+ concerns | Split into separate listeners by responsibility |
| Event Interfaces | `interface UserBlockedEvent` | Use classes: `class UserBlockedEvent extends DomainEvent` |
| Listener Orchestration | Listener waits for other listener | Independent listeners, emit derived events |
| No Idempotency | Same event runs twice | Use processedEvent table + idempotency check |
| Facade God Object | 8+ injected services | Split into query-only facade + direct service calls |
| Direct Cross-Module Calls | `messagingService.sendToSocket()` | Emit event: `emit('message.sent', ...)` |
| No Event Registry | Events scattered everywhere | Create central EVENT_REGISTRY.md |
| No Event Versioning | Cannot evolve events | Add version field, handle versions in listener |
| Silent Errors | `catch (e) { }` | Log + send to DLQ |

---

**Status**: Ready for implementation  
**Duration**: 6 weeks to refactor  
**Result**: 10/10 microservices-ready ✅

