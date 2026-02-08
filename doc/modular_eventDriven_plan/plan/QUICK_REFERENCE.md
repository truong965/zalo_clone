# ⚡ QUICK REFERENCE - ARCHITECTURE VIOLATIONS & FIXES

**USE THIS FOR**: Quick lookup, code reviews, pull request discussions

---

## VIOLATION #1: Circular Dependencies via forwardRef

### Where It's Used
- `app.module.ts` (line 85-110)
- `socket.module.ts` (line 22)
- `messaging.module.ts` (line 19)
- `social.module.ts` (line 34)
- `call.module.ts` (line 11)
- `auth.module.ts` (line 52)

### Why It's Bad
```
❌ forwardRef is COMPILE-TIME ONLY
   - Cannot be resolved at runtime in different JVM (microservices)
   - Hides design problems instead of fixing them
   - Bootstrap time increases exponentially
```

### Quick Fix
```typescript
// ❌ BEFORE
forwardRef(() => SocialModule)

// ✅ AFTER
// Remove import entirely, communicate via Event Bus only
import { EventEmitterModule } from '@nestjs/event-emitter';
```

### Action Required
**PHASE 2**: Replace with Event Bus (estimate: 1 week)

---

## VIOLATION #2: No Event Contracts

### Where It Happens
- `social-graph.listener.ts` (line 45-100)

### Why It's Bad
```
❌ Events as interfaces (no runtime validation)
❌ No eventId (no idempotency)
❌ No version (cannot evolve)
❌ No timestamp (cannot order)
```

### Quick Fix
```typescript
// ❌ BEFORE
export interface UserBlockedEvent {
  blockerId: string;
  blockedId: string;
}

// ✅ AFTER
export class UserBlockedEvent {
  readonly eventId: string = uuidv4();
  readonly version: number = 1;
  readonly timestamp: Date = new Date();
  
  constructor(
    readonly blockerId: string,
    readonly blockedId: string,
  ) {}
}
```

### Action Required
**PHASE 1**: Convert all events to classes (estimate: 3 days)

---

## VIOLATION #3: No Idempotency

### Where It's Missing
- All `@OnEvent()` handlers in `social-graph.listener.ts`
- No `processed_events` table

### Why It's Bad
```
❌ If message broker retries event (at-least-once delivery)
❌ Handler runs TWICE
❌ Data corruption / duplicate operations
❌ **WILL FAIL IN PRODUCTION**
```

### Quick Fix
```typescript
// ❌ BEFORE
@OnEvent('user.blocked')
async handleUserBlocked(payload: UserBlockedEvent) {
  await this.socketGateway.disconnectUser(...); // RUNS TWICE ❌
}

// ✅ AFTER
@OnEvent('user.blocked')
async handleUserBlocked(event: UserBlockedEvent) {
  return this.withIdempotency(
    event.eventId,                    // ← Use event's ID
    this.constructor.name,
    async () => {
      await this.socketGateway.disconnectUser(...); // Runs ONCE ✓
    }
  );
}
```

### Database
```sql
CREATE TABLE processed_events (
  id UUID PRIMARY KEY,
  event_id UUID NOT NULL,
  listener_name VARCHAR NOT NULL,
  processed_at TIMESTAMP,
  UNIQUE (event_id, listener_name)
);
```

### Action Required
**PHASE 5**: Add idempotency to all listeners (estimate: 3 days)

---

## VIOLATION #4: God Listener (600+ lines)

### Location
- `src/modules/social/listener/social-graph.listener.ts`

### Why It's Bad
```
❌ 600+ lines in ONE class
❌ 5+ different concerns (Block, Friendship, Call, Cache, Socket)
❌ Unmaintainable, untestable
❌ Hard to deploy (change one handler, redeploy all)
```

### Quick Fix
```typescript
// ❌ BEFORE: Single listener with 600 lines
@Injectable()
export class SocialGraphEventListener {
  @OnEvent('user.blocked') async handleUserBlocked() { }
  @OnEvent('friendship.removed') async handleFriendshipRemoved() { }
  @OnEvent('call.terminated') async handleCallTerminated() { }
  // ... + more (TOTAL 600+ lines)
}

// ✅ AFTER: Separate listeners by concern
// src/modules/block/listener/block.listener.ts
@OnEvent('user.blocked')
async handleUserBlocked(event: UserBlockedEvent) {
  // ONLY: Cache invalidation
}

// src/modules/socket/listener/socket.listener.ts
@OnEvent('user.disconnected')
async handleUserDisconnected(event: UserDisconnectedEvent) {
  // ONLY: Socket logic
}

// src/modules/call/listener/call.listener.ts
@OnEvent('user.disconnected')
async handleCallTermination(event: UserDisconnectedEvent) {
  // ONLY: Call termination
}
```

### Action Required
**PHASE 4**: Split into 5+ listeners (estimate: 3 days)

---

## VIOLATION #5: SocialFacade God Object

### Location
- `src/modules/social/social.facade.ts` (line 1-30)

### Why It's Bad
```
❌ 8 injected services (God Object)
❌ Contains business logic (should be read-only)
❌ Still uses forwardRef()
❌ Makes other modules depend on it
```

### Quick Fix
```typescript
// ❌ BEFORE: 8 services, contains logic
@Injectable()
export class SocialFacade {
  constructor(
    private friendshipService,
    private privacyService,
    private contactService,
    private blockService,
    @Inject(forwardRef(() => callHistoryService)) // ← Still circular!
    private callHistoryService,
    private redisService,
    private prisma,
  ) {}
  
  async checkPermission(...) { /* Business logic here */ }
}

// ✅ AFTER: Max 3 services, READ-ONLY
@Injectable()
export class SocialQueryFacade {
  constructor(
    private blockQuery: BlockQueryService,
    private friendshipQuery: FriendshipQueryService,
    private privacyQuery: PrivacyQueryService,
  ) {}
  
  // ONLY read methods
  async canUserMessage(userId: string, targetId: string): Promise<boolean> {
    const blocked = await this.blockQuery.isBlocked(userId, targetId);
    if (blocked) return false;
    return await this.privacyQuery.allowsMessaging(userId, targetId);
  }
}

// Mutations handled separately:
// src/modules/messaging/message.service.ts
async sendMessage(...) {
  const canSend = await this.queryFacade.canUserMessage(...); // Query
  const message = await this.db.message.create(...);          // Mutation
  this.eventEmitter.emit('message.sent', event);              // Event
}
```

### Action Required
**PHASE 3**: Refactor facade (estimate: 2 days)

---

## VIOLATION #6: Direct Cross-Module Service Calls

### Where It Happens
- `friendship.service.ts` (line 46): Direct BlockService call
- `messaging.module.ts` (line 19): Imports SocialModule
- `social-graph.listener.ts` (line 147+): Injects CallHistoryService

### Why It's Bad
```
❌ Tight coupling between modules
❌ Cannot deploy independently
❌ Cannot scale independently
❌ Cannot convert to microservices
```

### Quick Fix
```typescript
// ❌ BEFORE: Direct service call
@Injectable()
export class FriendshipService {
  constructor(
    private blockService: BlockService  // ← Wrong!
  ) {}

  async sendFriendRequest(...) {
    await this.blockService.isBlocked(...); // Direct call
  }
}

// ✅ AFTER: Query interface
@Injectable()
export class FriendshipService {
  constructor(
    @Inject('IBlockQuery') private blockQuery: IBlockQuery  // ← Interface
  ) {}

  async sendFriendRequest(...) {
    const blocked = await this.blockQuery.isBlocked(...);
  }
}

// Or ✅ EVENT-BASED (preferred)
@Injectable()
export class FriendshipService {
  @OnEvent('permission.checked')
  async handlePermissionChecked(event: PermissionCheckedEvent) {
    if (event.canCreateFriendship) {
      // Proceed with logic
    }
  }
}
```

### Action Required
**PHASE 2-4**: Replace with event bus (estimate: 1 week)

---

## VIOLATION #7: Missing Event Registry

### Where It Should Exist
- File: `src/events/EVENT_REGISTRY.md` (DOESN'T EXIST)

### Why It's Bad
```
❌ Cannot query all events in system
❌ Event ownership unclear
❌ Multiple modules might emit same event
❌ No single source of truth
```

### Quick Fix
```markdown
# EVENT_REGISTRY.md

## BlockModule Events
- UserBlockedEvent (src/modules/block/events.ts)
- UserUnblockedEvent (src/modules/block/events.ts)

## SocialModule Events
- FriendRequestSentEvent (src/modules/social/events.ts)
- FriendshipAcceptedEvent (src/modules/social/events.ts)

## MessagingModule Events
- MessageSentEvent (src/modules/messaging/events.ts)
- ConversationCreatedEvent (src/modules/messaging/events.ts)

... (30+ events total)
```

### Action Required
**PHASE 1 & 6**: Create registry (estimate: 2 days)

---

## VIOLATION #8: Listener Orchestration (Pinball Effect)

### Where It Happens
- `social-graph.listener.ts`: Listener calls multiple services

### Why It's Bad
```
❌ Listener tries to orchestrate (not just react)
❌ Event chains create dependency loops
❌ Risk of infinite loops
❌ Hard to debug
```

### Quick Fix
```typescript
// ❌ BEFORE: Listener orchestrates
@OnEvent('user.blocked')
async handleUserBlocked(payload: UserBlockedEvent) {
  // Listener orchestrates multiple concerns
  await this.socketGateway.disconnectUser(...);      // Socket
  await this.callHistoryService.terminateAll(...);   // Call
  await this.cache.invalidate(...);                  // Cache
  // This is orchestration, not reaction!
}

// ✅ AFTER: Listener reacts, emits derived events
@OnEvent('user.blocked')
async handleUserBlocked(event: UserBlockedEvent) {
  // ONLY: Invalidate cache
  await this.cache.invalidate(...);
  
  // Emit derived event for others to handle
  this.eventEmitter.emit(
    'user.disconnected',
    new UserDisconnectedEvent(event.blockedId, 'blocked')
  );
}

// Separate handler in SocketModule
@OnEvent('user.disconnected')
async handleDisconnect(event: UserDisconnectedEvent) {
  // ONLY: Socket logic
  await this.socketGateway.disconnectUser(event.userId);
}

// Separate handler in CallModule
@OnEvent('user.disconnected')
async handleCallTermination(event: UserDisconnectedEvent) {
  // ONLY: Call logic
  await this.callService.terminateActiveCalls(event.userId);
}
```

### Action Required
**PHASE 4**: Split listeners, emit derived events (estimate: 3 days)

---

## VIOLATION #9: Event Naming (Imperative instead of Past Tense)

### Examples
```typescript
// ❌ WRONG: Imperative (command-like)
export class BlockUser { }
export class SendFriendRequest { }
export class RemoveFromGroup { }
export class DisconnectSocket { }

// ✅ CORRECT: Past tense (domain events)
export class UserBlockedEvent { }
export class FriendRequestSentEvent { }
export class UserRemovedFromGroupEvent { }
export class SocketDisconnectedEvent { }
```

### Action Required
**PHASE 1**: Rename events (estimate: 1 day)

---

## VIOLATION #10: Missing Dead-Letter Queue (DLQ)

### Where It's Missing
- No DLQ table, no DLQ service
- Failed listeners silently fail

### Why It's Bad
```
❌ Failed events lost silently
❌ No way to recover
❌ Data inconsistency
❌ No alerting
```

### Quick Fix
```sql
-- Create DLQ table
CREATE TABLE event_dlq (
  id UUID PRIMARY KEY,
  event_id UUID NOT NULL,
  listener_name VARCHAR NOT NULL,
  error_message TEXT,
  original_event JSONB,
  created_at TIMESTAMP,
  processed BOOLEAN DEFAULT FALSE
);

-- Service to send failed events to DLQ
@Injectable()
export class DLQService {
  async sendToDLQ(eventId: string, listenerName: string, error: Error) {
    await this.db.eventDLQ.create({
      data: {
        eventId,
        listenerName,
        errorMessage: error.message,
        originalEvent: { /* event data */ },
        createdAt: new Date(),
      },
    });
  }
}
```

### Action Required
**PHASE 5**: Add DLQ service + table (estimate: 1 day)

---

## CHECKLIST: Quick PR Review

When reviewing code changes:

- [ ] All events have `eventId`, `version`, `timestamp`?
- [ ] Event names are past tense (UserBlocked, not BlockUser)?
- [ ] No `forwardRef()` in imports?
- [ ] Listener has ≤1 injected service per concern?
- [ ] Listener wrapped with `withIdempotency()`?
- [ ] No direct service calls across modules?
- [ ] Facade (if used) is READ-ONLY?
- [ ] Listener has error handling + DLQ?
- [ ] EVENT_REGISTRY.md updated?
- [ ] Listener has ≤100 lines of code?

---

## COMMAND REFERENCE: Finding Violations

```bash
# Find all forwardRef() usage
grep -r "forwardRef" src/

# Find all circular imports
npm run build 2>&1 | grep -i "circular\|circular dependency"

# Find all event emissions (magic strings)
grep -r "\.emit(" src/ | grep -v "eventEmitter.emit.*Event"

# Find all god listeners (>200 lines)
find src -name "*.listener.ts" -exec wc -l {} \; | awk '$1 > 200'

# Find all listeners without idempotency
grep -r "@OnEvent" src/ | grep -v "withIdempotency"

# Find all direct service injections across modules
grep -r "BlockService\|PrivacyService\|CallHistoryService" src/modules/messaging/
```

---

## RESOURCES

- **Full Review**: [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md)
- **Detailed Violations**: [VIOLATIONS_DETAILED.md](VIOLATIONS_DETAILED.md)
- **Event Rules**: [EVENT_DRIVEN_RULES.md](EVENT_DRIVEN_RULES.md)
- **Executive Summary**: [EXECUTIVE_SUMMARY.md](EXECUTIVE_SUMMARY.md)

---

**Last Updated**: 2025-02-02  
**Status**: Ready for Refactoring  
**Microservices Readiness**: 3/10 → 10/10 (after refactoring)

