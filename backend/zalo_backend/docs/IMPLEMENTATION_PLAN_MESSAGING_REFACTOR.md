---
title: Messaging Module Refactor Plan
status: draft
owner: backend
last_updated: 2026-02-05
---

# Implementation Plan: Refactor `messaging` Module

## 0) Scope, goals, and non-goals

### Goals
- Standardize **event model** in `messaging` following `friendship` module: define events as classes that **extend `DomainEvent`**.
- Separate responsibilities between:
  - **Conversation/Group** (membership, roles, conversation lifecycle)
  - **Message/Receipt** (sending, media linkage, read/delivered receipts)
  - **Realtime delivery** (socket broadcast, fanout, presence reactions)
- Reduce coupling and complexity by moving cross-cutting behavior (broadcast, cache invalidation, side effects) into **listeners**.
- Keep system behavior stable with phased rollout and explicit acceptance criteria per phase.

### Non-goals
- No UI changes.
- No database schema changes unless explicitly required by later phases.
- No full rewrite; prioritize incremental refactor with backwards compatibility.

### Constraints / invariants
- Keep **idempotency** behavior intact (Redis idempotency for commands, `ProcessedEvent` for listeners).
- Avoid circular dependencies (pattern already used in other modules).
- Do not re-introduce any event versioning framework.

---

## 1) Current pain points (why refactor)
- **Overlapping responsibilities** across `MessageService`, `ConversationService`, `GroupService`, and `MessagingGateway`.
- **Multiple event shapes** co-exist (class-based domain events, ad-hoc payload interfaces, and shared contracts).
- **Gateway tends to become a “god object”**: transport + domain rules + fanout.
- Group operations create **system messages** directly (bypasses a unified message pipeline).

---

## 2) Target architecture (end state)

### 2.1. Domain split (inside Messaging bounded context)
- **Conversation domain**
  - lifecycle (direct/group create)
  - membership add/leave/remove
  - roles/admin transfer
  - archive/unarchive

- **Message domain**
  - send message (including media + reply)
  - receipts delivered/read
  - (optional later) recall/delete message

- **Delivery domain** (realtime + fanout)
  - broadcast via WS gateway
  - optional queue/batch
  - cache invalidation

### 2.2. Event contract standard
- Use **class-based domain events** (`extends DomainEvent`) as the source of truth (same standard as `FriendRequestSentEvent`, etc.).
- Preserve event channel names (Nest event emitter topics) as agreed:
  - `message.sent`
  - (and similarly `conversation.*` channels in later phases)

Note: for cross-module typing, listeners can type the incoming parameter as the corresponding `DomainEvent` subclass.

#### Demo event class (illustrative)
```ts
import { DomainEvent } from '@shared/events';

export class MessageSentEvent extends DomainEvent {
  readonly eventType = 'MESSAGE_SENT';
  readonly version = 1;

  constructor(
    readonly messageId: string,
    readonly conversationId: string,
    readonly senderId: string,
  ) {
    super('MessagingModule', 'Messaging', conversationId, 1);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      messageId: this.messageId,
      conversationId: this.conversationId,
      senderId: this.senderId,
      eventType: this.eventType,
    };
  }
}
```

---

## 3) Phased delivery plan

> Notes:
> - Each phase is designed to be merged independently.
> - Do not start the next phase until acceptance criteria is satisfied.

### Phase 0 — Baseline & safety rails (no behavior change)

#### Objectives
- Establish a safe baseline for refactor.

#### Tasks
- Inventory current `messaging` responsibilities:
  - map APIs: `messaging.controller.ts`, `messaging.gateway.ts`
  - map services: `message.service.ts`, `conversation.service.ts`, `group.service.ts`, `receipt.service.ts`
  - map listeners: `listeners/*`
- Add/verify that all relevant listener handlers have idempotency coverage (`IdempotencyService`).
- Ensure no imports remain from removed versioning framework.

#### Deliverables
- A diagram/notes section appended to this document (or a separate `docs/MESSAGING_EVENT_FLOW.md`).

#### Acceptance criteria
- `pnpm test` / `npm test` (whatever project uses) passes.
- `messaging` builds without `versioned-*` files.

#### Rollback
- Purely additive documentation and minor type fixes; revert is trivial.

---

### Phase 1 — Introduce shared contracts for Messaging + Conversation events

#### Objectives
- Define and adopt `DomainEvent`-based events for messaging-related flows.

#### Tasks
- Create messaging domain event classes (pattern copied from `friendship.events.ts`):
  - `MessageSentEvent`
  - `ConversationCreatedEvent`
  - `ConversationMemberAddedEvent`
  - `ConversationMemberLeftEvent`
  - (optional) `ConversationRoleChangedEvent`, `ConversationMemberRemovedEvent`
- Standardize event channels (Nest event emitter topics):
  - `message.sent`
  - `conversation.created`
  - `conversation.member.added`
  - `conversation.member.left`
- Update **emitters** in messaging domain to emit these event objects.
- Update **listeners** in messaging to consume these event objects.

#### Deliverables
- Domain event class definitions.
- Updated internal messaging event emission/consumption for the above set.

#### Acceptance criteria
- No `any` payload in messaging listeners.
- Event channels preserve the agreed naming (e.g. `message.sent`).

#### Rollback
- Keep old event names the same; only payload types change. If necessary, temporarily accept union types.

---

### Phase 2 — Normalize “send message” pipeline (write vs side effects)

#### Objectives
- Make `MessageService.sendMessage()` do only command-side responsibilities.

#### Tasks
- Define clear command boundary for `sendMessage`:
  - validate DTO
  - idempotency check (Redis)
  - permission check (membership)
  - transaction write
  - return persisted message
- Emit `message.sent` event after commit (or after write success).
- Move side effects into listener(s):
  - broadcast to sockets
  - update conversation list caches
  - enqueue push notifications (if applicable)
  - receipts initialization (if applicable)

#### Deliverables
- A `MessageSentListener` (or reuse `message-broadcaster.listener.ts`) that owns side effects.

#### Acceptance criteria
- `MessageService` no longer calls broadcaster/queue directly.
- Broadcast still happens correctly via listener.

#### Risks
- Ordering issues (emit before commit). Ensure emission happens after successful transaction.

---

### Phase 3 — Conversation membership & group operations: consolidate and eventize

#### Objectives
- Prevent `GroupService` from bypassing message pipeline and reduce duplication.

#### Tasks
- Identify all operations that create **system messages** (group created, member added, member removed, role transfer).
- Replace direct message creation in group operations with a single internal API:
  - Option A: `SystemMessageService`
  - Option B: `MessageService.sendSystemMessage(...)`
- Emit conversation events:
  - `conversation.member.added`
  - `conversation.member.left`
  - `conversation.member.removed`
  - `conversation.role.changed`
- Ensure the conversation listener/handler handles:
  - cache updates
  - system message creation (listener-based; event-driven)

#### Acceptance criteria
- No duplicate logic of “create system message + update lastMessageAt” scattered across multiple services.

---

### Phase 3.5 — Domain split: `Message` vs `Conversation` (structural refactor)

> **DECISION (confirmed by user):**
> - **Scope**: Option C — Two top-level modules (`modules/conversation` + `modules/message`)
> - **Dependency rule**: No direct calls between modules; communicate via **events only**
> - **Gateway/Controller**: Split by domain (conversation endpoints → ConversationModule, message endpoints → MessageModule)

#### Objectives
- Separate the `messaging` bounded context into two **top-level Nest modules**:
  - **`modules/conversation`**: conversation lifecycle + membership + roles + group operations
  - **`modules/message`**: message sending + media linkage + receipts + broadcast
- Enforce **no direct service calls** between the two modules; all cross-domain communication via events.
- Each module owns its own gateway/controller for its domain endpoints.

#### Target folder structure
```
src/modules/
├── conversation/
│   ├── conversation.module.ts
│   ├── conversation.controller.ts      # REST endpoints for conversation/group
│   ├── conversation.gateway.ts         # WS handlers for group operations
│   ├── services/
│   │   ├── conversation.service.ts
│   │   ├── group.service.ts
│   │   └── group-join.service.ts
│   ├── dto/
│   │   ├── create-group.dto.ts
│   │   ├── update-group.dto.ts
│   │   ├── add-members.dto.ts
│   │   ├── remove-member.dto.ts
│   │   ├── transfer-admin.dto.ts
│   │   ├── join-request.dto.ts
│   │   └── review-join-request.dto.ts
│   ├── events/
│   │   ├── index.ts
│   │   └── conversation.events.ts      # ConversationCreatedEvent, MemberAdded/Left/Promoted/Demoted
│   └── listeners/
│       └── conversation-event.handler.ts
│
├── message/
│   ├── message.module.ts
│   ├── message.controller.ts           # REST endpoints for messages
│   ├── message.gateway.ts              # WS handlers for send/typing/read
│   ├── services/
│   │   ├── message.service.ts
│   │   ├── receipt.service.ts
│   │   ├── message-queue.service.ts
│   │   └── message-broadcaster.service.ts
│   ├── dto/
│   │   ├── send-message.dto.ts
│   │   ├── get-messages.dto.ts
│   │   ├── mark-as-read.dto.ts
│   │   └── typing-indicator.dto.ts
│   ├── events/
│   │   ├── index.ts
│   │   └── message.events.ts           # MessageSentEvent
│   └── listeners/
│       ├── message-broadcaster.listener.ts
│       ├── messaging-block.listener.ts
│       ├── messaging-friendship.listener.ts
│       └── messaging-user-presence.listener.ts
│
└── messaging/                          # DEPRECATED - to be removed after migration
    └── (legacy files until fully migrated)
```

#### Dependency rules (enforced)
- `MessageModule` **cannot** import `ConversationModule` providers directly.
- `ConversationModule` **cannot** import `MessageModule` providers directly.
- Cross-domain needs (e.g., `MessageService` checking membership) must be solved by:
  - Querying Prisma directly (read-only, no service call), OR
  - Publishing/listening to events, OR
  - A shared read-only facade in `@shared/` if truly needed.

#### Tasks
1. ✅ Create `modules/conversation/` folder structure and `ConversationModule`.
2. ✅ Move conversation-domain files from `modules/messaging/`:
   - `conversation.service.ts`, `group.service.ts`, `group-join.service.ts`
   - Related DTOs
   - `conversation.events.ts` (extract from `messaging.events.ts`)
   - `conversation-event.handler.ts`
3. ✅ Create `modules/message/` folder structure and `MessageModule`.
4. ✅ Move message-domain files from `modules/messaging/`:
   - `message.service.ts`, `receipt.service.ts`, `message-queue.service.ts`, `message-broadcaster.service.ts`
   - Related DTOs
   - `message.events.ts` (extract `MessageSentEvent`)
   - Remaining listeners
5. ✅ Split `messaging.gateway.ts`:
   - Conversation WS handlers → `conversation.gateway.ts`
   - Message WS handlers → `message.gateway.ts`
6. ✅ Split `messaging.controller.ts`:
   - Conversation REST endpoints → `conversation.controller.ts`
   - Message REST endpoints → `message.controller.ts`
7. ✅ Update `AppModule` to import `ConversationModule` and `MessageModule` (alongside `MessagingModule` for now).
8. 🔄 Remove or deprecate `MessagingModule` after migration complete.
9. 🔄 Fix all import paths across the codebase.

#### Deliverables
- Two new top-level modules: `ConversationModule`, `MessageModule`.
- Each module has its own controller, gateway, services, DTOs, events, listeners.
- `MessagingModule` deprecated/removed.

#### Acceptance criteria
- `npm run build` passes with new module structure.
- No direct service imports between `conversation` and `message` modules.
- All existing functionality preserved (send message, create group, membership, receipts, etc.).
- No circular dependencies.

#### Rollback
- Revert folder moves and restore `MessagingModule`.
- Keep old import paths working until migration verified.

---

### Phase 4 — Gateway slimming (transport-only)

#### Objectives
- Make `MessagingGateway` a transport adapter, not a domain service.

#### Tasks
- Move domain logic out of gateway into services:
  - membership checks
  - permission checks
  - unread counts
  - persistence
- Keep gateway responsibilities:
  - auth/handshake
  - join/leave socket rooms
  - receive command -> call service
  - emit outbound events triggered by broadcaster/service

#### Acceptance criteria
- `MessagingGateway` contains minimal business logic.
- Unit tests can run without spinning a socket server (most logic moved to services/listeners).

---

### Phase 5 — Cleanups & deprecations

#### Objectives
- Remove dead files/exports and document final behavior.

#### Tasks
- Delete deprecated messaging internal event files if unused:
  - `src/modules/messaging/events/messaging.events.ts` (if fully replaced by contracts)
  - any leftover listener shims
- Remove any unused redis key constants duplicated elsewhere.
- Update docs:
  - Update `docs/EVENT_REGISTRY.md` with new messaging event payload contracts.

#### Acceptance criteria
- `grep "@modules/messaging/events"` returns only intended public exports (if any).

---

## 4) Work breakdown (task list)

### Contracts
- [ ] Add `MessageSentPayload` contract
- [ ] Add `ConversationCreatedPayload` contract
- [ ] Add membership event contracts (added/left/removed/role changed)

### Emitters
- [ ] Update message send flow to emit `message.sent` payload
- [ ] Update conversation creation to emit `conversation.created` payload

### Listeners
- [ ] Broadcast listener consumes `MessageSentPayload`
- [ ] Conversation handler consumes membership payloads

### Gateway
- [ ] Extract heavy logic into `MessageBroadcasterService` / listeners
- [ ] Gateway only forwards commands and pushes outbound notifications

### Tests
- [ ] Add contract-level payload shape tests (type-level + runtime minimal)
- [ ] Ensure listeners are idempotent

---

## 5) Suggested implementation order (recommended)
1. Phase 1 (contracts) — unblock consistent typing.
2. Phase 2 (send message pipeline) — biggest impact with controlled risk.
3. Phase 3 (group/membership) — reduces duplication.
4. Phase 4 (gateway slimming) — improves maintainability.
5. Phase 5 (cleanups) — remove dead code.

---

## 6) Decisions (confirmed)
- Event types in `messaging` will follow `friendship` standard: **class-based events that extend `DomainEvent`**.
- System messages will be created by **listeners reacting to conversation events** (event-driven).
- Preserve event channel naming:
  - `message.sent`
