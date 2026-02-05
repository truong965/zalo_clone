# Chat Application Architecture (100K Concurrent Users)

**Document Version**: 1.0  
**Purpose**: Single source of truth for modular monolithic + event-driven architecture  
**Scope**: 100,000 concurrent users, 1v1 & group chat, voice/call, media, relationships

---

## Part 1: Architecture Philosophy

### Approach: Modular Monolithic + Event-Driven

```
MONOLITHIC (single deployment):
  └─ One Node.js process
  └─ All modules in one codebase
  └─ Shared database (Prisma)
  └─ Shared Redis
  └─ Easier to deploy, monitor, debug

MODULAR (clear boundaries):
  ├─ Each module owns 1 domain
  ├─ Modules don't import each other
  ├─ Modules communicate via events
  ├─ Easy to extract to microservices later

EVENT-DRIVEN (decoupled communication):
  ├─ Module A emits event
  ├─ Module B listens (doesn't know about A)
  ├─ Module C listens (doesn't know about A or B)
  ├─ Scales to 100 listeners
  └─ Future modules just add listeners
```

**Why this approach for 100K users?**
- Monolithic: Simpler to scale horizontally (load balancer + multiple instances)
- Modular: Prevents spaghetti code, clear ownership
- Event-driven: Decoupled, extensible without modifying core modules

---

## Part 2: Directory Structure

```
backend/
│
├─ src/
│  │
│  ├─ common/                          # Shared utilities (no business logic)
│  │  ├─ constants/                    # Global constants
│  │  │  ├─ error.ts                   # Error codes
│  │  │  ├─ http-status.ts             # HTTP status codes
│  │  │  └─ limits.ts                  # Rate limits, timeouts
│  │  │
│  │  ├─ decorators/                   # Reusable decorators
│  │  │  ├─ auth.decorator.ts          # @RequireAuth()
│  │  │  ├─ role.decorator.ts          # @RequireRole()
│  │  │  └─ validate.decorator.ts      # @Validate()
│  │  │
│  │  ├─ dto/                          # Shared DTOs
│  │  │  ├─ pagination.dto.ts
│  │  │  └─ error.dto.ts
│  │  │
│  │  ├─ filters/                      # Exception filters
│  │  │  └─ global-exception.filter.ts
│  │  │
│  │  ├─ guards/                       # Auth guards
│  │  │  ├─ jwt.guard.ts
│  │  │  └─ roles.guard.ts
│  │  │
│  │  ├─ interceptors/                 # Logging, timing, etc
│  │  │  ├─ logging.interceptor.ts
│  │  │  ├─ response.interceptor.ts
│  │  │  └─ error.interceptor.ts
│  │  │
│  │  ├─ interfaces/                   # Shared interfaces
│  │  │  ├─ event.interface.ts         # Base event interface
│  │  │  ├─ request-user.interface.ts
│  │  │  └─ pagination.interface.ts
│  │  │
│  │  └─ utils/                        # Utilities (not business logic)
│  │     ├─ crypto.util.ts
│  │     ├─ time.util.ts
│  │     └─ format.util.ts
│  │
│  ├─ config/                          # Environment & tool configs
│  │  ├─ app.config.ts                 # Port, env
│  │  ├─ database.config.ts            # Prisma connection
│  │  ├─ jwt.config.ts                 # JWT secrets, expiry
│  │  ├─ redis.config.ts               # Redis connection
│  │  ├─ s3.config.ts                  # AWS S3 or Azure Blob
│  │  ├─ socket.config.ts              # WebSocket settings
│  │  ├─ queue.config.ts               # Bull/BullMQ settings
│  │  ├─ email.config.ts               # Email service
│  │  └─ logger.config.ts              # Winston/Pino
│  │
│  ├─ database/                        # Database layer
│  │  ├─ prisma.module.ts              # Prisma module
│  │  ├─ prisma.service.ts             # Prisma service
│  │  └─ repositories/                 # Repository pattern (optional)
│  │     ├─ user.repository.ts
│  │     └─ message.repository.ts
│  │
│  ├─ modules/                         # Business modules (main code)
│  │  │
│  │  ├─ auth/                         # Authentication
│  │  │  ├─ auth.module.ts
│  │  │  ├─ auth.service.ts
│  │  │  ├─ auth.controller.ts
│  │  │  ├─ strategies/                # Passport strategies
│  │  │  │  ├─ jwt.strategy.ts
│  │  │  │  ├─ local.strategy.ts
│  │  │  │  └─ google.strategy.ts
│  │  │  └─ dto/                       # Auth-specific DTOs
│  │  │     ├─ login.dto.ts
│  │  │     └─ register.dto.ts
│  │  │
│  │  ├─ users/                        # User management
│  │  │  ├─ users.module.ts
│  │  │  ├─ users.service.ts
│  │  │  ├─ users.controller.ts
│  │  │  ├─ listeners/                 # Event listeners
│  │  │  │  └─ user-event.listener.ts  # Responds to user events
│  │  │  ├─ dto/
│  │  │  └─ events/                    # Events this module emits
│  │  │     └─ user-created.event.ts
│  │  │
│  │  ├─ friendship/                   # Friend management
│  │  │  ├─ friendship.module.ts
│  │  │  ├─ friendship.service.ts
│  │  │  ├─ friendship.controller.ts
│  │  │  ├─ listeners/
│  │  │  │  ├─ friendship-event.listener.ts
│  │  │  │  └─ block-friendship.listener.ts  # Responds to block events
│  │  │  ├─ dto/
│  │  │  └─ events/
│  │  │     ├─ friendship-created.event.ts
│  │  │     ├─ friendship-deleted.event.ts
│  │  │     └─ friendship-status-changed.event.ts
│  │  │
│  │  ├─ block/                        # User blocking
│  │  │  ├─ block.module.ts
│  │  │  ├─ block.service.ts
│  │  │  ├─ block.controller.ts
│  │  │  ├─ listeners/
│  │  │  │  └─ block-event.listener.ts
│  │  │  ├─ dto/
│  │  │  └─ events/
│  │  │     ├─ user-blocked.event.ts
│  │  │     └─ user-unblocked.event.ts
│  │  │
│  │  ├─ privacy/                      # Privacy & permissions
│  │  │  ├─ privacy.module.ts
│  │  │  ├─ privacy.service.ts
│  │  │  ├─ privacy.controller.ts
│  │  │  ├─ listeners/
│  │  │  │  ├─ privacy-event.listener.ts
│  │  │  │  ├─ privacy-block.listener.ts    # Responds to block events
│  │  │  │  └─ privacy-friendship.listener.ts  # Responds to friendship events
│  │  │  ├─ dto/
│  │  │  └─ events/
│  │  │     └─ privacy-settings-changed.event.ts
│  │  │
│  │  ├─ messaging/                    # 1v1 & group messaging
│  │  │  ├─ messaging.module.ts
│  │  │  ├─ services/
│  │  │  │  ├─ message.service.ts      # CRUD messages
│  │  │  │  ├─ conversation.service.ts # Manage conversations
│  │  │  │  └─ message-receipt.service.ts  # Track read/delivery
│  │  │  ├─ controllers/
│  │  │  │  ├─ message.controller.ts
│  │  │  │  └─ conversation.controller.ts
│  │  │  ├─ listeners/
│  │  │  │  ├─ messaging-event.listener.ts
│  │  │  │  ├─ messaging-block.listener.ts  # Delete messages on block
│  │  │  │  └─ messaging-privacy.listener.ts  # Verify permissions
│  │  │  ├─ dto/
│  │  │  └─ events/
│  │  │     ├─ message-created.event.ts
│  │  │     ├─ message-deleted.event.ts
│  │  │     ├─ message-seen.event.ts
│  │  │     ├─ message-delivered.event.ts
│  │  │     └─ conversation-created.event.ts
│  │  │
│  │  ├─ group/                        # Group management
│  │  │  ├─ group.module.ts
│  │  │  ├─ services/
│  │  │  │  ├─ group.service.ts        # Create, update, delete groups
│  │  │  │  ├─ group-member.service.ts # Add, remove members
│  │  │  │  └─ group-role.service.ts   # Member roles (admin, moderator)
│  │  │  ├─ controllers/
│  │  │  │  ├─ group.controller.ts
│  │  │  │  └─ group-member.controller.ts
│  │  │  ├─ listeners/
│  │  │  │  ├─ group-event.listener.ts
│  │  │  │  ├─ group-block.listener.ts  # Remove blocked user from group
│  │  │  │  └─ group-privacy.listener.ts  # Check privacy on invite
│  │  │  ├─ dto/
│  │  │  └─ events/
│  │  │     ├─ group-created.event.ts
│  │  │     ├─ group-deleted.event.ts
│  │  │     ├─ member-joined.event.ts
│  │  │     ├─ member-left.event.ts
│  │  │     └─ member-role-changed.event.ts
│  │  │
│  │  ├─ call/                         # Voice & video calls
│  │  │  ├─ call.module.ts
│  │  │  ├─ call.service.ts            # Create call, manage state
│  │  │  ├─ call.controller.ts
│  │  │  ├─ listeners/
│  │  │  │  ├─ call-event.listener.ts
│  │  │  │  ├─ call-block.listener.ts  # Reject calls from blocked users
│  │  │  │  └─ call-privacy.listener.ts  # Verify call permissions
│  │  │  ├─ dto/
│  │  │  └─ events/
│  │  │     ├─ call-initiated.event.ts
│  │  │     ├─ call-answered.event.ts
│  │  │     ├─ call-rejected.event.ts
│  │  │     ├─ call-ended.event.ts
│  │  │     └─ call-missed.event.ts
│  │  │
│  │  ├─ media/                        # File uploads & media
│  │  │  ├─ media.module.ts
│  │  │  ├─ media.service.ts           # Upload, delete, retrieve
│  │  │  ├─ media.controller.ts
│  │  │  ├─ listeners/
│  │  │  │  └─ media-event.listener.ts
│  │  │  ├─ dto/
│  │  │  └─ events/
│  │  │     ├─ media-uploaded.event.ts
│  │  │     └─ media-deleted.event.ts
│  │  │
│  │  ├─ notifications/                # Push notifications
│  │  │  ├─ notifications.module.ts
│  │  │  ├─ services/
│  │  │  │  ├─ notification.service.ts # Send notifications
│  │  │  │  ├─ notification-setting.service.ts  # User preferences
│  │  │  │  └─ device-token.service.ts  # FCM tokens
│  │  │  ├─ listeners/
│  │  │  │  ├─ message-notification.listener.ts  # New message
│  │  │  │  ├─ call-notification.listener.ts  # Incoming call
│  │  │  │  ├─ friendship-notification.listener.ts  # Friend request
│  │  │  │  └─ group-notification.listener.ts  # Group activity
│  │  │  ├─ dto/
│  │  │  └─ events/ (listens to others, doesn't emit)
│  │  │
│  │  ├─ social/                       # Social graph (friends, followers)
│  │  │  ├─ social.module.ts
│  │  │  ├─ social.service.ts
│  │  │  ├─ social.controller.ts
│  │  │  ├─ listeners/
│  │  │  │  ├─ social-event.listener.ts
│  │  │  │  └─ social-friendship.listener.ts
│  │  │  ├─ dto/
│  │  │  └─ events/
│  │  │     └─ social-graph-updated.event.ts
│  │  │
│  │  └─ settings/                     # User settings & preferences
│  │     ├─ settings.module.ts
│  │     ├─ settings.service.ts
│  │     ├─ settings.controller.ts
│  │     ├─ listeners/
│  │     │  └─ settings-event.listener.ts
│  │     ├─ dto/
│  │     └─ events/
│  │        └─ settings-changed.event.ts
│  │
│  ├─ shared/                          # Shared services (infra, not business logic)
│  │  ├─ cache/
│  │  │  ├─ redis.module.ts
│  │  │  ├─ redis.service.ts           # Redis wrapper
│  │  │  └─ cache-key-builder.ts       # Key patterns
│  │  │
│  │  ├─ email/
│  │  │  ├─ email.module.ts
│  │  │  └─ email.service.ts           # SendGrid, AWS SES
│  │  │
│  │  ├─ queue/
│  │  │  ├─ queue.module.ts
│  │  │  ├─ queue.service.ts           # Bull queue management
│  │  │  ├─ processors/                # Job processors
│  │  │  │  ├─ email.processor.ts
│  │  │  │  ├─ notification.processor.ts
│  │  │  │  └─ cleanup.processor.ts
│  │  │  └─ events/                    # Queue events (internal)
│  │  │
│  │  ├─ storage/
│  │  │  ├─ s3.module.ts               # AWS S3 or Azure Blob
│  │  │  ├─ s3.service.ts
│  │  │  └─ upload-strategy.ts         # Resumable upload, chunking
│  │  │
│  │  ├─ logger/
│  │  │  ├─ logger.module.ts
│  │  │  └─ logger.service.ts          # Winston, structured logs
│  │  │
│  │  └─ otp/
│  │     ├─ otp.module.ts
│  │     └─ otp.service.ts             # Generate, verify OTPs
│  │
│  ├─ socket/                          # WebSocket for real-time
│  │  ├─ socket.module.ts
│  │  ├─ socket.gateway.ts             # Handles WebSocket connections
│  │  ├─ adapters/
│  │  │  └─ redis-adapter.ts           # Broadcast across instances
│  │  ├─ decorators/
│  │  │  ├─ socket-auth.decorator.ts
│  │  │  └─ socket-event.decorator.ts
│  │  ├─ filters/
│  │  │  └─ socket-exception.filter.ts
│  │  ├─ guards/
│  │  │  └─ socket-auth.guard.ts
│  │  ├─ pipes/
│  │  │  └─ socket-validation.pipe.ts
│  │  ├─ services/
│  │  │  ├─ socket-auth.service.ts     # Authenticate WebSocket
│  │  │  ├─ socket-presence.service.ts # Track online users
│  │  │  ├─ socket-message.service.ts  # Handle socket messages
│  │  │  └─ socket-room.service.ts     # Room management
│  │  └─ events/                       # Socket event handlers
│  │     ├─ message-events.ts
│  │     ├─ call-events.ts
│  │     ├─ presence-events.ts
│  │     └─ typing-events.ts
│  │
│  ├─ types/                           # TypeScript type definitions
│  │  ├─ express.d.ts                  # Extend Express Request
│  │  ├─ socket.d.ts
│  │  ├─ environment.d.ts              # Env vars
│  │  └─ prisma.d.ts                   # Prisma client extensions
│  │
│  ├─ app.controller.ts                # Root controller
│  ├─ app.service.ts                   # Root service
│  ├─ app.module.ts                    # Root module
│  └─ main.ts                          # Entry point
│
├─ prisma/
│  ├─ schema.prisma                    # Data model
│  └─ migrations/
│
├─ test/
│  ├─ e2e/                             # End-to-end tests
│  │  ├─ messaging.e2e.ts
│  │  ├─ call.e2e.ts
│  │  ├─ friendship.e2e.ts
│  │  └─ block.e2e.ts
│  │
│  ├─ unit/                            # Unit tests (optional)
│  │  └─ services/
│  │
│  └─ mocks/                           # Test data & mocks
│     ├─ user.mock.ts
│     └─ message.mock.ts
│
├─ docker-compose.yml                  # Local dev: DB, Redis, Minio
├─ docker-compose.workers.yml          # Workers: Job processors
├─ Dockerfile                          # Container image
├─ package.json
├─ tsconfig.json
└─ README.md
```

---

## Part 3: Core Technologies & Tools

### Runtime & Framework
- **Node.js 20 LTS** - JavaScript runtime
- **NestJS** - Backend framework
- **TypeScript** - Type safety
- **Express** (built into NestJS)

### Database
- **PostgreSQL 15** - Source of truth (ACID, transactions, relationships)
  - Why: Relational data (users, messages, groups, friendships)
  - Scale: Optimized for 100K users
  - Features: Jsonb for flexible fields, Full-text search, Partitioning for large tables

- **Prisma ORM** - Database access
  - Why: Type-safe, migrations, good for modular code
  - Features: Schema, migrations, seeding

### Cache & Real-time
- **Redis** - Caching & Pub/Sub
  - Why: Fast reads, session storage, pub/sub for events
  - Use cases:
    - Cache: Permissions, user presence, recent conversations
    - Pub/Sub: Cross-instance communication
    - Session: Store JWT blacklist, user sessions
  - Scale: Cluster mode for high availability

- **Socket.io** - Real-time communication
  - Why: 1v1 messaging, group chat, typing indicators, call signaling
  - Features: Automatic reconnection, rooms, namespaces
  - Adapter: Redis adapter for multi-instance broadcast

### Job Queue
- **Bull** or **BullMQ** - Background jobs
  - Why: Send notifications, emails, cleanup, analytics
  - Use cases:
    - Send push notifications async
    - Send emails (forgot password, notifications)
    - Cleanup old calls, expired OTPs
    - Generate call history reports

- **Kafka** (optional, Phase 2)
  - Why: If you need event sourcing, audit trail, stream processing
  - Use cases: Compliance logging, analytics

### Media & Storage
- **AWS S3** or **Azure Blob Storage** - File storage
  - Why: Scalable, durable, CDN-friendly
  - Use cases: Images, videos, voice messages
  - Features: Multipart upload, expiring URLs, CDN

- **Minio** - Local S3-compatible storage (dev)
  - Why: Test S3 integration locally

### Authentication
- **Passport.js** - Authentication strategies
  - Strategies: JWT, Local (email/password), OAuth2 (Google, Facebook)
  
- **JWT** - Session tokens
  - Why: Stateless, scalable
  - Features: Refresh tokens for expiry handling

### Real-time Communication
- **WebRTC** - Peer-to-peer voice/video
  - Why: Direct connection, low latency
  - Architecture: Signaling via Socket.io, media via WebRTC

- **STUN/TURN servers**
  - Why: Help clients behind NAT/firewall
  - Examples: Coturn, AWS ICE

### Notifications
- **Firebase Cloud Messaging (FCM)** - Push notifications
  - Why: Native mobile support
  - Platforms: Android, iOS, Web

### Monitoring & Logging
- **Winston** or **Pino** - Structured logging
  - Why: Debug issues, audit trail
  - Features: Log levels, transports (console, file, cloud)

- **Sentry** - Error tracking
  - Why: Catch unhandled errors in production

- **Prometheus + Grafana** - Metrics & monitoring
  - Why: Monitor CPU, memory, DB connections, API latency

- **ELK Stack** (optional) - Log aggregation
  - Why: Search logs across instances

### Testing
- **Vitest** or **Jest** - Unit/E2E tests
- **Supertest** - HTTP API testing
- **Testcontainers** - Database testing

### Deployment
- **Docker** - Containerization
- **Kubernetes** or **Docker Swarm** - Orchestration
- **Nginx** - Load balancer, reverse proxy
- **CI/CD**: GitHub Actions, GitLab CI, or Jenkins

---

## Part 4: Module Interaction Patterns

### Core Rule (Critical)
```
RULE: Modules NEVER import each other
      ├─ No: friendship.service.ts imports block.service.ts
      ├─ No: block.service.ts imports messaging.service.ts
      ├─ YES: Emit events, let listeners respond
      └─ Result: Loosely coupled, independent modules
```

### How Modules Communicate

```
Module A → EVENT → Event Bus → Module B LISTENER
                                Module C LISTENER
                                Module D LISTENER

Example:
block.service.ts.blockUser()
  ├─ DB: INSERT INTO block
  ├─ EMIT: 'user.blocked' event {blockerId, blockedId}
  └─ Done (doesn't know who's listening)

Listeners react:
  ├─ group-block.listener.ts
  │  └─ Remove user from groups, delete pending requests
  │
  ├─ messaging-block.listener.ts
  │  └─ Delete messages between users (optional)
  │
  ├─ privacy-block.listener.ts
  │  └─ Invalidate permission cache
  │
  └─ notification-listener.ts
     └─ Send "You've been blocked" notification
```

### Event Categories

```
USER LIFECYCLE:
  - user.created
  - user.updated (avatar, bio, etc)
  - user.deleted
  - user.online
  - user.offline

FRIENDSHIP:
  - friendship.requested
  - friendship.accepted
  - friendship.rejected
  - friendship.deleted
  - friendship.status_changed

BLOCKING:
  - user.blocked
  - user.unblocked

MESSAGING:
  - message.created
  - message.deleted
  - message.edited
  - message.seen
  - message.delivered

CALLS:
  - call.initiated
  - call.answered
  - call.rejected
  - call.missed
  - call.ended

GROUPS:
  - group.created
  - group.deleted
  - group.updated
  - member.joined
  - member.left
  - member.role_changed

PRIVACY:
  - privacy.settings_changed
  - privacy.permission_denied  (internal, not emitted)

NOTIFICATIONS:
  - notification.sent
  - notification.read
  - device.token_registered
```

---

## Part 5: Key Design Patterns

### Pattern 1: Module Structure

```
Each module has:

├─ module.ts (declares services, listeners, controllers)
├─ service.ts (business logic, DB operations)
├─ controller.ts (HTTP endpoints)
├─ listeners/
│  ├─ own-events.listener.ts (responds to own events)
│  └─ other-events.listener.ts (responds to other modules' events)
├─ dto/ (input validation)
├─ events/ (events this module emits)
└─ types/ (interfaces specific to this module)
```

### Pattern 2: Event Listener

```
Each listener:

├─ Extends: IdempotentListener (prevents duplicate processing)
├─ Decorates with: @Injectable()
├─ Implements: @OnEvent('event.name')
├─ Does: 1 thing (single responsibility)
└─ Result: Idempotent (safe to process twice)
```

### Pattern 3: Cache Invalidation

```
When event occurs:

Source of truth: Database (PostgreSQL)
├─ Block table
├─ Message table
├─ Group table
└─ etc

Computed results (cache in Redis):
├─ permission:message:userId1:userId2
├─ permission:call:userId1:userId2
├─ permission:profile:userId1:userId2
├─ presence:userId (online/offline)
└─ recent-conversations:userId

When user.blocked event:
  ├─ DB updated (block table)
  ├─ Cache invalidated:
  │  ├─ permission:*:blockerId:blockedId
  │  ├─ permission:*:blockedId:blockerId
  │  └─ recent-conversations (affected users)
  └─ Next query: compute fresh, cache result
```

### Pattern 4: Real-time with WebSocket

```
Socket.io flow:

Client connects
  ├─ Authenticate (JWT token)
  ├─ Join room (userId, roomId)
  └─ Subscribe to events

Socket message
  ├─ Validate (JWT still valid)
  ├─ Broadcast (Redis adapter)
  └─ Store (DB via event)

Broadcast across instances
  ├─ Instance 1: message.created event
  ├─ Redis Pub/Sub: broadcast
  ├─ Instance 2, 3, 4: receive
  └─ All connected clients: receive
```

---

## Part 6: Example: Block, Privacy, Friendship Modules

### Scenario: User A blocks User B

```
STEP 1: BlockService.blockUser(A, B)
├─ Database: INSERT Block {blockerId: A, blockedId: B}
├─ Emit event: 'user.blocked' {blockerId: A, blockedId: B, timestamp}
└─ Return: Block record

STEP 2: Event listeners respond (parallel, independent)

Block module (doesn't do anything on its own block event, other modules do)

Friendship module
├─ Listener: friendship-block.listener.ts
├─ Action: Delete friendship(A, B) if exists
├─ Reason: Block implies friend removal
└─ Emit: 'friendship.deleted' event

Messaging module
├─ Listener: messaging-block.listener.ts
├─ Action: Delete or hide messages between A and B (policy decision)
├─ Reason: Blocked users can't see each other's messages
└─ NO new event (internal operation)

Group module
├─ Listener: group-block.listener.ts
├─ Action: Remove B from any groups where A is admin
├─ Reason: A blocked B, so B shouldn't be in A's groups
├─ Delete: GroupMember(B) from groups(A)
├─ Delete: GroupJoinRequest(B) in groups(A)
└─ Emit: 'member.left' event

Privacy module
├─ Listener: privacy-block.listener.ts
├─ Action: Invalidate permission cache
├─ Keys: 
│  ├─ permission:message:A:B
│  ├─ permission:message:B:A
│  ├─ permission:call:A:B
│  ├─ permission:call:B:A
│  ├─ permission:profile:A:B
│  └─ permission:profile:B:A
├─ Result: Next query will recompute (A blocked)
└─ NO event emitted

Notification module
├─ Listener: notification-block.listener.ts
├─ Action: Notify B "User A has blocked you" (if enabled)
├─ Queue: Add job to send push notification
└─ NO database write

STEP 3: Verify the effects

Can A message B?
  ├─ Query: privacy.service.canUserMessage(A, B)
  ├─ Check cache: permission:message:A:B → miss
  ├─ Query: block.isBlocked(A, B) → true (A blocked B)
  ├─ Result: false (denied)
  └─ Emit: (skip cache, next query same result)

Can B message A?
  ├─ Query: privacy.service.canUserMessage(B, A)
  ├─ Check cache: permission:message:B:A → miss
  ├─ Query: block.isBlocked(B, A) → false (B didn't block A)
  ├─ Check friendship: deleted (by listener)
  ├─ Check privacy settings: ?
  └─ Result: depends on A's privacy settings
```

### Scenario: User A accepts friend request from User B

```
STEP 1: FriendshipService.acceptFriendRequest(A, B)
├─ Database: UPDATE FriendshipRequest {status: 'accepted'}
├─ Database: INSERT Friendship {userId: A, friendId: B}
├─ Database: INSERT Friendship {userId: B, friendId: A}
├─ Emit event: 'friendship.accepted' {userId: A, friendId: B}
└─ Return: Friendship record

STEP 2: Event listeners respond

Messaging module
├─ Listener: messaging-friendship.listener.ts
├─ Action: Create Conversation(A, B) if not exists
├─ Reason: Friends can message each other
└─ NO event emitted

Group module
├─ Listener: group-friendship.listener.ts
├─ Action: Allow B to join groups with A
├─ Reason: Friends have different privacy levels
└─ NO event emitted

Privacy module
├─ Listener: privacy-friendship.listener.ts
├─ Action: Recompute and cache permissions
├─ Key: permission:message:A:B = true
├─ Key: permission:call:A:B = true
└─ Result: Cache permissions for faster lookups

Notification module
├─ Listener: notification-friendship.listener.ts
├─ Action: Notify B "User A accepted your friend request"
├─ Queue: Send notification
└─ NO database write

Social module
├─ Listener: social-friendship.listener.ts
├─ Action: Update social graph (optional)
├─ Reason: Friendship affects recommendations
└─ NO event emitted

STEP 3: Verify the effects

Can B see A's profile?
  ├─ Query: privacy.service.canViewProfile(B, A)
  ├─ Check cache: permission:profile:B:A → miss
  ├─ Check friendship: exists (A, B)
  ├─ Check block: block.isBlocked(B, A) → false
  ├─ Result: true (can view, they're friends)
  └─ Cache: permission:profile:B:A = true

Can B message A?
  ├─ Query: privacy.service.canUserMessage(B, A)
  ├─ Check cache: permission:message:B:A → exists (set by listener)
  ├─ Result: true (friends)
  └─ NO database query needed (cache hit)
```

### Scenario: User A changes privacy settings to "Friends can call"

```
STEP 1: SettingsService.updatePrivacySettings(A, {callPermission: 'friends'})
├─ Database: UPDATE PrivacySettings
├─ Emit event: 'privacy.settings_changed' {userId: A, setting: 'callPermission', value: 'friends'}
└─ Return: Updated settings

STEP 2: Event listeners respond

Privacy module
├─ Listener: privacy-settings.listener.ts
├─ Action: Invalidate all permission caches for A
├─ Keys to delete:
│  ├─ permission:call:*:A (all users calling A)
│  ├─ permission:profile:*:A
│  └─ permission:message:*:A
├─ Result: Next query recomputes with new settings
└─ NO event emitted

Notification module
├─ Listener: notification-settings.listener.ts
├─ Action: Notify friends "User A updated privacy settings"
├─ Queue: Send notifications
└─ NO database write

STEP 3: Verify the effects

Can B (friend of A) call A now?
  ├─ Query: privacy.service.canUserCall(B, A)
  ├─ Check cache: permission:call:B:A → miss (invalidated)
  ├─ Check block: block.isBlocked(B, A) → false
  ├─ Check friendship: exists
  ├─ Check A's privacy: callPermission = 'friends'
  ├─ Result: true (B is friend, A allows)
  ├─ Cache: permission:call:B:A = true
  └─ Duration: 5 minutes or until settings change
```

---

## Part 7: Rules & Constraints

### Rule 1: Module Isolation
```
✅ DO:
  ├─ Each module owns its database tables
  ├─ Module.service.ts has all business logic
  ├─ Other modules call via service methods (local calls only)
  └─ Communication between modules via events

❌ DON'T:
  ├─ Import services from other modules
  ├─ Call database directly from listeners
  ├─ Emit events from controllers
  └─ Store business logic in listeners
```

### Rule 2: Event Idempotency
```
✅ DO:
  ├─ Extend IdempotentListener class
  ├─ Generate unique idempotency key per event
  ├─ Track processed events (Redis or DB)
  ├─ Safely process twice (same result)
  └─ Handle failures gracefully

❌ DON'T:
  ├─ Process events without deduplication
  ├─ Assume event processes only once
  └─ Leave listeners in undefined state on error
```

### Rule 3: Cache Invalidation
```
✅ DO:
  ├─ Only cache computed results (permission, presence)
  ├─ Invalidate cache on relevant events
  ├─ Set TTL on all cache keys (5-30 minutes)
  ├─ Use cache-key patterns consistently
  └─ Fallback to DB on cache miss

❌ DON'T:
  ├─ Cache source of truth (tables)
  ├─ Cache forever (no TTL)
  ├─ Mix cache invalidation (some modules delete, some don't)
  └─ Skip cache checks for performance
```

### Rule 4: Database Consistency
```
✅ DO:
  ├─ Use transactions for multi-table updates
  ├─ Emit events after DB commit
  ├─ Rollback on event emission failure
  ├─ Log all state changes
  └─ Handle race conditions

❌ DON'T:
  ├─ Emit events before DB commit
  ├─ Skip transactions (eventual consistency)
  ├─ Leave orphaned records
  └─ Assume sequential event processing
```

### Rule 5: Real-time Communication
```
✅ DO:
  ├─ Use Socket.io for low-latency messaging
  ├─ Broadcast via Redis adapter (multi-instance)
  ├─ Authenticate WebSocket connections
  ├─ Namespace by feature (messaging, calls, presence)
  └─ Handle disconnects gracefully

❌ DON'T:
  ├─ Send large payloads over Socket.io
  ├─ Broadcast to all users (performance)
  ├─ Skip authentication
  └─ Assume connections are persistent
```

### Rule 6: Permissions & Privacy
```
✅ DO:
  ├─ Check permissions before every action
  ├─ Cache permission results (not source data)
  ├─ Verify privacy settings on relevant events
  ├─ Log permission denials
  └─ Fail securely (deny on error)

❌ DON'T:
  ├─ Assume users are allowed
  ├─ Skip permission checks for performance
  ├─ Cache permission decisions forever
  ├─ Expose privacy settings in responses
  └─ Allow permission escalation
```

### Rule 7: Notification Handling
```
✅ DO:
  ├─ Queue notifications (don't send sync)
  ├─ Respect user preferences
  ├─ Batch notifications for same user
  ├─ Retry failed notifications
  └─ Track delivery status

❌ DON'T:
  ├─ Send notifications in request handler
  ├─ Ignore user settings
  ├─ Send duplicate notifications
  ├─ Fail silently
  └─ Overload notification queue
```

### Rule 8: Error Handling
```
✅ DO:
  ├─ Catch and log all errors
  ├─ Return meaningful error codes
  ├─ Retry transient failures
  ├─ Alert on critical errors
  └─ Graceful degradation

❌ DON'T:
  ├─ Let exceptions bubble up
  ├─ Return generic errors
  ├─ Retry forever
  ├─ Ignore errors
  └─ Crash on missing data
```

### Rule 9: Logging & Monitoring
```
✅ DO:
  ├─ Log at INFO level (user actions)
  ├─ Log at DEBUG level (system internals)
  ├─ Include context (userId, conversationId, etc)
  ├─ Monitor key metrics (latency, errors, throughput)
  └─ Alert on anomalies

❌ DON'T:
  ├─ Log at TRACE level (too much)
  ├─ Log sensitive data (passwords, tokens)
  ├─ No structured logging
  ├─ Fire-and-forget monitoring
  └─ Alert on every error
```

---

## Part 8: Scaling to 100K Concurrent Users

### Load Distribution

```
ARCHITECTURE:
┌─────────────────────────────────────────────┐
│           Nginx Load Balancer               │
└────────────┬────────────────────────────────┘
             │
    ┌────────┼────────┐
    ▼        ▼        ▼
 Instance1 Instance2 Instance3
 (Node.js) (Node.js) (Node.js)
    │        │        │
    └────────┼────────┘
             ▼
    ┌─────────────────────┐
    │  PostgreSQL Cluster │
    │  (Master + Replicas)│
    └─────────────────────┘
             ▼
    ┌─────────────────────┐
    │  Redis Cluster      │
    │  (Multi-instance)   │
    └─────────────────────┘
             ▼
    ┌─────────────────────┐
    │  Message Queue      │
    │  (Bull + Processors)│
    └─────────────────────┘
```

### Database Optimization

```
POSTGRESQL:
  ├─ Connection pooling (PgBouncer)
  │  └─ Max 100 connections per instance
  │
  ├─ Query optimization
  │  ├─ Indexes on frequently queried fields
  │  ├─ Query caching (partial, 1-5 min TTL)
  │  └─ Batch reads where possible
  │
  ├─ Table partitioning
  │  ├─ message table: PARTITION BY RANGE (createdAt)
  │  ├─ call_history: PARTITION BY RANGE (date)
  │  └─ notification: PARTITION BY RANGE (createdAt)
  │
  └─ Replication
     ├─ Master: writes
     ├─ Replica 1: reads
     └─ Replica 2: reads + backups

REDIS:
  ├─ Cluster mode
  │  ├─ Hash slots: distribute data
  │  ├─ Replication: each slot has backup
  │  └─ Failover: automatic
  │
  ├─ Memory management
  │  ├─ Max memory: 64GB per node
  │  ├─ Eviction policy: volatile-lru
  │  └─ Persistence: RDB snapshots + AOF
  │
  └─ Key expiry
     ├─ Permission cache: 5 minutes
     ├─ Presence: 30 seconds
     └─ Session: 24 hours
```

### WebSocket Scaling

```
CHALLENGE: 100K concurrent WebSocket connections
          ├─ Each instance: ~10K connections max
          ├─ Need 10 instances
          └─ Communication across instances

SOLUTION: Redis Adapter (Socket.io)
  ├─ Message on Instance 1
  ├─ Emit to Redis Pub/Sub
  ├─ Instance 2-10 subscribe
  ├─ Broadcast to all clients
  └─ All instances in sync

ROOMS: Limit broadcasts
  ├─ Message sent in 1v1 conversation
  │  └─ Only 2 users' sockets receive (not all 100K)
  │
  ├─ Message sent in group
  │  └─ Only group members' sockets receive
  │
  └─ Presence update
     └─ Only friends' sockets receive
```

### Job Queue Scaling

```
CHALLENGE: Send 100K notifications
          ├─ Can't do synchronously
          ├─ Would timeout
          └─ Need background processing

SOLUTION: Bull + Multiple Processors
  ├─ Notification job queued (instant)
  ├─ Job stored in Redis
  ├─ Processor 1-5 poll queue
  ├─ Each processor: 20 jobs/second
  ├─ Total throughput: 100 jobs/second
  └─ All 100K notifications sent in ~1000 seconds

RETRY POLICY:
  ├─ Failed: retry after 1 min
  ├─ Failed: retry after 5 min
  ├─ Failed: retry after 30 min
  ├─ Failed: discard (log to alerts)
  └─ Max retries: 3
```

### Caching Strategy

```
HOT DATA (cache aggressively):
  ├─ Permission results (permission:*)
  ├─ User presence (presence:userId)
  ├─ Recent conversations (recent-conversations:userId)
  ├─ User info (user-profile:userId)
  ├─ Friend list (friends:userId)
  └─ Block list (blocks:userId)

COLD DATA (cache sparingly):
  ├─ Historical messages (already indexed in DB)
  ├─ Old calls (rare access)
  └─ Deleted records (not accessed)

INVALIDATION TRIGGERS:
  ├─ Event-based: Listen to events, invalidate
  ├─ Time-based: TTL on all keys
  ├─ Manual: Admin operations
  └─ Never: Cache source data (tables)
```

### Monitoring for 100K Users

```
KEY METRICS:
  ├─ CPU: < 70%
  ├─ Memory: < 80%
  ├─ DB connections: < 80%
  ├─ API latency: < 200ms (p95)
  ├─ WebSocket latency: < 50ms (p95)
  ├─ Queue depth: < 10K jobs
  ├─ Cache hit rate: > 80%
  ├─ Error rate: < 0.1%
  └─ Uptime: > 99.9%

ALERTS (page on-call):
  ├─ CPU > 85%
  ├─ Memory > 90%
  ├─ API latency > 1 second
  ├─ Queue depth > 50K
  ├─ Error rate > 1%
  ├─ DB connections exhausted
  ├─ Redis down
  └─ WebSocket disconnects > 10%
```

---

## Part 9: Deployment & DevOps

### Local Development
```
docker-compose.yml:
  ├─ PostgreSQL 15
  ├─ Redis
  ├─ Minio (S3-compatible storage)
  ├─ Node.js app
  └─ Adminer (database UI)

Commands:
  ├─ docker-compose up                     # Start all
  ├─ npm run dev                           # Start app
  ├─ npm run db:migrate                    # Run migrations
  ├─ npm run db:seed                       # Seed test data
  └─ npm test                              # Run tests
```

### Staging Deployment
```
Infrastructure:
  ├─ 3 Node.js instances
  ├─ PostgreSQL (master + replica)
  ├─ Redis cluster
  ├─ Nginx load balancer
  └─ CloudFlare CDN

Deployment:
  ├─ Build Docker image
  ├─ Push to registry
  ├─ Deploy via Kubernetes
  ├─ Run migrations (automated)
  ├─ Health checks (wait for ready)
  └─ Rollback on failure
```

### Production Deployment
```
Infrastructure:
  ├─ 10+ Node.js instances (auto-scale)
  ├─ PostgreSQL cluster (AWS RDS)
  ├─ Redis cluster (AWS ElastiCache)
  ├─ S3 for media
  ├─ CloudFlare CDN
  ├─ Nginx (load balancer)
  ├─ Kubernetes for orchestration
  └─ Multi-region for high availability

Deployment Strategy:
  ├─ Blue-Green: 2 environments, switch traffic
  ├─ Canary: 10% traffic to new version, monitor
  ├─ Rollback: instant if errors spike
  └─ No downtime (rolling update)

Backup & Recovery:
  ├─ Daily DB backups (S3)
  ├─ Point-in-time recovery (7 days)
  ├─ Redis snapshots (hourly)
  ├─ Disaster recovery plan
  └─ Test recovery quarterly
```

---

## Part 10: Security Considerations

```
AUTHENTICATION:
  ├─ JWT tokens (access + refresh)
  ├─ Passwords: bcrypt + salt
  ├─ OTP: 2FA for sensitive operations
  ├─ OAuth2: Google, Facebook login
  └─ Rate limiting: 5 attempts / 15 min

DATA PROTECTION:
  ├─ HTTPS/TLS 1.3
  ├─ Database encryption at rest
  ├─ Redis encryption in transit
  ├─ S3 encryption at rest
  └─ PII: mask in logs, encrypt in transit

PERMISSIONS:
  ├─ Role-based access control (RBAC)
  ├─ User can only access own data
  ├─ Admin can manage groups
  ├─ Verify permissions on every request
  └─ Audit trail for sensitive operations

PRIVACY:
  ├─ User controls what data is shared
  ├─ Block functionality (don't show to blocked users)
  ├─ Privacy settings (friends only, etc)
  ├─ Data deletion (GDPR right to forget)
  └─ Comply with local regulations
```

---

## Part 11: Development Workflow

```
NAMING CONVENTIONS:
  ├─ Files: kebab-case (user-auth.service.ts)
  ├─ Classes: PascalCase (UserAuthService)
  ├─ Functions: camelCase (getUserById)
  ├─ Constants: UPPER_SNAKE_CASE (MAX_USER_LIMIT)
  ├─ Interfaces: IPrefixed (IUser)
  ├─ Enums: PascalCase (UserRole)
  └─ Events: dot.notation (user.blocked, message.created)

CODE ORGANIZATION:
  ├─ 1 class per file (except constants)
  ├─ Max 300 lines per file
  ├─ Functions: max 20 lines
  ├─ Services: business logic only
  ├─ Controllers: validation + delegation
  ├─ Listeners: single responsibility
  └─ No circular dependencies

TESTING:
  ├─ Unit tests: services in isolation
  ├─ E2E tests: full flow (API + DB)
  ├─ Coverage: > 80%
  ├─ Mocking: external services (S3, email)
  ├─ Test data: factories + fixtures
  └─ Run tests: every commit (CI/CD)

GIT WORKFLOW:
  ├─ Branch: feature/*, bugfix/*, hotfix/*
  ├─ Commit: feat: add user auth, fix: handle timeout
  ├─ PR: code review, CI checks
  ├─ Merge: squash commits on main
  └─ Tag: v1.0.0 for releases
```

---

## Part 12: Next Steps

### Phase 1: Foundation (Week 1-2)
- [ ] Setup: Docker, PostgreSQL, Redis, Node.js
- [ ] Database schema: Users, Friendship, Block, Privacy, Messages, Groups, Calls
- [ ] Auth module: JWT, local strategy, registration
- [ ] Basic module structure: Users, Friendship, Block, Privacy

### Phase 2: Core Features (Week 3-4)
- [ ] Messaging module: 1v1 messages, conversations
- [ ] Group module: Create, manage, member roles
- [ ] Socket.io: Real-time messaging, presence
- [ ] Privacy + Block: Permission checks, event listeners

### Phase 3: Real-time (Week 5-6)
- [ ] Call module: Initiate, answer, end, missed
- [ ] WebRTC signaling: via Socket.io
- [ ] Presence: Online/offline status
- [ ] Typing indicators: "User is typing..."

### Phase 4: Media & Notifications (Week 7-8)
- [ ] Media upload: S3, chunked upload
- [ ] Notifications: FCM integration, preferences
- [ ] Background jobs: Bull queue, processors
- [ ] Email: Forgot password, confirmations

### Phase 5: Polish & Scale (Week 9-10)
- [ ] Performance: Caching, query optimization, load testing
- [ ] Monitoring: Logs, metrics, alerts
- [ ] Error handling: Graceful failures, recovery
- [ ] Documentation: API, architecture, deployment

---

## Summary

This architecture provides:
- ✅ **Modular**: Each module owns 1 domain
- ✅ **Event-Driven**: Loose coupling, easy to extend
- ✅ **Scalable**: Handles 100K concurrent users
- ✅ **Maintainable**: Clear rules, patterns, ownership
- ✅ **Real-time**: WebSocket + Redis pub/sub
- ✅ **Secure**: JWT, permissions, rate limiting
- ✅ **Resilient**: Error handling, monitoring, backups

The key is: **Emit events, let modules listen. Never import across modules.**
