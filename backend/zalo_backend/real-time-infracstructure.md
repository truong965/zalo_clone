# Socket Infrastructure Architecture Design

## 🏗️ HIGH-LEVEL SYSTEM ARCHITECTURE

### 1. Production Deployment Topology

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Web     │  │  iOS     │  │  Android │  │  Desktop │       │
│  │  Client  │  │  Client  │  │  Client  │  │  Client  │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │             │             │             │               │
│       └─────────────┴─────────────┴─────────────┘               │
│                          │                                       │
└──────────────────────────┼───────────────────────────────────────┘
                           │ HTTPS/WSS
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    LOAD BALANCER LAYER                          │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  Nginx / AWS ALB / GCP Load Balancer                      │ │
│  │  • Sticky Session (IP Hash / Cookie-based)               │ │
│  │  • SSL Termination                                        │ │
│  │  • Health Check (/health endpoint)                        │ │
│  │  • WebSocket Upgrade Support                              │ │
│  │  • Read Timeout: 3600s                                    │ │
│  └──────────────────┬────────────────────────────────────────┘ │
└─────────────────────┼───────────────────────────────────────────┘
                      │
        ┌─────────────┼─────────────┬─────────────┐
        │             │             │             │
        ▼             ▼             ▼             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  SOCKET SERVER CLUSTER                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ NestJS   │  │ NestJS   │  │ NestJS   │  │ NestJS   │       │
│  │ Instance │  │ Instance │  │ Instance │  │ Instance │       │
│  │    #1    │  │    #2    │  │    #3    │  │    #N    │       │
│  │          │  │          │  │          │  │          │       │
│  │ Socket   │  │ Socket   │  │ Socket   │  │ Socket   │       │
│  │ Gateway  │  │ Gateway  │  │ Gateway  │  │ Gateway  │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │             │             │             │               │
│       └─────────────┴─────────────┴─────────────┘               │
│                          │                                       │
│                Socket.IO Redis Adapter                          │
└──────────────────────────┼───────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    REDIS CLUSTER (HA)                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Redis Sentinel / Redis Cluster                          │  │
│  │                                                           │  │
│  │  • Pub/Sub Channels (cross-node communication)          │  │
│  │  • Presence Store (online users)                         │  │
│  │  • Socket Registry (userId → socketIds)                 │  │
│  │  • Connection State (metadata)                           │  │
│  │  • Rate Limit Counters                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DATABASE LAYER                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  PostgreSQL (Primary + Replicas)                         │  │
│  │  • User data                                              │  │
│  │  • Message persistence                                    │  │
│  │  • Conversation metadata                                  │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│              OBSERVABILITY STACK (OPTIONAL LAYER)               │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌──────────┐   │
│  │ Prometheus│  │  Grafana  │  │  Loki     │  │ PagerDuty│   │
│  │ (Metrics) │  │(Dashboard)│  │  (Logs)   │  │ (Alerts) │   │
│  └───────────┘  └───────────┘  └───────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📦 NESTJS MODULE STRUCTURE

```
src/
├── modules/
│   ├── socket/                          # 🔌 CORE SOCKET MODULE
│   │   ├── socket.module.ts
│   │   ├── socket.gateway.ts            # Main WebSocket gateway
│   │   │
│   │   ├── adapters/                    # Redis adapter configuration
│   │   │   ├── redis-io.adapter.ts      # Custom Socket.IO Redis adapter
│   │   │   └── redis-io.config.ts       # Redis connection config
│   │   │
│   │   ├── services/
│   │   │   ├── socket-state.service.ts  # Connection state management
│   │   │   ├── presence.service.ts      # Online/Offline tracking
│   │   │   ├── socket-auth.service.ts   # JWT validation in WS context
│   │   │   └── socket-registry.service.ts # UserId ↔ SocketId mapping
│   │   │
│   │   ├── guards/
│   │   │   ├── ws-jwt.guard.ts          # WebSocket JWT authentication
│   │   │   └── ws-throttle.guard.ts     # Rate limiting per socket
│   │   │
│   │   ├── filters/
│   │   │   └── ws-exception.filter.ts   # Global error handler for WS
│   │   │
│   │   ├── interceptors/
│   │   │   ├── ws-logging.interceptor.ts # Structured logging
│   │   │   └── ws-metrics.interceptor.ts # Prometheus metrics collection
│   │   │
│   │   ├── pipes/
│   │   │   └── ws-validation.pipe.ts    # Payload validation
│   │   │
│   │   ├── decorators/
│   │   │   ├── ws-user.decorator.ts     # Extract user from socket
│   │   │   └── ws-subscribe.decorator.ts # Custom event decorator
│   │   │
│   │   └── dto/
│   │       ├── socket-connection.dto.ts # Connection metadata
│   │       └── socket-event.dto.ts      # Base event payload
│   │
│   ├── presence/                        # 👤 PRESENCE SYSTEM
│   │   ├── presence.module.ts
│   │   ├── presence.service.ts          # Core presence logic
│   │   ├── presence.gateway.ts          # Presence-specific events
│   │   │
│   │   ├── services/
│   │   │   ├── presence-sync.service.ts # Sync with Redis
│   │   │   └── presence-cleanup.service.ts # TTL cleanup job
│   │   │
│   │   └── dto/
│   │       ├── user-online.dto.ts
│   │       └── user-offline.dto.ts
│   │
│   ├── redis/                           # 🗄️ REDIS MODULE
│   │   ├── redis.module.ts
│   │   ├── redis.service.ts             # Redis client wrapper
│   │   │
│   │   ├── services/
│   │   │   ├── redis-pub-sub.service.ts # Pub/Sub operations
│   │   │   ├── redis-presence.service.ts # Presence store
│   │   │   ├── redis-registry.service.ts # Socket registry
│   │   │   └── redis-rate-limit.service.ts # Rate limit counters
│   │   │
│   │   └── interfaces/
│   │       ├── redis-config.interface.ts
│   │       └── redis-message.interface.ts
│   │
│   ├── health/                          # 🏥 HEALTH CHECK MODULE
│   │   ├── health.module.ts
│   │   ├── health.controller.ts
│   │   │
│   │   └── indicators/
│   │       ├── redis.indicator.ts       # Redis health
│   │       ├── database.indicator.ts    # Postgres health
│   │       └── socket.indicator.ts      # Socket server health
│   │
│   ├── metrics/                         # 📊 METRICS MODULE
│   │   ├── metrics.module.ts
│   │   ├── metrics.controller.ts        # /metrics endpoint (Prometheus)
│   │   │
│   │   └── collectors/
│   │       ├── socket-metrics.collector.ts
│   │       └── redis-metrics.collector.ts
│   │
│   └── [existing modules: auth, users, etc.]
│
├── common/
│   ├── constants/
│   │   ├── socket-events.constant.ts    # Event name constants
│   │   └── redis-keys.constant.ts       # Redis key patterns
│   │
│   ├── interfaces/
│   │   ├── socket-client.interface.ts   # Extended Socket interface
│   │   └── presence-data.interface.ts
│   │
│   └── utils/
│       ├── socket-error.util.ts
│       └── redis-key-builder.util.ts
│
├── config/
│   ├── socket.config.ts                 # Socket.IO configuration
│   └── redis.config.ts                  # Redis configuration
│
└── main.ts                              # Bootstrap with Socket.IO adapter
```

---

## 🔄 DATA FLOW DIAGRAMS

### Flow 1: Client Connection & Authentication

```
┌──────────┐
│  Client  │
└────┬─────┘
     │ 1. Connect to wss://api.app.com/socket.io
     │    + Auth: Bearer <access_token>
     │    + Custom Headers: X-Device-Id, X-Platform
     ▼
┌──────────────────┐
│  Load Balancer   │ 2. Sticky session (IP hash)
└────┬─────────────┘    Route to specific server instance
     │
     ▼
┌──────────────────┐
│ Socket Gateway   │ 3. Connection event triggered
│  (NestJS)        │
└────┬─────────────┘
     │
     │ 4. WsJwtGuard: Validate JWT
     ├─────────────────────────────────────┐
     │                                     │
     ▼                                     │
┌──────────────────┐                      │
│  JWT Strategy    │ 5. Extract userId    │
│  Validate token  │    Attach to socket  │
└────┬─────────────┘                      │
     │                                     │
     │ 6. userId extracted                 │
     ▼                                     │
┌──────────────────┐                      │
│SocketRegistry    │ 7. Store mapping:    │
│   Service        │    userId → socketId │
└────┬─────────────┘    in Redis          │
     │                                     │
     ▼                                     │
┌──────────────────┐                      │
│  Redis Store     │ 8. SET user:{userId}:sockets │
│                  │    ZADD online_users {userId} {timestamp} │
│                  │    TTL 300s (5 min) │
└────┬─────────────┘                      │
     │                                     │
     │ 9. Emit to client                   │
     ▼                                     │
┌──────────────────┐                      │
│  Client          │ 10. Receive:         │
│                  │     { event: 'authenticated', │
│                  │       socketId: '...' }       │
└──────────────────┘                      │
                                          │
     ┌────────────────────────────────────┘
     │ If JWT invalid
     ▼
┌──────────────────┐
│  Disconnect      │ 11. socket.disconnect(true)
│                  │     Emit error: 'auth_failed'
└──────────────────┘
```

### Flow 2: Message Delivery (Cross-Node)

```
User A (Server 1) sends message to User B (Server 2)

┌──────────────────────────────────────────────────────────────┐
│                        SERVER 1                               │
│  ┌────────────┐                                              │
│  │ Socket A   │ 1. Emit: 'message:send'                     │
│  │ (User A)   │    payload: { to: userB, text: '...' }     │
│  └─────┬──────┘                                              │
│        │                                                      │
│        ▼                                                      │
│  ┌────────────┐                                              │
│  │  Gateway   │ 2. Validate payload (DTO)                   │
│  │  Handler   │    Check rate limit                         │
│  └─────┬──────┘                                              │
│        │                                                      │
│        ▼                                                      │
│  ┌────────────┐                                              │
│  │  Message   │ 3. Persist to Database                      │
│  │  Service   │    messageId = 12345                        │
│  └─────┬──────┘                                              │
│        │                                                      │
│        ▼                                                      │
│  ┌────────────┐                                              │
│  │ Socket     │ 4. Check: Is User B on this server?        │
│  │ Registry   │    Query Redis: user:B:sockets             │
│  └─────┬──────┘                                              │
│        │                                                      │
│        │ User B NOT on Server 1                              │
│        ▼                                                      │
│  ┌────────────┐                                              │
│  │ Redis      │ 5. PUBLISH to channel:                      │
│  │ Pub/Sub    │    CHANNEL: "socket:message"               │
│  │            │    PAYLOAD: {                               │
│  │            │      to: userB,                             │
│  │            │      messageId: 12345,                      │
│  │            │      ...                                    │
│  │            │    }                                        │
│  └─────┬──────┘                                              │
└────────┼──────────────────────────────────────────────────────┘
         │
         │ Redis Pub/Sub broadcasts to ALL servers
         │
         ▼
┌────────┴──────────────────────────────────────────────────────┐
│                        SERVER 2                               │
│  ┌────────────┐                                              │
│  │ Redis      │ 6. SUBSCRIBE listener receives message      │
│  │ Adapter    │                                              │
│  └─────┬──────┘                                              │
│        │                                                      │
│        ▼                                                      │
│  ┌────────────┐                                              │
│  │ Gateway    │ 7. Find User B's socket on this server      │
│  │ Handler    │    Query: user:B:sockets                    │
│  └─────┬──────┘                                              │
│        │                                                      │
│        ▼                                                      │
│  ┌────────────┐                                              │
│  │ Socket B   │ 8. socket.emit('message:received', data)    │
│  │ (User B)   │                                              │
│  └────────────┘                                              │
└──────────────────────────────────────────────────────────────┘
```

### Flow 3: Presence System (Online/Offline)

```
┌─────────────────────────────────────────────────────────────┐
│                  USER CONNECTS (ANY SERVER)                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
           ┌──────────────────┐
           │  Socket Gateway  │ 1. On 'connection' event
           │  Connection Hook │
           └────────┬─────────┘
                    │
                    ▼
           ┌──────────────────┐
           │ Presence Service │ 2. setUserOnline(userId)
           └────────┬─────────┘
                    │
                    ▼
           ┌──────────────────┐
           │  Redis Store     │ 3. Execute:
           │                  │    ZADD online_users {userId} {timestamp}
           │                  │    SET user:{userId}:status "online"
           │                  │    EXPIRE user:{userId}:status 300
           │                  │    SADD user:{userId}:devices {deviceId}
           └────────┬─────────┘
                    │
                    ▼
           ┌──────────────────┐
           │  Redis Pub/Sub   │ 4. PUBLISH:
           │                  │    CHANNEL: "presence:online"
           │                  │    PAYLOAD: { userId, timestamp }
           └────────┬─────────┘
                    │
         ┌──────────┴──────────┐
         │                     │
         ▼                     ▼
┌─────────────────┐   ┌─────────────────┐
│   Server 1      │   │   Server 2      │ 5. ALL servers receive
│   Subscribe     │   │   Subscribe     │    presence update
│   Handler       │   │   Handler       │
└────────┬────────┘   └────────┬────────┘
         │                     │
         ▼                     ▼
┌─────────────────┐   ┌─────────────────┐
│  Notify User's  │   │  Notify User's  │ 6. Emit to all connected
│  Friends        │   │  Friends        │    friends:
│  (if online)    │   │  (if online)    │    'friend:online'
└─────────────────┘   └─────────────────┘


┌─────────────────────────────────────────────────────────────┐
│              USER DISCONNECTS (Graceful/Crash)              │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
           ┌──────────────────┐
           │  Socket Gateway  │ 1. On 'disconnect' event
           │  Disconnect Hook │
           └────────┬─────────┘
                    │
                    ▼
           ┌──────────────────┐
           │ Presence Service │ 2. removeUserDevice(userId, deviceId)
           └────────┬─────────┘
                    │
                    ▼
           ┌──────────────────┐
           │  Redis Store     │ 3. Execute:
           │                  │    SREM user:{userId}:devices {deviceId}
           │                  │    
           │                  │    IF SCARD user:{userId}:devices == 0:
           │                  │      ZREM online_users {userId}
           │                  │      DEL user:{userId}:status
           │                  │      PUBLISH presence:offline
           └────────┬─────────┘
                    │
                    ▼
           ┌──────────────────┐
           │  Redis Pub/Sub   │ 4. PUBLISH (if last device):
           │                  │    CHANNEL: "presence:offline"
           │                  │    PAYLOAD: { userId, timestamp }
           └────────┬─────────┘
                    │
                    ▼
           ┌──────────────────┐
           │  ALL Servers     │ 5. Notify friends:
           │  Broadcast       │    'friend:offline'
           └──────────────────┘
```

### Flow 4: Heartbeat & Connection Health

```
┌──────────┐                              ┌──────────────┐
│  Client  │                              │    Server    │
└────┬─────┘                              └──────┬───────┘
     │                                           │
     │ ◄───────────── Configured ────────────► │
     │  pingInterval: 25s                       │
     │  pingTimeout: 20s                        │
     │                                           │
     │                                           │
     ├───────────────── 25s elapsed ───────────►│
     │                                           │
     │              ◄── PING ───                │
     │                                           │
     │───────────── PONG ──►                    │
     │             (within 20s)                  │
     │                                           │
     │                                           │
     │◄─────────── 25s elapsed ─────────────────┤
     │                                           │
     │              ◄── PING ───                │
     │                                           │
     │  [CLIENT SLOW/DEAD - No PONG]           │
     │                                           │
     │◄─────────── 20s timeout ─────────────────┤
     │                                           │
     │              DISCONNECT                   │
     │              (transport close)            │
     │                                           │
     │  [Client detects disconnect]             │
     │                                           │
     │  Reconnect Strategy:                      │
     │  • Attempt 1: immediate                   │
     │  • Attempt 2: +1s                         │
     │  • Attempt 3: +2s                         │
     │  • Attempt 4: +4s                         │
     │  • Attempt 5: +8s                         │
     │  • Max delay: 10s                         │
     │                                           │
     │───────── RECONNECT ──────────────────────►│
     │                                           │
     │              ◄── AUTHENTICATED ───        │
     │                                           │
     └───────────────────────────────────────────┘
```

---

## 🗄️ REDIS DATA STRUCTURES

### Key Patterns & TTL Strategy

```yaml
# Socket Registry (Multi-device support)
user:{userId}:sockets         # SET of socketIds
  - Type: SET
  - TTL: None (cleanup on disconnect)
  - Example: user:abc-123:sockets → {'socket-1', 'socket-2'}

socket:{socketId}:user         # Hash of user metadata
  - Type: HASH
  - TTL: 3600s (cleanup stale connections)
  - Fields:
      userId: abc-123
      deviceId: device-xyz
      connectedAt: timestamp
      serverInstance: server-1

# Presence System
online_users                   # Sorted Set (score = timestamp)
  - Type: ZSET
  - TTL: None (managed by ZREM)
  - Purpose: Fast "who's online" queries
  - Example: ZADD online_users 1642521600 user:abc-123

user:{userId}:status           # String: online/offline/away
  - Type: STRING
  - TTL: 300s (5min - refresh on heartbeat)
  - Purpose: Quick status check

user:{userId}:devices          # SET of deviceIds currently online
  - Type: SET
  - TTL: None (managed by SREM)
  - Purpose: Multi-device tracking

# Rate Limiting
rate_limit:{userId}:messages   # Counter
  - Type: STRING
  - TTL: 60s (sliding window)
  - Purpose: Prevent message spam
  - Limit: 30 messages/minute

rate_limit:socket:{socketId}:events # Counter
  - Type: STRING
  - TTL: 10s
  - Purpose: Prevent event spam
  - Limit: 100 events/10s

# Pub/Sub Channels
socket:message                 # Message delivery
socket:presence:online         # User comes online
socket:presence:offline        # User goes offline
socket:broadcast               # System-wide broadcasts
socket:typing                  # Typing indicators
```

### Redis Lua Scripts (Atomic Operations)

```lua
-- Script 1: Add Socket with Presence Update
-- KEYS[1]: user:{userId}:sockets
-- KEYS[2]: socket:{socketId}:user
-- KEYS[3]: online_users
-- KEYS[4]: user:{userId}:status
-- ARGV[1]: socketId
-- ARGV[2]: userId
-- ARGV[3]: timestamp
-- ARGV[4]: metadata (JSON)

-- Script 2: Remove Socket and Update Presence
-- Check if last device → mark offline

-- Script 3: Heartbeat Update
-- Refresh TTL on status key
-- Update ZSET score
```

---

## 🗃️ SCHEMA CHANGES FOR SOCKET INFRASTRUCTURE

### New Tables Required

```prisma
// ⭐ NEW: Socket Connection Logs (for debugging)
model SocketConnection {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId       String   @map("user_id") @db.Uuid
  socketId     String   @map("socket_id") @db.VarChar(100)
  
  // Connection Details
  deviceId     String   @map("device_id") @db.VarChar(255)
  serverInstance String? @map("server_instance") @db.VarChar(50) // server-1, server-2
  ipAddress    String   @map("ip_address") @db.VarChar(45)
  userAgent    String?  @map("user_agent") @db.Text
  
  // Lifecycle
  connectedAt  DateTime @default(now()) @map("connected_at") @db.Timestamptz
  disconnectedAt DateTime? @map("disconnected_at") @db.Timestamptz
  disconnectReason String? @map("disconnect_reason") @db.VarChar(100)
  // Reasons: 'client_disconnect', 'server_shutdown', 'timeout', 'auth_failed'
  
  // Metrics
  messagesSent     Int @default(0) @map("messages_sent")
  messagesReceived Int @default(0) @map("messages_received")
  duration         Int? @map("duration_seconds") // Calculate on disconnect
  
  // Relations
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId, connectedAt(sort: Desc)])
  @@index([socketId])
  @@index([serverInstance])
  @@map("socket_connections")
}

// ⭐ NEW: Presence History (analytics)
model PresenceLog {
  id        BigInt   @id @default(autoincrement())
  userId    String   @map("user_id") @db.Uuid
  status    String   @db.VarChar(20) // online, offline, away
  deviceId  String?  @map("device_id") @db.VarChar(255)
  timestamp DateTime @default(now()) @db.Timestamptz
  
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId, timestamp(sort: Desc)])
  @@index([timestamp]) // For cleanup
  @@map("presence_logs")
}

// ⭐ UPDATE: User model - Add relations
model User {
  // ... existing fields ...
  
  // NEW Relations
  socketConnections SocketConnection[]
  presenceLogs      PresenceLog[]
  
  // ... rest unchanged ...
}
```

### Schema Considerations

**Why log socket connections?**
- Debugging connection issues
- Audit trail for security
- Metrics for capacity planning
- User behavior analytics

**Retention policy:**
```sql
-- Keep only last 7 days of socket logs
DELETE FROM socket_connections 
WHERE disconnected_at < NOW() - INTERVAL '7 days';

-- Keep only last 30 days of presence logs
DELETE FROM presence_logs 
WHERE timestamp < NOW() - INTERVAL '30 days';
```

---

## 🔒 SECURITY ARCHITECTURE

### Multi-Layer Security

```
┌────────────────────────────────────────────────────────────┐
│                   SECURITY LAYERS                           │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Layer 1: Load Balancer (Rate Limit by IP)           │ │
│  │  • 1000 requests/min per IP                          │ │
│  │  • DDoS protection                                   │ │
│  └──────────────────────────────────────────────────────┘ │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Layer 2: Socket Connection (Authentication)         │ │
│  │  • JWT validation on handshake                       │ │
│  │  • Device fingerprint verification                   │ │
│  │  • Origin check (CORS)                              │ │
│  └──────────────────────────────────────────────────────┘ │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Layer 3: Event Rate Limiting (Per Socket)           │ │
│  │  • 100 events / 10 seconds                           │ │
│  │  • 30 messages / minute                              │ │
│  │  • Sliding window algorithm                          │ │
│  └──────────────────────────────────────────────────────┘ │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Layer 4: Payload Validation (Schema)                │ │
│  │  • DTO validation (class-validator)                 │ │
│  │  • Max payload size: 64KB                            │ │
│  │  • XSS sanitization                                  │ │
│  └──────────────────────────────────────────────────────┘ │
│                          ▼                                  │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Layer 5: Business Logic Authorization               │ │
│  │  • Can user access conversation?                     │ │
│  │  • Is user blocked?                                  │ │
│  │  • Privacy settings check                            │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

---

## 📊 MONITORING & OBSERVABILITY

### Metrics Collection Points

```yaml
Socket Metrics:
  socket_connections_total:
    type: counter
    labels: [server_instance, status]
    description: Total connections established
    
  socket_connections_active:
    type: gauge
    labels: [server_instance]
    description: Currently active connections
    
  socket_connection_duration_seconds:
    type: histogram
    buckets: [1, 5, 30, 60, 300, 600, 1800, 3600]
    labels: [server_instance]
    description: Connection duration
    
  socket_messages_sent_total:
    type: counter
    labels: [server_instance, event_type]
    description: Messages sent by server
    
  socket_messages_received_total:
    type: counter
    labels: [server_instance, event_type]
    description: Messages received from clients
    
  socket_errors_total:
    type: counter
    labels: [server_instance, error_type]
    description: Socket errors
    
  socket_reconnections_total:
    type: counter
    labels: [server_instance]
    description: Client reconnections

Redis Metrics:
  redis_pub_sub_latency_seconds:
    type: histogram
    description: Pub/Sub message delivery latency
    
  redis_commands_total:
    type: counter
    labels: [command]
    description: Redis commands executed
    
  redis_connection_pool_active:
    type: gauge
    description: Active Redis connections

System Metrics:
  nodejs_memory_heap_used_bytes:
    type: gauge
    description: Node.js heap usage
    
  nodejs_eventloop_lag_seconds:
    type: gauge
    description: Event loop lag
```

### Logging Structure

```json
{
  "timestamp": "2025-01-21T10:30:00.000Z",
  "level": "info",
  "event": "socket:connection",
  "socketId": "socket-abc-123",
  "userId": "user-xyz-789",
  "deviceId": "device-hash",
  "ipAddress": "192.168.1.100",
  "serverInstance": "server-1",
  "metadata": {
    "userAgent": "Mozilla/5.0...",
    "platform": "WEB"
  },
  "duration": 1234
}
```

### Alerting Rules

```yaml
Alerts:
  - name: HighSocketErrorRate
    condition: rate(socket_errors_total[5m]) > 10
    severity: critical
    action: page_oncall
    
  - name: RedisConnectionLost
    condition: redis_connected == 0
    severity: critical
    action: page_oncall
    
  - name: HighMemoryUsage
    condition: nodejs_memory_heap_used_bytes > 1.5GB
    severity: warning
    action: notify_team
    
  - name: SocketConnectionChurn
    condition: rate(socket_reconnections_total[1m]) > 100
    severity: warning
    action: investigate
```

---

## 🚀 DEPLOYMENT STRATEGY

### Phase 0: Single Node (Week 1-2)

```
Production Setup:
├── 1 NestJS Instance (4 vCPUs, 8GB RAM)
├── 1 Redis Instance (Managed service: AWS ElastiCache)
├── 1 PostgreSQL (Managed service: AWS RDS)
└── Load Balancer (single target - for future scaling)

Load Test Targets:
├── 1000 concurrent connections
├── 100 messages/second
└── <100ms p99 latency
```

### Phase 1: Horizontal Scaling (Month 2)

```
Production Setup:
├── 3 NestJS Instances (behind LB with sticky sessions)
├── 1 Redis Cluster (3 nodes - master + replicas)
├── 1 PostgreSQL Primary + 1 Read Replica
└── Auto-scaling based on CPU (50-80%)

Capacity:
├── 10K concurrent connections (3.3K per server)
├── 1000 messages/second
└── <150ms p99 latency
```

### Graceful Shutdown Process

```
1. Receive SIGTERM signal
   ├── Stop accepting new connections
   └── Set server health check to 'unhealthy'

2. Load balancer removes server from pool (30s drain)

3. Notify all connected clients: 'server:maintenance'
   └── Clients start reconnection process

4. Wait for active operations to complete (max 30s)

5. Disconnect all remaining sockets:
   socket.emit('server:shutdown', { reconnect: true });
   socket.disconnect(true);

6. Close Redis connections

7. Close database connections

8. Process exits (exit code 0)
```

---

## 🎯 IMPLEMENTATION PHASES (REVISED)

### **Phase 0: Foundation (Week 1) - MUST HAVE**

```yaml
Priority: P0 (Blocks all chat features)

Tasks:
  - Setup Redis Module & Connection
  - Configure Socket.IO with Redis Adapter
  - Implement WsJwtGuard (authentication)
  - Global WS Exception Filter
  - Socket Registry Service (userId ↔ socketId)
  - Basic Presence Service (online/offline)
  - Graceful Shutdown Handler
  - Health Check Endpoint (/health)

Deliverables:
  - Client can connect & authenticate
  - Connection persists across reconnects
  - Server can shut down gracefully
  - Health endpoint returns Redis + DB status

Success Criteria:
  - ✅ 100 concurrent connections stable
  - ✅ JWT validation working
  - ✅ Redis connectivity healthy
```

### **Phase 1: Security & Stability (Week 2) - MUST HAVE**

```yaml
Priority: P1 (Before any chat logic)

Tasks:
  - Rate Limiting (socket events)
  - Payload Validation Pipeline (DTOs)
  - Heartbeat Tuning (pingInterval/pingTimeout)
  - Memory Leak Prevention Patterns
  - Connection State Management
  - Multi-Device Support (same user, multiple sockets)

Deliverables:
  - Rate limit enforced (30 msg/min per user)
  - All socket events validated
  - Connections auto-cleanup on timeout
  - Multi-device login working

Success Criteria:
  - ✅ Spam attacks blocked
  - ✅ Malformed payloads rejected
  - ✅ No memory leaks over 1 hour test
```

### **Phase 1.5: Load Testing (Week 3) - CRITICAL**

```yaml
Priority: P1 (Validation gate)

Tasks:
  - Setup Artillery.io / k6 test suite
  - Scenario 1: 1000 concurrent connections
  - Scenario 2: Connection churn (rapid connect/disconnect)
  - Scenario 3: Message flood (10K messages)
  - Scenario 4: Slow client simulation
  - Memory profiling (heap snapshots)
  - Redis failure simulation
  - Server restart simulation

Success Criteria:
  - ✅ <100ms p99 latency
  - ✅ 0% message loss
  - ✅ Memory stable (no leaks)
  - ✅ Redis failover < 5s downtime
  - ✅ Graceful restart < 30s
```

### **Phase 2: Observability (Week 4) - SHOULD HAVE**

```yaml
Priority: P2 (Production readiness)

Tasks:
  - Structured Logging (Winston/Pino)
  - Prometheus Metrics Exporter
  - Grafana Dashboards
  - Basic Alerting (PagerDuty)
  - Socket Connection Logging (DB table)

Deliverables:
  - /metrics endpoint for Prometheus
  - Dashboard showing:
      • Active connections
      • Message rate
      • Error rate
      • Redis latency
  - Alerts for critical issues

Success Criteria:
  - ✅ Can debug production issues from logs
  - ✅ Metrics visualized in real-time
  - ✅ Alert fires within 1 minute of incident
```

### **Phase 3: Advanced Features (Month 2) - NICE TO HAVE**

```yaml
Priority: P3 (Optimization)

Tasks:
  - Backpressure Handling (message queue)
  - Redis Sentinel / Cluster (HA)
  - Circuit Breaker Pattern
  - Advanced Metrics (latency histograms)
  - Distributed Tracing (Jaeger)
  - Auto-scaling Policies

Success Criteria:
  - ✅ Handles 10K concurrent users
  - ✅ Redis failover transparent
  - ✅ Can trace request across services
```

---

## 📋 FINAL ARCHITECTURE CHECKLIST

### Before Writing ANY Chat Logic:

```
✅ Infrastructure Ready:
   ├── Redis cluster configured
   ├── Socket.IO adapter connected
   ├── Multi-instance deployment tested
   └── Sticky sessions working

✅ Security Hardened:
   ├── JWT validation on handshake
   ├── Rate limiting active
   ├── Payload validation pipeline
   └── XSS/injection prevention

✅ Connection Reliability:
   ├── Heartbeat tuned (25s/20s)
   ├── Reconnection strategy (exponential backoff)
   ├── Graceful shutdown implemented
   └── Timeout cleanup working

✅ State Management:
   ├── Presence system (online/offline)
   ├── Socket registry (userId ↔ socketId)
   ├── Multi-device support
   └── Redis as source of truth

✅ Observability:
   ├── Structured logging
   ├── Metrics collection
   ├── Health checks
   └── Basic alerting

✅ Load Testing:
   ├── 1000 concurrent connections
   ├── <100ms p99 latency
   ├── 0% message loss
   └── Memory stable

✅ Failure Modes Documented:
   ├── Redis down → fallback strategy
   ├── Server crash → client reconnects
   ├── Network partition → circuit breaker
   └── Deploy → zero downtime
```

---

## 🎓 KEY ARCHITECTURAL DECISIONS

### Decision 1: Redis Adapter - Why Mandatory?

**Without Redis:**
```
User A on Server 1 → Message → User B on Server 2
Result: Message LOST (servers isolated)
```

**With Redis:**
```
Server 1 → Publish to Redis → Server 2 receives → Delivers to User B
Result: Message delivered (unified system)
```

### Decision 2: Sticky Sessions - Why Required?

**Socket.IO handshake phases:**
```
1. HTTP polling (establish context)
2. Upgrade to WebSocket
3. Maintain connection

Without sticky: Each phase may hit different server → fails
With sticky: All phases hit same server → succeeds
```

### Decision 3: Presence in Redis - Why Not In-Memory?

**In-memory problems:**
```
Server crashes → Presence state LOST
New server → No idea who was online
```

**Redis solution:**
```
Server crashes → Redis persists state
New server queries Redis → Continues seamlessly
```

### Decision 4: Socket Connection Logs - Why DB?

**Benefits:**
- Audit trail for security
- Debug connection issues ("I was disconnected at 3pm")
- Analytics (peak hours, device distribution)
- Capacity planning (connection duration trends)

**Trade-off:**
- Write overhead (1 insert per connection)
- Mitigation: Async logging, batching, retention policy

---

## 🚨 CRITICAL WARNINGS

### 1. DO NOT Skip Load Testing

```
❌ "We'll load test in production"
✅ "Load test before launch"

Cost of production failure >> cost of load testing
```

### 2. DO NOT Over-Tune Heartbeat

```
❌ pingInterval: 5s, pingTimeout: 3s
   (Battery drain, network spam)

✅ pingInterval: 25s, pingTimeout: 20s
   (Industry standard, proven)
```

### 3. DO NOT Forget Graceful Shutdown

```
❌ Deploy → Kill process → Users disconnected abruptly

✅ Deploy → Drain connections → Wait → Kill
   (Zero user impact)
```

### 4. DO NOT Store Sensitive Data in Redis

```
❌ Store: { userId, password, creditCard }

✅ Store: { userId, socketId, status }
   (Reference IDs only, query DB for sensitive data)
```

---

## 📚 NEXT STEPS

**1. Review & Approve Architecture** ✋
   - Confirm module structure
   - Approve schema changes
   - Validate deployment plan

**2. Start Implementation (NO CHAT LOGIC)** 🔨
   - Phase 0: Foundation (Week 1)
   - Phase 1: Security (Week 2)
   - Phase 1.5: Load Testing (Week 3)

**3. Infrastructure Validation** ✅
   - Run load tests
   - Verify metrics
   - Test failure scenarios

**4. ONLY THEN → Chat Features** 💬
   - Message sending
   - Typing indicators
   - Read receipts
   - etc.

---

**Architecture Status: READY FOR APPROVAL** ✅

**Your call: Any changes needed before we move to implementation?** 🚀