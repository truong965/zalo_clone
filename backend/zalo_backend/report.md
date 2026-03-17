# Backend Architecture Review Report

## 1) Scope and Method
- Scope: only code organization and architecture in `backend/zalo_backend/src`.
- Scope excluded: business rules and feature correctness.
- Method: static review of module wiring, event flow, Redis integration, and socket layering.

## 2) Executive Summary
- The codebase is running a **hybrid modular-monolith architecture** with **event-driven extensions**, not a pure event-driven modular monolith.
- Event architecture exists and is used broadly, but module boundaries are inconsistent because several feature modules still depend directly on socket infrastructure.
- Redis architecture is functionally complete (state, pub/sub, adapter), but responsibilities are split across multiple places and naming/placement conventions are not consistently enforced.
- Socket layer is the largest structural hotspot: connection lifecycle, cross-domain orchestration, and infra logic are mixed in multiple gateways/listeners.

## 3) What Event Architecture Is Actually Used
### 3.1 Primary mechanism
- In-process event bus via `@nestjs/event-emitter` (`EventEmitterModule.forRoot(...)` in `src/app.module.ts`).
- Event publication through two patterns:
- `EventPublisher.publish(...)` in `src/shared/events/event-publisher.service.ts`.
- Direct `eventEmitter.emit(...)` in many services/gateways.

### 3.2 Event style in practice
- Heavy usage of `@OnEvent(...)` listeners across modules (`friendship`, `privacy`, `message`, `search_engine`, `notifications`, `socket`, `call`, `conversation`, `reminder`, `admin`, `common/events`).
- Event naming is mostly dot-separated domain names (`friendship.accepted`, `user.blocked`, `call.ended`), plus internal names (`qr.internal.*`, `search.internal.*`, `user.socket.*`).

### 3.3 Conclusion
- Current style is **event-driven in-process orchestration** with partial reliability features (idempotent listener base and optional persistence), not distributed event streaming.

## 4) How Modules Communicate (Without Direct Injection?)
### 4.1 Good pattern that exists
- Many cross-domain reactions are done by listeners (`@OnEvent`) instead of direct service injection.
- Example classes: `socket/listeners/*`, `modules/*/listeners/*`, `common/events/domain-event-persistence.listener.ts`.

### 4.2 Current boundary violations (important)
- Multiple feature modules still import socket infrastructure directly:
- `MessageModule` imports `forwardRef(() => SocketModule)`.
- `ConversationModule` imports `forwardRef(() => SocketModule)`.
- `CallModule` imports `forwardRef(() => SocketModule)`.
- `ReminderModule` imports `forwardRef(() => SocketModule)`.
- `MediaModule` imports `SocketModule` directly.
- Some modules import `SocketGateway` directly in services/controllers/listeners.

### 4.3 Conclusion
- The system is **partially decoupled** by events, but **not fully decoupled**.
- Statement "modules communicate without direct inject" is only partially true in current code.

## 5) Redis Architecture Assessment
### 5.1 What is implemented
- Global Redis module: `src/modules/redis` with `RedisService` and specialized services:
- `RedisPubSubService`.
- `RedisPresenceService`.
- `RedisRegistryService`.
- `RedisRateLimitService`.
- Socket.IO cluster adapter via Redis configured in `src/main.ts` using `RedisIoAdapter`.

### 5.2 Why both `src/shared/redis` and `src/modules/redis` exist
- `src/modules/redis`: runtime infrastructure (clients + read/write services).
- `src/shared/redis`: static utility (`RedisKeyBuilder`) for key/channel naming conventions.
- This split is valid architecturally, but currently easy to misread because naming does not clearly distinguish "infra runtime" vs "cross-domain contracts/utilities".

### 5.3 Structural concerns
- `RedisService` includes legacy/dead code paths (`connect()` exists but constructor already initializes clients).
- Key naming has mixed styles (legacy prefixes + new domain-style constants) in `RedisKeyBuilder`.
- More than one pub/sub route exists for cross-node notifications (Socket gateway + redis pub/sub services), increasing mental load.

## 6) Socket Layer Assessment (Main Hotspot)
### 6.1 Current shape
- Core connection lifecycle gateway: `src/socket/socket.gateway.ts`.
- Additional domain gateways under feature modules:
- `modules/message/message.gateway.ts`.
- `modules/conversation/conversation.gateway.ts`.
- `modules/call/call-signaling.gateway.ts`.
- `modules/search_engine/gateways/search.gateway.ts`.

### 6.2 Why it feels "lộn xộn"
- Socket concerns are split across `src/socket` and feature modules, but ownership rules are not explicit.
- `socket.gateway.ts` currently does more than base infra:
- Presence fanout logic.
- Friendship/privacy reads.
- Direct DB update (`lastSeenAt`).
- Force logout orchestration.
- This creates cross-domain orchestration inside infrastructure layer.

### 6.3 Specific organization smells
- Unused placeholder service: `src/socket/services/socket.service.ts`.
- `ScheduleModule.forRoot()` appears in both `AppModule` and `SocketModule`.
- `EventEmitterModule` is global but re-imported in `SocketModule`.
- Comment/docs in several modules claim decoupling that does not match actual imports.

## 7) Event Reliability and Consistency
- Positive:
- `IdempotentListener` base exists.
- Domain event persistence exists (`common/events/domain-event-persistence.listener.ts`).
- Weakness:
- Mixed publication style (`EventPublisher` vs direct `eventEmitter.emit`) reduces consistency.
- Some event listeners are stub/commented (`socket-notification.listener.ts`).
- Duplicate event handling risk exists in some flows (documented by comments, e.g. call ended notifications).

## 8) Architecture Maturity Score (Structural)
- Module boundary clarity: 5/10.
- Event-driven consistency: 7/10.
- Redis architecture clarity: 6/10.
- Socket layer cohesion: 4/10.
- Overall structural maintainability: 5.5/10.

## 9) Recommended Target Architecture (No Business Changes)
### 9.1 Boundary rules
- Keep `src/socket` as **infra transport only**:
- auth handshake, connection lifecycle, room primitives, emit primitives, adapter wiring.
- Move domain reactions fully to feature listeners or application orchestration layer.

### 9.2 Communication rules
- Cross-module communication rule:
- domain module -> emit domain event.
- other module -> react via listener.
- avoid importing `SocketGateway` from feature modules.

### 9.3 Redis rules
- Keep runtime clients/services in `modules/redis`.
- Keep key/channel contracts in `shared/redis`.
- Standardize key naming and deprecate legacy aliases.

### 9.4 Event publication rule
- Adopt one publication entry point (prefer `EventPublisher`) for domain events.
- Reserve raw `eventEmitter.emit` for purely internal technical events only.

## 10) Practical Refactor Plan (Incremental)
### Phase A: Structural cleanup (low risk)
- Remove unused `socket/services/socket.service.ts`.
- Remove duplicate `ScheduleModule.forRoot()` in `SocketModule`.
- Remove unnecessary `EventEmitterModule` import in `SocketModule` if no local need.
- Update comments that claim "no direct coupling" where currently untrue.

### Phase B: Boundary enforcement (medium risk)
- Replace direct `SocketModule`/`SocketGateway` dependencies from feature modules with event listeners in socket or application layer.
- Keep feature gateways only where domain-specific WS APIs are required, but centralize shared lifecycle behavior.

### Phase C: Redis contract stabilization (medium risk)
- Normalize Redis key naming to one convention.
- Remove dead/legacy methods in `RedisService`.
- Document pub/sub channels and ownership in one architecture doc.

### Phase D: Event model hardening (medium risk)
- Migrate domain emits to `EventPublisher` consistently.
- Keep idempotency/persistence strategy unified per event class/type.
- Audit duplicate listeners for same event-output pair.

## 11) Direct Answers to Your Questions
- "Các event đang dùng kiến trúc nào?"
- In-process EventEmitter2 pub/sub (event-driven modular orchestration), with partial domain-event persistence and idempotent listener support.

- "Làm sao module giao tiếp mà không inject trực tiếp?"
- Intended path is event emit + listener. In reality, both patterns coexist: event-driven and direct module/gateway imports.

- "Redis đang triển khai thế nào?"
- Global RedisModule provides ioredis clients + presence/registry/pubsub/rate-limit services; Socket.IO Redis adapter is wired in bootstrap (`main.ts`).

- "Tại sao shared có redis và socket lại chứa lộn xộn logic?"
- `shared/redis` is contract utility (key builder), `modules/redis` is runtime infra. Socket feels messy because infra and cross-domain orchestration are mixed, and socket responsibilities are split across core socket and feature gateways without strict ownership rules.

## 12) Final Verdict
- The backend is not broken architecturally, but it is in a transitional state with mixed patterns.
- The biggest issue is not technology choice; it is **boundary discipline and consistency of architectural rules**.
- You can recover clarity without rewriting business logic by enforcing ownership and communication rules first.
