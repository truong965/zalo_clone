# Chat Application Architecture - MVP

**Version**: 2.0 (MVP Rewrite)  
**Target**: 10,000 total users, 3,000 concurrent  
**Timeline**: 6 months to MVP  
**Budget**: $200 AWS credits (student account)  
**Philosophy**: **Cost-first, single instance, scale incrementally**  

---

## 🎯 EXECUTIVE SUMMARY

This is a **realtime chat application** with 1v1 messaging, group chat, voice/video calls, built on **NestJS + Socket.IO + PostgreSQL + Redis + S3**.

### Core Principle: Start Simple

```
Single Instance Architecture:
  ├─ 1 EC2 instance (all services)
  ├─ 1 RDS PostgreSQL (source of truth)
  ├─ Self-hosted Redis (session, cache, pubsub)
  ├─ S3 (media storage)
  ├─ SQS (background jobs)
  └─ CloudWatch (basic monitoring)

Why monolithic for MVP?
  ✅ Simplest to deploy and manage
  ✅ Lowest cost ($15-30/month fits budget)
  ✅ Fast development (no distributed system complexity)
  ✅ Can scale later when traffic proves need
```

### What This Can Handle:
- **10,000 total users**, 3,000 concurrent connections
- **2M messages/day** (200 messages/user/day average)
- **600K media files/month** (30% of messages have media)
- **1TB media storage** over 6 months
- **Voice/video calls** (WebRTC signaling via Socket.IO)

---

## 📐 ARCHITECTURE OVERVIEW

```
┌────────────────────────────────────────────────────────────────┐
│                     USERS (Mobile/Web Clients)                  │
└──────────────────────────┬─────────────────────────────────────┘
                           │
                           │ HTTPS / WSS
                           ▼
┌────────────────────────────────────────────────────────────────┐
│                AWS Region: ap-southeast-1 (Singapore)           │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐ │
│  │        EC2 t2.micro → t3.medium (Single Instance)        │ │
│  │                                                          │ │
│  │  ┌────────────┐  ┌────────────┐  ┌─────────────┐       │ │
│  │  │  HTTP API  │  │ Socket.IO  │  │Bull Workers │       │ │
│  │  │  (NestJS)  │  │  Gateway   │  │(same proc.) │       │ │
│  │  └─────┬──────┘  └─────┬──────┘  └──────┬──────┘       │ │
│  │        │               │                │               │ │
│  │        └───────────────┴────────────────┘               │ │
│  │                        │                                │ │
│  │        ┌───────────────▼─────────────────┐              │ │
│  │        │  Redis (self-hosted on same VM) │              │ │
│  │        │  • Sessions                      │              │ │
│  │        │  • Presence (online/offline)     │              │ │
│  │        │  • Cache (profiles, permissions) │              │ │
│  │        │  • Streams (chat sync, typing)   │              │ │
│  │        │  • Pub/Sub (realtime events)     │              │ │
│  │        └───────────────┬─────────────────┘              │ │
│  └────────────────────────┼──────────────────────────────────┘ │
│                           │                                     │
│  ┌────────────────────────▼─────────────────────────────────┐  │
│  │         RDS PostgreSQL (db.t3.micro, 20GB)               │  │
│  │  • Users, messages, groups, calls, media metadata       │  │
│  │  • Single instance (no replica for MVP)                 │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                   S3 Bucket (chat-app-media)             │  │
│  │  • Images, videos, files (presigned URLs)               │  │
│  │  • Lifecycle: delete temp uploads after 24h             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              SQS Queues (FIFO, serverless)               │  │
│  │  • media-processing.fifo (resize, thumbnail)            │  │
│  │  • notifications.fifo (FCM push notifications)          │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🏗️ MODULE ARCHITECTURE (Event-Driven Monolith)

### Core Principle: Modular + Event-Driven

```
Modules don't import each other directly.
They communicate via events (NestJS EventEmitter).

Example:
  BlockModule emits: UserBlocked event
  ↓
  MessagingModule listens: Delete messages from blocked user
  PrivacyModule listens: Update permission cache
  NotificationModule listens: Send "User blocked" notification
```

### Directory Structure

```
backend/zalo_backend/
│
├─ src/
│  ├─ main.ts                      # Bootstrap
│  ├─ app.module.ts                # Root module
│  │
│  ├─ common/                       # Shared utilities (no business logic)
│  │  ├─ decorators/
│  │  ├─ guards/                    # JWT auth, roles
│  │  ├─ interceptors/              # Logging, response formatting
│  │  ├─ filters/                   # Exception handling
│  │  └─ dto/                       # Shared DTOs (pagination, etc.)
│  │
│  ├─ config/                       # Configuration modules
│  │  ├─ database.config.ts         # Prisma
│  │  ├─ redis.config.ts
│  │  ├─ jwt.config.ts
│  │  ├─ s3.config.ts
│  │  └─ queue.config.ts            # Bull + SQS
│  │
│  ├─ shared/                       # Infrastructure services
│  │  ├─ database/                  # Prisma module
│  │  ├─ redis/                     # Redis module
│  │  ├─ storage/                   # S3 service
│  │  ├─ queue/                     # Bull module
│  │  └─ logger/                    # Winston/Pino
│  │
│  ├─ modules/                      # Business domains
│  │  │
│  │  ├─ auth/                      # Authentication
│  │  ├─ authorization/             # authorization
│  │  │
│  │  ├─ users/                     # User management
│  │  │
│  │  ├─ friendship/                # Friend requests 
│  │  │
│  │  ├─ block/                     # User blocking
│  │  │
│  │  ├─ privacy/                   # Privacy settings
│  │  │
│  │  ├─ message/                   # message
│  │  │
│  │  ├─ conversation/              # conversation management
│  │  │
│  │  ├─ call/                      # Voice/Video calls
│  │  │
│  │  ├─ media/                     # File uploads
│  │  │
│  │  ├─ notifications/             # Push notifications
│  │  │
│  │  ├─ presence/                  # Online/Offline status
│  │  │
│  │  ├─ search-engine/             # Global search
│  │  │
│  │  └─ contacts/                   # Contact sync (future)
│  │
│  └─ socket/                       # Socket.IO gateway
│
├─ prisma/
│  ├─ schema.prisma                 # Database schema
│  └─ migrations/                   # Migration files
│
├─ test/
│  ├─ unit/                         # Unit tests
│  ├─ e2e/                          # End-to-end tests
│  └─ load-tests/                   # Artillery load tests
│
└─ docker-compose.yml               # Local dev environment
```

---

## 🔄 EVENT-DRIVEN COMMUNICATION

### How Modules Communicate

```typescript
// ❌ BAD: Direct import across modules
// In MessagingModule:
import { BlockService } from '../block/block.service';

async sendMessage(senderId, recipientId, content) {
  // Check if blocked (tight coupling!)
  const isBlocked = await this.blockService.isBlocked(senderId, recipientId);
  if (isBlocked) throw new Error('User is blocked');
}

// ✅ GOOD: Event-driven
// In BlockModule: Emit event when user blocks someone
this.eventEmitter.emit('user.blocked', {
  blockerId: userId,
  blockedId: targetUserId,
  timestamp: new Date()
});

// In MessagingModule: Listen to block events
@OnEvent('user.blocked')
async handleUserBlocked(payload: UserBlockedEvent) {
  // Delete all messages between these users
  await this.messageService.deleteAllBetween(
    payload.blockerId,
    payload.blockedId
  );
}

// In PrivacyModule: Also listens to same event
@OnEvent('user.blocked')
async handleUserBlocked(payload: UserBlockedEvent) {
  // Invalidate permission cache
  await this.cacheService.invalidate(`permissions:${payload.blockerId}`);
}
```

### Key Events in System:

```typescript
details in 
```

---

## 💾 DATA FLOW PATTERNS

### 1. Send Message (1v1 Chat)

```
Client A → HTTP POST /messages
  ↓
MessageController.create()
  ↓
MessageService.create()
  ├─ Validate: Check if blocked, check privacy
  ├─ Save to DB (Prisma)
  ├─ Emit event: 'message.sent'
  ├─ Push to Redis Stream (for sync)
  └─ Return message to client
  ↓
Event Listeners:
  ├─ SocketGateway: Broadcast to recipient via Socket.IO
  ├─ NotificationListener: Queue FCM notification (if offline)
  └─ ReceiptService: Create delivery receipt
```

### 2. Upload Media

```
Client → GET /media/upload-url
  ↓
MediaController.getPresignedUrl()
  ↓
MediaService.generatePresignedUrl()
  ├─ Create MediaAttachment record (status: PENDING)
  ├─ Generate presigned URL for S3
  └─ Return URL to client (valid 15 min)
  ↓
Client uploads directly to S3 via presigned URL
  ↓
Client → POST /media/confirm-upload
  ↓
MediaService.confirmUpload()
  ├─ Update status: CONFIRMED
  ├─ Queue job: media-processing (SQS)
  ├─ Emit event: 'media.uploaded'
  └─ Return media metadata
  ↓
Bull Worker (same EC2 instance):
  ├─ Poll SQS queue
  ├─ Download from S3
  ├─ Resize image (Sharp library)
  ├─ Generate thumbnail
  ├─ Upload processed images back to S3
  ├─ Update MediaAttachment (status: READY)
  └─ Emit event: 'media.processed'
```

### 3. Voice/Video Call (WebRTC Signaling)

```
Caller → Socket.IO: emit('call:initiate')
  ↓
CallGateway.handleCallInitiate()
  ↓
CallService.initiate()
  ├─ Validate: Check if blocked, check privacy
  ├─ Create CallHistory record
  ├─ Emit event: 'call.initiated'
  └─ Return call session ID
  ↓
SocketGateway: Broadcast to callee
  ├─ emit('call:incoming', callData)
  └─ Callee rings
  ↓
Callee → Socket.IO: emit('call:answer')
  ↓
CallGateway.handleCallAnswer()
  ↓
  ├─ Update CallHistory (status: ANSWERED)
  ├─ Emit event: 'call.answered'
  └─ Start WebRTC negotiation
  ↓
SocketGateway: Exchange SDP/ICE candidates
  ├─ Caller ↔ Socket Server ↔ Callee
  ├─ P2P connection established
  └─ Media streams directly between peers
  ↓
Call ends → emit('call:end')
  ├─ Update CallHistory (status: COMPLETED, duration)
  └─ Emit event: 'call.ended'
```

---

## 🗄️ DATABASE STRATEGY

### PostgreSQL (Single Instance for MVP)

**Schema Highlights:**
- **Users**: 10K users × 500 bytes = 5 MB
- **Messages**: 20M messages × 300 bytes = 6 GB
- **MessageReceipts**: 40M receipts × 80 bytes = 3.2 GB (optimize with JSONB)
- **MediaAttachments**: 600K files × 400 bytes = 240 MB
- **Total**: ~14 GB (20GB RDS storage is enough)

**Indexes:**
```sql
-- Most critical indexes for performance
CREATE INDEX idx_messages_conversation_time 
  ON messages(conversation_id, created_at DESC);

CREATE INDEX idx_messages_sender 
  ON messages(sender_id, created_at DESC);

CREATE INDEX idx_message_receipts_user_status 
  ON message_receipts(user_id, status, timestamp DESC);

CREATE INDEX idx_friendships_users 
  ON friendships(user_id1, user_id2, status);

-- Full-text search (Postgres native)
CREATE INDEX idx_messages_search 
  ON messages USING GIN(to_tsvector('english', content));
```

**Connection Pooling:**
```typescript
// Prisma config
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  connectionLimit = 5  // Low limit for single instance
}
```

**When to Scale:**
- DB connections > 100 (out of 150 max) → Add PgBouncer
- Storage > 18GB (out of 20GB) → Resize to 40GB
- Query latency > 200ms → Add read replica

---

## 🚀 REDIS ARCHITECTURE

### Redis Usage (Self-Hosted on EC2 for MVP)

```
Redis Memory Layout (~200-300 MB):

1. Sessions (30 MB)
   Key: session:{sessionId}
   Value: {userId, deviceId, loginAt, ...}
   TTL: 7 days

2. User Presence (5 MB)
   Key: presence:{userId}
   Value: {status: 'online', lastSeenAt, deviceId}
   TTL: 5 minutes (refresh on heartbeat)

3. Cache (50 MB)
   Key: user:{userId}
   Value: {displayName, avatarUrl, ...}
   TTL: 15 minutes

   Key: permissions:{userId}:{targetId}
   Value: {canMessage: true, canCall: false, ...}
   TTL: 10 minutes

4. Unread Counts (10 MB)
   Key: unread:{userId}:{conversationId}
   Value: integer count
   TTL: No expiry (reset on read)

5. Typing Indicators (5 MB)
   Key: typing:{conversationId}
   Value: Set of userIds
   TTL: 3 seconds

6. Redis Streams (50 MB buffer)
   Stream: chat-sync:{userId}
   Messages: {messageId, conversationId, senderId, ...}
   Maxlen: 100 messages per user

7. Pub/Sub Channels (no storage)
   Channel: socket:{userId}
   Use: Broadcast to user's sockets across instances

Total: ~150 MB active data + 150 MB overhead = 300 MB
→ 512 MB instance is sufficient
```

### Redis Streams for Chat Sync

```typescript
// When message is sent
await redis.xadd(
  `chat-sync:${recipientId}`,
  '*', // Auto-generate ID
  'messageId', message.id,
  'conversationId', message.conversationId,
  'senderId', message.senderId,
  'content', message.content,
  'timestamp', Date.now()
);

// When user comes online (sync missed messages)
const messages = await redis.xread(
  'STREAMS',
  `chat-sync:${userId}`,
  lastMessageId || '0' // 0 = from beginning
);

// Trim stream to last 100 messages (save memory)
await redis.xtrim(`chat-sync:${userId}`, 'MAXLEN', '~', 100);
```

---

## 📦 STORAGE (S3) ARCHITECTURE

### S3 Bucket Structure

```
s3://zalo-chat-media/
│
├─ uploads/
│  ├─ temp/{uploadId}/{filename}           # Presigned URL uploads (24h TTL)
│  └─ final/{userId}/{messageId}/          # Confirmed uploads
│     ├─ image.jpg
│     ├─ video.mp4
│     └─ document.pdf
│
├─ processed/
│  ├─ images/{messageId}/
│  │  ├─ original.jpg
│  │  ├─ medium.jpg         # 800px width
│  │  └─ small.jpg          # 400px width
│  │
│  └─ thumbnails/{messageId}/
│     └─ thumb.jpg          # 150x150px
│
└─ avatars/{userId}/
   ├─ original.jpg
   └─ thumb.jpg
```

### Lifecycle Policies

```yaml
# Delete incomplete uploads after 24 hours
Rule: delete-temp-uploads
  Prefix: uploads/temp/
  Expiration: 1 day

# Transition old media to Glacier after 1 year (cheaper storage)
Rule: archive-old-media
  Prefix: uploads/final/
  Transition to Glacier: 365 days

# Delete soft-deleted media after 30 days
# (Implemented via cron job, not S3 lifecycle)
```

### Presigned URL Flow

```typescript
// 1. Client requests upload URL
const { uploadId, presignedUrl, expiresIn } = 
  await mediaService.getUploadUrl(userId, filename, mimeType);

// 2. Client uploads directly to S3
fetch(presignedUrl, {
  method: 'PUT',
  body: file,
  headers: { 'Content-Type': mimeType }
});

// 3. Client confirms upload
await mediaService.confirmUpload(uploadId, messageId);

// 4. Background job processes media
// - Move from temp/ to final/
// - Resize if image
// - Generate thumbnail
// - Update MediaAttachment record
```

---

## 🔄 QUEUE ARCHITECTURE (SQS + Bull)

### SQS Queues (Serverless, Pay Per Request)

```
1. media-processing.fifo
   - Image resize jobs
   - Thumbnail generation
   - Video metadata extraction (no transcoding in MVP)
   - Deduplication: Content-based (FIFO)
   - Retry: 3 attempts, exponential backoff
   - DLQ: media-processing-dlq.fifo

2. notifications.fifo
   - FCM push notifications
   - Deduplication: messageId
   - Retry: 5 attempts
   - DLQ: notifications-dlq.fifo

3. cleanup-jobs (standard queue)
   - Delete expired temp uploads (cron: daily)
   - Purge soft-deleted messages (cron: daily)
   - Archive old call history (cron: weekly)
```

### Bull Workers (On Same EC2 Instance)

```typescript
// Queue definition
import Bull from 'bull';

const mediaQueue = new Bull('media-processing', {
  redis: {
    host: '127.0.0.1',
    port: 6379,
    password: process.env.REDIS_PASSWORD
  }
});

// Worker (same process as API server for MVP)
mediaQueue.process(5, async (job) => {
  const { uploadId, mediaType } = job.data;
  
  if (mediaType === 'IMAGE') {
    await resizeImage(uploadId);
    await generateThumbnail(uploadId);
  }
  
  await updateMediaStatus(uploadId, 'READY');
});

// Cron job to poll SQS and add to Bull
@Cron('*/30 * * * * *') // Every 30 seconds
async pollSQS() {
  const messages = await sqs.receiveMessage({
    QueueUrl: process.env.AWS_SQS_MEDIA_QUEUE_URL,
    MaxNumberOfMessages: 10,
    WaitTimeSeconds: 20 // Long polling
  });
  
  for (const msg of messages.Messages) {
    await mediaQueue.add(JSON.parse(msg.Body));
    await sqs.deleteMessage({
      QueueUrl: process.env.AWS_SQS_MEDIA_QUEUE_URL,
      ReceiptHandle: msg.ReceiptHandle
    });
  }
}
```

---

## 🌐 SOCKET.IO ARCHITECTURE

### Gateway Setup

```typescript
@WebSocketGateway({
  cors: { origin: process.env.FRONTEND_URL },
  transports: ['websocket', 'polling'],
  adapter: createAdapter(redisClient) // Redis adapter for multi-instance
})
export class SocketGateway {
  
  @SubscribeMessage('message:send')
  async handleMessage(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: SendMessageDto
  ) {
    // 1. Validate & save message
    const message = await this.messageService.create(data);
    
    // 2. Broadcast to recipient(s)
    if (data.conversationType === 'DIRECT') {
      socket.to(`user:${data.recipientId}`).emit('message:new', message);
    } else {
      socket.to(`conversation:${data.conversationId}`).emit('message:new', message);
    }
    
    // 3. Acknowledge sender
    socket.emit('message:sent', { tempId: data.tempId, messageId: message.id });
  }
  
  @SubscribeMessage('typing:start')
  handleTypingStart(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { conversationId: string }
  ) {
    socket.to(`conversation:${data.conversationId}`).emit('typing:start', {
      userId: socket.data.userId,
      conversationId: data.conversationId
    });
  }
}
```

### Connection Management

```typescript
@SubscribeMessage('connection')
async handleConnection(@ConnectedSocket() socket: Socket) {
  const userId = socket.handshake.auth.userId;
  const deviceId = socket.handshake.auth.deviceId;
  
  // 1. Join user room
  socket.join(`user:${userId}`);
  
  // 2. Update presence
  await this.presenceService.setOnline(userId, deviceId);
  
  // 3. Sync missed messages
  const missedMessages = await this.redis.xread(
    'STREAMS',
    `chat-sync:${userId}`,
    socket.handshake.auth.lastMessageId || '0'
  );
  
  if (missedMessages.length) {
    socket.emit('messages:sync', missedMessages);
  }
  
  // 4. Broadcast online status
  socket.broadcast.emit('user:online', { userId });
}

@SubscribeMessage('disconnect')
async handleDisconnect(@ConnectedSocket() socket: Socket) {
  const userId = socket.data.userId;
  
  // Update presence (offline after 30 seconds of no connections)
  await this.presenceService.setOffline(userId, socket.id);
  
  // Broadcast offline status
  socket.broadcast.emit('user:offline', { userId });
}
```

---

## 📊 CAPACITY & PERFORMANCE

### Current Limits (Single EC2 t3.medium)

```
CPU: 2 vCPUs
  - API requests: ~50 req/sec
  - WebSocket messages: ~100 msg/sec
  - Background jobs: 5 concurrent
  - Headroom: ~40% CPU usage at peak

Memory: 4 GB RAM
  - Node.js process: 1.5 GB
  - Redis: 300 MB
  - OS + buffers: 1 GB
  - Available: 1.2 GB
  - Headroom: Comfortable

Network:
  - Bandwidth: Up to 5 Gbps
  - Concurrent connections: 5,000 (ulimit)
  - Active WebSockets: 3,000 (our target)
  - Headroom: Can handle 5K concurrent

Database (RDS db.t3.micro):
  - Max connections: 150
  - App connections: 5 (Prisma pool)
  - Available: 145 (plenty)
  - Storage: 20 GB (14 GB used at 6 months)
  - IOPS: 3,000 baseline (gp3)

Redis (512 MB self-hosted):
  - Memory used: ~300 MB
  - Max connections: 10,000
  - App connections: 10
  - Headroom: Plenty
```

### When to Scale Up

| Metric | Threshold | Action |
|--------|-----------|--------|
| EC2 CPU | > 70% sustained | Upgrade to t3.large |
| EC2 Memory | > 80% | Upgrade to t3.large |
| RDS Connections | > 100 | Add PgBouncer |
| RDS Storage | > 18 GB | Resize to 40 GB |
| Redis Memory | > 400 MB | Migrate to ElastiCache |
| Socket connections | > 4,000 | Add 2nd EC2 instance + ALB |

---

## 🔒 SECURITY HARDENING

### Network Security

```yaml
VPC:
  - Use default VPC for MVP (simplest)
  - Private subnets for future (RDS, ElastiCache)

Security Groups:
  EC2:
    - Inbound: 22 (SSH from your IP only)
    - Inbound: 80, 443 (HTTP/HTTPS from anywhere)
    - Inbound: 3000 (API for testing, remove in production)
    - Outbound: All (to access RDS, S3, SQS)
  
  RDS:
    - Inbound: 5432 (only from EC2 security group)
    - Outbound: None
  
  ElastiCache (future):
    - Inbound: 6379 (only from EC2 security group)
    - Outbound: None
```

### Application Security

```typescript
// Rate limiting (NestJS Throttler)
@Module({
  imports: [
    ThrottlerModule.forRoot({
      ttl: 60,
      limit: 100 // 100 requests per minute per IP
    })
  ]
})

// Helmet (security headers)
app.use(helmet());

// CORS
app.enableCors({
  origin: process.env.FRONTEND_URL,
  credentials: true
});

// JWT tokens
const accessToken = jwt.sign(payload, secret, { expiresIn: '15m' });
const refreshToken = jwt.sign(payload, refreshSecret, { expiresIn: '7d' });

// Password hashing
const hash = await bcrypt.hash(password, 12); // Salt rounds = 12
```

### Data Encryption

```yaml
At Rest:
  - RDS: Enable encryption (AES-256)
  - S3: Enable SSE-S3 (free)
  - ElastiCache: Enable encryption at rest

In Transit:
  - HTTPS everywhere (Let's Encrypt SSL)
  - WSS for WebSockets
  - Redis: TLS (if using ElastiCache)
  - RDS: SSL connection enforced
```

---

## 📈 MONITORING & ALERTS

### CloudWatch Metrics

```yaml
EC2:
  - CPUUtilization (alarm if > 80%)
  - NetworkIn/Out
  - DiskReadOps/WriteOps

RDS:
  - CPUUtilization (alarm if > 70%)
  - DatabaseConnections (alarm if > 100)
  - FreeStorageSpace (alarm if < 2 GB)
  - ReadLatency, WriteLatency

Application (Custom Metrics):
  - API latency (p95 < 200ms)
  - WebSocket latency (p95 < 50ms)
  - Error rate (< 0.1%)
  - Active connections

Costs:
  - Daily spend (alarm if > $2/day)
  - Monthly projection (alarm if > $40)
```

### Logging Strategy

```yaml
Application Logs:
  - Winston/Pino → CloudWatch Logs
  - Retention: 7 days (auto-delete)
  - Log levels: ERROR, WARN, INFO
  - Structured JSON logs

Access Logs:
  - Nginx access logs (if using reverse proxy)
  - Retention: 7 days

Error Tracking:
  - Sentry (free tier: 5K events/month)
  - Alert on critical errors
```

---

## 💰 COST OPTIMIZATION TIPS

### 1. Use Free Tier Aggressively

```
Free for 12 months:
  - EC2 t2.micro: 750 hours/month
  - RDS db.t3.micro: 750 hours/month
  - S3: 5 GB storage, 20K GET, 2K PUT
  - CloudWatch: 10 custom metrics

Always Free:
  - SQS: 1M requests/month
  - Lambda: 1M requests/month (future)
```

### 2. Self-Host Redis (Save $12/month)

```bash
# Install Redis on EC2
sudo apt install redis-server

# Configure persistence
sudo nano /etc/redis/redis.conf
# Set: save 900 1, save 300 10
# Set: requirepass YOUR_PASSWORD

# Cost: $0 (included in EC2)
# vs ElastiCache cache.t3.micro: $12/month
```

### 3. Use S3 Intelligent-Tiering

```bash
# Enable Intelligent-Tiering (auto move to cheaper storage)
aws s3api put-bucket-intelligent-tiering-configuration \
  --bucket zalo-chat-media \
  --id entire-bucket \
  --intelligent-tiering-configuration ...
```

### 4. Delete Incomplete Uploads

```yaml
S3 Lifecycle:
  - Delete multipart uploads after 1 day
  - Delete temp/ uploads after 1 day
  - Saves ~10% storage cost
```

### 5. Stop EC2/RDS When Not Developing

```bash
# Stop at night (6 PM), start in morning (8 AM)
# Saves ~50% cost if developing only 12 hours/day

# CloudWatch Event: cron(0 18 * * ? *)
aws ec2 stop-instances --instance-ids i-xxxxx

# CloudWatch Event: cron(0 8 * * ? *)
aws ec2 start-instances --instance-ids i-xxxxx
```

---

## 🚀 DEPLOYMENT WORKFLOW

### CI/CD with GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Deploy to AWS

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: SSH and deploy
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ubuntu
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            cd ~/zalo_backend
            git pull origin main
            npm install
            npm run build
            npx dotenv -e .env.production -- npx prisma migrate deploy
            pm2 restart zalo-backend
```

### Manual Deployment

```bash
# On local machine: Push to GitHub
git push origin main

# SSH to EC2
ssh -i ~/.ssh/zalo-chat-key.pem ubuntu@54.251.123.45

# Pull latest code
cd ~/zalo_backend
git pull origin main

# Install deps (if package.json changed)
npm install

# Build
npm run build

# Run migrations (if schema changed)
npx dotenv -e .env.production -- npx prisma migrate deploy

# Restart app
pm2 restart zalo-backend

# Check logs
pm2 logs zalo-backend --lines 50
```

---

## 📚 SCALING ROADMAP

### Phase 1: MVP (0-10K users, Months 1-6)
- ✅ Single EC2 instance
- ✅ Single RDS instance
- ✅ Self-hosted Redis
- ✅ S3 + SQS
- ✅ Basic monitoring

### Phase 2: Growth (10K-50K users, Months 7-12)
- [ ] Upgrade to t3.large
- [ ] Add RDS read replica
- [ ] Migrate to ElastiCache Redis cluster
- [ ] Add ALB + 2 EC2 instances
- [ ] Separate worker instances
- [ ] Add CloudFront CDN

### Phase 3: Scale (50K-100K users, Year 2)
- [ ] Auto-scaling groups (3-10 instances)
- [ ] Database partitioning (messages by month)
- [ ] Multi-AZ deployment
- [ ] Disaster recovery plan
- [ ] Advanced monitoring (Datadog/NewRelic)

### Phase 4: Microservices (100K+ users, Year 3+)
- [ ] Extract media service (ECS Fargate)
- [ ] Extract notification service
- [ ] Extract WebRTC signaling service
- [ ] Consider Kubernetes (EKS)
- [ ] Multi-region deployment

---

## ✅ FINAL CHECKLIST

**Before deploying to production:**

- [ ] AWS account setup with billing alerts
- [ ] IAM users created (no root access)
- [ ] RDS instance provisioned and tested
- [ ] EC2 instance provisioned with dependencies
- [ ] S3 bucket created with lifecycle rules
- [ ] SQS queues created with DLQs
- [ ] Redis configured with password
- [ ] SSL certificate installed (Let's Encrypt)
- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] PM2 configured to start on boot
- [ ] Monitoring dashboards setup
- [ ] Backup strategy documented
- [ ] Load testing completed (Artillery)
- [ ] Security hardening applied
- [ ] Team trained on deployment process
- [ ] Documentation updated

---

## 📞 SUPPORT & RESOURCES

- **AWS Documentation**: https://docs.aws.amazon.com/
- **NestJS Docs**: https://docs.nestjs.com/
- **Prisma Docs**: https://www.prisma.io/docs/
- **Socket.IO Docs**: https://socket.io/docs/
- **Bull Queue**: https://github.com/OptimalBits/bull

**Cost Calculator**: https://calculator.aws/
**Free Tier Details**: https://aws.amazon.com/free/

---

**Architecture Version**: 2.0 MVP  
**Last Updated**: Based on your requirements  
**Status**: Ready for implementation 🚀
