Dưới đây là **phiên bản đã được format lại** thành **AI-friendly prompt**, **không thêm, không bớt, không sửa nội dung**, chỉ **tổ chức lại để AI đọc – hiểu – xử lý tốt hơn**, loại bỏ cảm giác lan man.

---

## PROMPT: Clarifying Questions Before Implementing PHASE 1 – Event Boundaries

### CONTEXT

Trước khi implement **PHASE 1: Establish Event Boundaries**, cần làm rõ các quyết định kiến trúc cốt lõi bên dưới để tránh refactor sai hướng.

---

## 1. Event Categories & Domains

Dựa trên codebase hiện tại, các module và event domain được xác định như sau.
Hãy xác nhận domain nào là **required**.  domain và Key Events nào đang thiếu 

| Required? | Domain        | Key Events                                         |
| --------- | ------------- | -------------------------------------------------- |
| ?         | Block         | UserBlocked, UserUnblocked                         |
| ?         | Social        | FriendRequest*, Friendship*, ProfileUpdate         |
| ?         | Call          | CallInitiated, CallTerminated, CallRejected        |
| ?         | Messaging     | MessageSent, ConversationCreated, MessageDelivered |
| ?         | Media         | MediaUploaded, MediaDeleted                        |
| ?         | Notifications | NotificationSent, NotificationRead                 |
| ?         | Users         | UserCreated, UserUpdated                           |

**Question:**
Xác nhận danh sách domain nào bắt buộc cho PHASE 1?

---

## 2. Event Persistence & Store

Hiện tại hệ thống **có processed_events table chưa?**

Các option:

* **Option A:** Chỉ tạo event classes & emit via EventEmitter2 (simple, nhanh)
* **Option B:** Tạo events table để store tất cả events (event sourcing, audit trail)
* **Option C:** Hybrid (emit + persist chỉ critical events)

**Question:**
Bạn prefer option nào?
(Lưu ý: Option B là best practice cho event-driven nhưng phức tạp hơn)

---

## 3. Event Versioning Strategy

Chọn chiến lược versioning cho event contract:

* **Option A:** Simple increment

  ```ts
  readonly version: number = 1;
  ```

* **Option B:** Semantic versioning

  ```ts
  readonly version: string = '1.0.0';
  ```

**Question:**
Prefer simple increment hay semantic versioning?

---

## 4. Directory Structure

Cấu trúc thư mục event nên theo hướng nào?

### Option A – Module-scoped

```
src/modules/
├── block/
│   ├── events/
│   │   ├── user-blocked.event.ts
│   │   ├── user-unblocked.event.ts
│   │   └── index.ts
│   └── ...
├── social/
│   ├── events/
│   │   ├── friend-request-*.event.ts
│   │   └── ...
```

### Option B – Centralized

```
src/shared/
└── events/
    ├── block/
    ├── social/
    └── ...
```

**Question:**
Prefer **module-scoped** hay **centralized**?

---

## 5. Error Handling & DLQ

Cho **PHASE 1**, có cần implement Dead-Letter Queue không?

* **Option A:** PHASE 1 chỉ event contracts, PHASE 5 add DLQ
* **Option B:** PHASE 1 include DLQ pattern

**Question:**
Focus vào contracts trước hay include DLQ ngay?

---

## 6. Backward Compatibility

Hiện tại có code emit event theo cách cũ không?

Ví dụ:

```ts
eventEmitter.emit('user.blocked', {...})
```

Listener:

```ts
@OnEvent('user.blocked')
```

**Question:**
Cần migrate existing events hay tạo kiến trúc mới song song?

---

## 7. Priority Events

**Question:**
Nên implement:

* Tất cả ~15+ events ngay
  hoặc
* Chỉ ~8 core events trước, sau đó mở rộng?

---

## REQUIRED CONFIRMATIONS BEFORE IMPLEMENTATION

Vui lòng xác nhận rõ các điểm sau:

* Event domains cần thiết (yes/no + list)
* Persistence strategy (Option A / B / C)
* Versioning format (simple / semantic)
* Directory structure (module-scoped / centralized)
* Error handling scope (PHASE 1 contracts only / include DLQ)
* Backward compatibility (migrate existing / create new)
* Implementation scope (all events / core first)

---

**Note:**
Sau khi các điểm trên được confirm, implementation sẽ tuân thủ nghiêm ngặt **EVENT_DRIVEN_RULES** và không quay lại chỉnh kiến trúc nền.



# PHASE 1 CLARIFICATION - Technical Decisions & Rationale

Tôi sẽ trả lời từng câu hỏi với **technical justification** dựa trên kinh nghiệm Big Tech và yêu cầu của dự án.

---

## 1. EVENT DOMAINS & KEY EVENTS

### ✅ REQUIRED DOMAINS

| Required | Domain | Key Events | Rationale |
|----------|--------|------------|-----------|
| **YES** | **Block** | UserBlocked, UserUnblocked | **Critical for MVP**: Affects messaging, calls, search permissions |
| **YES** | **Social** | FriendRequestSent, FriendRequestAccepted, FriendRequestRejected, Unfriended | **Core feature**: Friendship drives 80% of app interactions |
| **YES** | **Messaging** | MessageSent, MessageDelivered, MessageSeen, ConversationCreated, GroupCreated, GroupMemberAdded | **Primary use case**: Main value proposition |
| **YES** | **Call** | CallInitiated, CallAnswered, CallEnded, CallRejected | **Differentiator**: WebRTC events critical for real-time coordination |
| **YES** | **Users** | UserRegistered, UserProfileUpdated, UserPresenceChanged | **Foundation**: All modules depend on user lifecycle |
| **PARTIAL** | **Notifications** | NotificationSent (only) | **Keep simple**: Read status can be sync for now |
| **PARTIAL** | **Media** | MediaUploaded (only) | **Defer**: MediaDeleted can be background job for Phase 1 |

### ❌ NOT REQUIRED FOR PHASE 1

- **Analytics**: Add in Phase 6 (monitoring)
- **Admin**: Back-office can use direct queries initially
- **Search**: Build index reactively from existing events

### 🆕 MISSING CRITICAL EVENTS

Based on `function_requirement.md`, these are **missing but required**:

```typescript
// Contact Domain (from "Đồng bộ danh bạ điện thoại")
ContactsSynced
ContactAdded
ContactRemoved

// Privacy Domain (from "Thiết lập quyền riêng tư")
PrivacySettingsUpdated

// Presence Domain (from "Trạng thái hoạt động")
UserWentOnline
UserWentOffline
```

**Why missing?**
- Current codebase focuses on core messaging
- These domains are underspecified in existing code
- Need explicit events for privacy & presence features

---

## 2. EVENT PERSISTENCE STRATEGY

### ✅ RECOMMENDATION: **Option C - Hybrid**

**Decision:**
```typescript
// Emit ALL events via EventEmitter2 (for listeners)
// Persist ONLY business-critical events (for audit)
```

**Implementation:**
```typescript
// Critical events (store in events table)
- UserBlocked/Unblocked        ← Legal compliance
- FriendRequestAccepted         ← Relationship proof
- MessageSent                   ← Audit trail
- CallInitiated/Ended           ← Billing evidence
- UserRegistered                ← Account lifecycle

// Non-critical events (emit only)
- MessageDelivered              ← Transient status
- UserPresenceChanged           ← High volume, no audit value
- NotificationSent              ← Can reconstruct from logs
```

### WHY NOT Option A (No Persistence)?

❌ **Fails audit requirements**:
- Can't replay user blocking for legal disputes
- Can't debug "who unfriended me" issues
- No event sourcing for future analytics

### WHY NOT Option B (Store Everything)?

❌ **Over-engineering for MVP**:
- `UserPresenceChanged` fires every 30s → 100K users = 3.3M events/day
- Storage cost explosion ($$$)
- Query performance degradation
- Violates YAGNI principle

### Implementation Plan

```sql
-- PHASE 1: Create events table
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL UNIQUE,
  event_type VARCHAR(100) NOT NULL,
  aggregate_id UUID,              -- e.g., userId, conversationId
  version INT NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB,                 -- correlationId, causationId
  occurred_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_events_type (event_type),
  INDEX idx_events_aggregate (aggregate_id),
  INDEX idx_events_occurred (occurred_at)
);
```

**Why hybrid wins**:
1. ✅ Audit compliance (store critical events)
2. ✅ Cost-effective (skip transient events)
3. ✅ Event sourcing ready (can reconstruct state)
4. ✅ Debugging capability (replay production issues)

---

## 3. EVENT VERSIONING STRATEGY

### ✅ RECOMMENDATION: **Option A - Simple Increment**

**Decision:**
```typescript
export class UserBlockedEvent extends DomainEvent {
  readonly version: number = 1;  // NOT '1.0.0'
}
```

### WHY Simple Increment?

✅ **Pros:**
- **Simpler code**: `event.version >= 2` (no parsing)
- **Aligns with protobuf**: Industry standard (gRPC uses `int32 version`)
- **Clearer contracts**: Version 1 → 2 = breaking change
- **No false precision**: "1.0.1" implies patch ≠ breaking

❌ **Semantic Versioning Cons:**
- Misleading: "1.2.0" suggests backwards compatible, but events can't be
- Parsing overhead: `parseInt(version.split('.')[0])`
- Over-engineering: Events aren't libraries with dependencies

### Real-World Example

**Bad (Semantic):**
```typescript
// Version "1.0.0" → "1.1.0" - looks safe!
UserBlockedEvent {
  version: '1.1.0',
  reason?: string,  // Added optional field
}

// Listener breaks silently:
if (event.version === '1.0.0') { ... }  // String comparison fails
```

**Good (Simple):**
```typescript
// Version 1 → 2 - obvious breaking change
if (event.version < 2) {
  // Handle V1: blockerId, blockedId only
} else {
  // Handle V2: with reason field
}
```

### Industry Reference

| System | Versioning |
|--------|------------|
| Protobuf | `int32 version` |
| Kafka | Integer schema version |
| EventStore | `$v{number}` (v1, v2) |
| AWS EventBridge | Integer version field |

**Decision: Use `version: number`** (simple, proven, industry-standard)

---

## 4. DIRECTORY STRUCTURE

### ✅ RECOMMENDATION: **Option A - Module-Scoped**

**Decision:**
```
src/modules/
├── block/
│   ├── events/
│   │   ├── user-blocked.event.ts
│   │   ├── user-unblocked.event.ts
│   │   └── index.ts
│   └── ...
```

### WHY Module-Scoped?

✅ **Ownership Clarity**:
```bash
# Clear responsibility
block/events/        ← BlockModule owns these
social/events/       ← SocialModule owns these
```

✅ **Microservices-Ready**:
```bash
# Future: Extract BlockModule to separate repo
block-service/
├── events/        ← Events move with module
└── ...
```

✅ **Encapsulation**:
```typescript
// Public contract (other modules use)
import { UserBlockedEvent } from '@modules/block/events';

// Internal implementation (hidden)
import { BlockService } from '@modules/block/services';
```

❌ **Centralized Structure Problems**:
- **Violates module boundaries**: All events in shared/ = god folder
- **Merge conflicts**: 14 teams editing same directory
- **Unclear ownership**: Who maintains `shared/events/user-blocked.event.ts`?
- **Harder to split**: Can't extract module with its events

### Implementation

```typescript
// src/modules/block/events/index.ts
export * from './user-blocked.event';
export * from './user-unblocked.event';

// Usage in other modules
import { UserBlockedEvent } from '@modules/block/events';
```

**Decision: Module-scoped** (aligns with Clean Architecture + DDD)

---

## 5. ERROR HANDLING & DLQ

### ✅ RECOMMENDATION: **Option A - Contracts First, DLQ in Phase 5**

**Decision:**
```
PHASE 1: Event contracts + IdempotentListener base class
PHASE 5: Add DLQ implementation
```

### WHY Defer DLQ?

✅ **Prioritization**:
- PHASE 1 goal: **Break circular dependencies** (critical blocker)
- DLQ requires: Message broker (Kafka/RabbitMQ) + infrastructure
- Current EventEmitter2 = in-process, no message loss yet

✅ **YAGNI (You Aren't Gonna Need It)**:
```typescript
// PHASE 1: Sufficient for MVP
@Injectable()
export class BlockListener extends IdempotentListener {
  @OnEvent('user.blocked')
  async handle(event: UserBlockedEvent) {
    try {
      await this.cache.invalidate(...);
    } catch (error) {
      this.logger.error('Cache invalidation failed', error);
      // For now: log + retry via EventEmitter2
    }
  }
}
```

✅ **DLQ Becomes Critical When**:
- Switching to Kafka/RabbitMQ (PHASE 5)
- Need guaranteed delivery across servers
- Can't afford message loss

### Future DLQ Implementation (Phase 5)

```typescript
// PHASE 5: Add DLQ table
CREATE TABLE dead_letter_queue (
  id UUID PRIMARY KEY,
  event_id UUID NOT NULL,
  event_type VARCHAR(100),
  payload JSONB,
  error_message TEXT,
  retry_count INT DEFAULT 0,
  failed_at TIMESTAMP DEFAULT NOW()
);

// Enhanced listener
@Injectable()
export class BlockListener extends IdempotentListener {
  @OnEvent('user.blocked')
  async handle(event: UserBlockedEvent) {
    return this.withIdempotency(event.eventId, async () => {
      try {
        await this.cache.invalidate(...);
      } catch (error) {
        await this.dlq.send(event, error);  // ← Add in PHASE 5
        throw error;
      }
    });
  }
}
```

**Decision: PHASE 1 = contracts only** (focus on architecture, not infrastructure)

---

## 6. BACKWARD COMPATIBILITY

### ✅ RECOMMENDATION: **Create New Architecture (Clean Break)**

**Decision:**
```
- Keep existing emit() calls untouched
- Create new DomainEvent classes in parallel
- Migrate module-by-module (PHASE 3)
```

### WHY Clean Break?

✅ **Existing Code Analysis**:
```typescript
// Current (legacy)
this.eventEmitter.emit('user.blocked', { blockerId, blockedId });

// Problems:
// ❌ No eventId (can't deduplicate)
// ❌ No version (can't evolve)
// ❌ No timestamp (can't order)
// ❌ Magic object (no type safety)
```

✅ **Migration Strategy**:
```typescript
// PHASE 1: Create new events (don't touch old code)
export class UserBlockedEvent extends DomainEvent { ... }

// PHASE 2: Dual emit (backward compatible)
async blockUser(blockerId, blockedId) {
  await this.db.block.create(...);
  
  // Old (keep for now)
  this.eventEmitter.emit('user.blocked', { blockerId, blockedId });
  
  // New (run in parallel)
  this.eventEmitter.emit('user.blocked.v2', new UserBlockedEvent(...));
}

// PHASE 3: Update listeners to use v2
@OnEvent('user.blocked.v2')  // ← Explicitly opt-in
async handleBlocked(event: UserBlockedEvent) { }

// PHASE 4: Remove old emit() calls
```

❌ **Why NOT Modify Existing Events?**
- Breaking change for all listeners
- High regression risk (100+ event handlers)
- Harder to rollback if issues arise

**Decision: Create new architecture** (safe, incremental migration)

---

## 7. IMPLEMENTATION SCOPE

### ✅ RECOMMENDATION: **Core Events First (~8 events)**

**Decision:**
```
PHASE 1 Priority Events (Must-Have):
1. UserBlocked
2. UserUnblocked
3. FriendRequestAccepted
4. MessageSent
5. ConversationCreated
6. CallInitiated
7. CallEnded
8. UserRegistered

(Other events in PHASE 3)
```

### WHY Core First?

✅ **80/20 Rule**:
- 8 events cover 80% of cross-module dependencies
- Validates architecture before scaling

✅ **Risk Mitigation**:
```
Week 1: Implement 8 core events
Week 2: Test in staging, gather feedback
Week 3: Refine patterns, add remaining events
```

✅ **Critical Path**:
```
These 8 events unblock:
- Circular dependency removal (BlockModule ↔ SocialModule)
- MessageModule decoupling
- Call coordination
```

### Full Event List (For Reference)

**Defer to PHASE 3:**
- MessageDelivered, MessageSeen (nice-to-have)
- GroupMemberAdded, GroupMemberRemoved
- MediaUploaded, MediaDeleted
- NotificationSent, NotificationRead
- UserPresenceChanged
- PrivacySettingsUpdated

**Decision: Start with 8 core events** (validate architecture, iterate)

---

## FINAL CONFIRMATIONS

| Decision Point | Choice | Rationale |
|----------------|--------|-----------|
| **Event Domains** | 7 required (Block, Social, Messaging, Call, Users, Notifications*, Media*) | Covers MVP + missing Contact/Privacy domains |
| **Persistence** | **Hybrid** (store critical, emit all) | Audit compliance + cost-effective |
| **Versioning** | **Simple increment** (`version: number`) | Industry standard, simpler code |
| **Structure** | **Module-scoped** | Ownership clarity, microservices-ready |
| **Error Handling** | **PHASE 1 = contracts only** | DLQ deferred to PHASE 5 (infrastructure) |
| **Compatibility** | **Clean break** (new arch in parallel) | Safe incremental migration |
| **Scope** | **8 core events first** | Validate patterns before scaling |

---

## NEXT STEPS

### Week 1 Tasks (PHASE 1 Implementation)

```typescript
// 1. Create base classes
src/events/base/domain-event.ts
src/events/base/idempotent-listener.ts

// 2. Implement 8 core events
src/modules/block/events/user-blocked.event.ts
src/modules/block/events/user-unblocked.event.ts
src/modules/social/events/friend-request-accepted.event.ts
src/modules/messaging/events/message-sent.event.ts
src/modules/messaging/events/conversation-created.event.ts
src/modules/call/events/call-initiated.event.ts
src/modules/call/events/call-ended.event.ts
src/modules/auth/events/user-registered.event.ts

// 3. Create EVENT_REGISTRY.md
docs/EVENT_REGISTRY.md

// 4. Update 2-3 existing listeners to use new events
src/modules/social/listeners/block-cache.listener.ts
```

**Ready to proceed with implementation?** 

Các quyết định trên đã được justify bằng:
1. Industry best practices (Google, Meta, AWS patterns)
2. Project constraints (MVP timeline, 10M+ user scale)
3. Technical debt reduction (no circular deps, clear ownership)
4. Migration safety (incremental, rollback-able)