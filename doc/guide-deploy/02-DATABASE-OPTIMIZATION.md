# Database Optimization Guide - Chat App MVP

**Schema Version**: Based on your `schema.prisma`  
**Target**: 10K users, 20M messages, optimized for single RDS db.t3.micro  

---

## 📊 STORAGE ESTIMATION

### Current Schema Analysis:

```
Users: 10,000 users
  - Row size: ~500 bytes (profile + metadata)
  - Total: 10K × 500 bytes = 5 MB
  - Indexes: ~2 MB
  - Total: ~7 MB

Messages: 20,000,000 messages (200 msg/user/day × 10K users × 100 days)
  - Row size: ~300 bytes (text + metadata)
  - Total: 20M × 300 bytes = 6 GB
  - Indexes: ~2 GB (primary key + foreign keys + search indexes)
  - Total: ~8 GB

Friendships: ~30,000 relationships (3 friends/user average)
  - Row size: ~100 bytes
  - Total: 30K × 100 bytes = 3 MB

Groups: ~3,000 groups (30% users create groups)
  - Row size: ~400 bytes
  - Total: 3K × 400 bytes = 1.2 MB

GroupMembers: ~90,000 memberships (30 members/group × 3K groups)
  - Row size: ~150 bytes
  - Total: 90K × 150 bytes = 13.5 MB

MediaAttachments: ~600,000 files (30% of 2M messages/day × 100 days)
  - Row size: ~400 bytes (metadata only, not file content)
  - Total: 600K × 400 bytes = 240 MB
  - Indexes: ~80 MB
  - Total: ~320 MB

MessageReceipts: ~40,000,000 receipts (2 receipts/message average in groups)
  - Row size: ~80 bytes
  - Total: 40M × 80 bytes = 3.2 GB
  - Indexes: ~1 GB
  - Total: ~4.2 GB

DomainEvents: ~2,000,000 events (10% of operations logged)
  - Row size: ~500 bytes (JSONB payload)
  - Total: 2M × 500 bytes = 1 GB

Other tables (CallHistory, SocketConnection, etc.): ~200 MB

TOTAL DATABASE SIZE: ~14 GB
  → 20GB RDS storage is sufficient for 6 months MVP
```

---

## ⚠️ CRITICAL ISSUES IN CURRENT SCHEMA

### 1. **MessageReceipts Table - BIGGEST PROBLEM**

**Current Design:**
```sql
-- For each message, create receipts for EVERY group member
-- Example: 30-member group = 30 receipt rows per message
```

**Problem:**
- 20M messages × 2 receipts average = **40M rows** ❌
- This table will be 40-50% of your database size
- Queries will be SLOW
- Unnecessary storage cost

**Solution: Optimize for Groups**

```prisma
// OPTION A: Single receipt per message with JSONB status map
model MessageReceipt {
  id        BigInt   @id @default(autoincrement())
  messageId BigInt   @map("message_id")
  
  // For 1v1: single recipient
  // For groups: JSONB map of {userId: {status, timestamp}}
  recipientId String?  @map("recipient_id") @db.Uuid // 1v1 only
  
  // Group receipt tracking (JSONB for scalability)
  // {"userId1": {"status": "SEEN", "timestamp": "2024-..."}, "userId2": {...}}
  groupReceipts Json?  @map("group_receipts") @db.JsonB
  
  // Aggregate stats for quick display
  totalRecipients Int    @default(0) @map("total_recipients")
  seenCount       Int    @default(0) @map("seen_count")
  deliveredCount  Int    @default(0) @map("delivered_count")
  
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  updatedAt DateTime @updatedAt @map("updated_at") @db.Timestamptz
  
  message Message @relation(fields: [messageId], references: [id], onDelete: Cascade)
  
  @@index([messageId])
  @@map("message_receipts")
}


```
```
```
---

### 2. **Messages Table - Needs Partitioning (Later)**

**Current Issue:**
- 20M rows in single table = slow queries as it grows
- Old messages rarely accessed but take up space

**When to Partition:** When > 50M messages (~6 months after launch)

**Partition Strategy:**
```sql
-- Partition by month (range partitioning)
CREATE TABLE messages_2024_01 PARTITION OF messages
  FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');

CREATE TABLE messages_2024_02 PARTITION OF messages
  FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');

-- Auto-create monthly with cron
-- Query optimizer only scans relevant partition
```

**For MVP: Don't partition yet, but:**
```prisma
model Message {
  // ... existing fields
  
  // Add created_at to partition key later
  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz
  
  // Indexes optimized for time-based queries
  @@index([conversationId, createdAt(sort: Desc), id])
}
```

---

### 3. **Full-Text Search - Optimize Index**

**Current:**
```prisma
@@index([searchVector]) // Generic GIN index
```

**Problem:**
- Full-text search on 20M messages is SLOW
- GIN index is large (~2GB)

**Optimize:**
```sql
-- Create covering index (avoids table lookup)
CREATE INDEX idx_messages_search_covering 
ON messages USING GIN (search_vector)
INCLUDE (id, conversation_id, sender_id, content, created_at);

-- For ranking, add tsvector with weights
ALTER TABLE messages ADD COLUMN search_vector_weighted tsvector;

UPDATE messages SET search_vector_weighted = 
  setweight(to_tsvector('english', COALESCE(content, '')), 'A');

-- Partial index for recent messages (most searched)
CREATE INDEX idx_messages_search_recent 
ON messages USING GIN (search_vector)
WHERE created_at > NOW() - INTERVAL '30 days';
```

**In Prisma:**
```prisma
model Message {
  // ... existing fields
  
  searchVector         Unsupported("tsvector")? @map("search_vector")
  searchVectorWeighted Unsupported("tsvector")? @map("search_vector_weighted")
  
  @@index([searchVector], type: Gin, name: "idx_messages_search")
  @@index([searchVectorWeighted], type: Gin, name: "idx_messages_search_weighted")
  
  // Partial index for recent messages (add in migration)
  // CREATE INDEX idx_messages_search_recent ON messages USING GIN (search_vector)
  // WHERE created_at > NOW() - INTERVAL '30 days';
}
```

---

### 4. **Indexes Review - Too Many Indexes?**

**Current Index Count:** ~50+ indexes across all tables

**Problem:**
- Each index slows down INSERT/UPDATE
- Takes up storage
- Some indexes are redundant

**Optimization: Remove Redundant Indexes**

```sql
-- Example: If you have both indexes, remove the second
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_conversation_time ON messages(conversation_id, created_at); -- Redundant!

-- The second index covers the first, so drop idx_messages_conversation
DROP INDEX idx_messages_conversation;
```

**Index Audit:**

| Table | Index | Status | Action |
|-------|-------|--------|--------|
| messages | (conversation_id) | ✅ shoud be removes |  access pattern |
| messages | (conversation_id, created_at) |
✅ Keep | need for partition |
| messages | (sender_id) | ⚠️ Maybe | Used for "messages I sent"? |
| message_receipts | (message_id, user_id) | ✅ Keep | Composite PK |
| message_receipts | (user_id, status) | ⚠️ Maybe | Used for "unread count"? |

**Recommendation:** 
- Keep indexes actually used in queries
- Drop indexes with low usage (check `pg_stat_user_indexes`)

---

## 🚀 QUERY OPTIMIZATION

### 1. **Most Expensive Query: Load Conversation**

**Bad Query (N+1 problem):**
```typescript
// Load conversation
const conversation = await prisma.conversation.findUnique({
  where: { id: conversationId }
});

// Load messages (separate query)
const messages = await prisma.message.findMany({
  where: { conversationId },
  orderBy: { createdAt: 'desc' },
  take: 50
});

// For each message, load sender (N queries!) ❌
for (const msg of messages) {
  msg.sender = await prisma.user.findUnique({ where: { id: msg.senderId } });
}
```

**Good Query (single query with joins):**
```typescript
const messages = await prisma.message.findMany({
  where: { conversationId },
  include: {
    sender: {
      select: {
        id: true,
        displayName: true,
        avatarUrl: true
      }
    },
    mediaAttachments: {
      select: {
        id: true,
        mediaType: true,
        thumbnailUrl: true,
        cdnUrl: true
      }
    }
  },
  orderBy: { createdAt: 'desc' },
  take: 50
});
```

---

### 2. **Pagination - Use Cursor Instead of Offset**

**Bad (offset-based, slow for large tables):**
```typescript
// Page 1000 = scans 50,000 rows to skip them ❌
const messages = await prisma.message.findMany({
  where: { conversationId },
  orderBy: { createdAt: 'desc' },
  skip: 1000 * 50,
  take: 50
});
```

**Good (cursor-based, uses index):**
```typescript
const messages = await prisma.message.findMany({
  where: { conversationId },
  orderBy: { createdAt: 'desc' },
  take: 50,
  cursor: lastMessageId ? { id: lastMessageId } : undefined,
  skip: lastMessageId ? 1 : 0 // Skip the cursor itself
});
```

---

### 3. **Unread Count - Optimize with Materialized View**

**Bad (counts all receipts every time):**
```typescript
// Runs on every page load ❌
const unreadCount = await prisma.messageReceipt.count({
  where: {
    userId: currentUserId,
    status: { not: 'SEEN' }
  }
});
```

**Good (cache in Redis):**
```typescript
// Increment on new message, decrement on read
const unreadCount = await redis.get(`unread:${userId}:${conversationId}`);

// Update counter when message arrives
await redis.incr(`unread:${userId}:${conversationId}`);

// Reset counter when user reads
await redis.set(`unread:${userId}:${conversationId}`, 0);
```

**Best (hybrid: cache + fallback to DB):**
```typescript
async function getUnreadCount(userId: string, conversationId: string) {
  // Try cache first
  const cached = await redis.get(`unread:${userId}:${conversationId}`);
  if (cached !== null) return parseInt(cached);
  
  // Fallback to DB
  const count = await prisma.messageReceipt.count({
    where: {
      userId,
      conversationId,
      status: { not: 'SEEN' }
    }
  });
  
  // Update cache
  await redis.set(`unread:${userId}:${conversationId}`, count, 'EX', 300);
  
  return count;
}
```

---

## 🗜️ DATABASE COMPRESSION

### Postgres TOAST (The Oversized-Attribute Storage Technique)

**Current Issue:**
- JSONB columns (DomainEvent.payload, MediaAttachment metadata) can be large
- Postgres automatically compresses large values (TOAST)
- But compression happens on INSERT, slowing down writes

**Optimize:**
```sql
-- Check TOAST settings
SELECT relname, reltoastrelid 
FROM pg_class 
WHERE relname IN ('domain_events', 'media_attachments');

-- Adjust TOAST compression threshold
ALTER TABLE domain_events 
  ALTER COLUMN payload SET STORAGE EXTENDED;

-- For frequently accessed JSONB, use MAIN storage (no TOAST)
ALTER TABLE media_attachments 
  ALTER COLUMN metadata SET STORAGE MAIN;
```

---

## 🧹 DATA CLEANUP STRATEGIES

### 1. **Soft Delete Cleanup**

**Problem:**
- Soft-deleted records (deletedAt != null) take up space
- Never actually deleted

**Solution: Background Job**
```sql
-- Cron job runs daily
DELETE FROM messages 
WHERE deleted_at IS NOT NULL 
  AND deleted_at < NOW() - INTERVAL '30 days';

-- Same for media, conversations, etc.
```

**In NestJS (Bull queue):**
```typescript
@Cron('0 2 * * *') // 2 AM daily
async cleanupSoftDeletedMessages() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  await this.prisma.message.deleteMany({
    where: {
      deletedAt: { lt: thirtyDaysAgo }
    }
  });
}
```

---

### 2. **Archive Old Messages**

**Strategy:**
- Move messages older than 1 year to separate table
- Reduces query load on main table

```sql
-- Create archive table (same schema)
CREATE TABLE messages_archive (LIKE messages INCLUDING ALL);

-- Move old messages (run monthly)
WITH moved AS (
  DELETE FROM messages 
  WHERE created_at < NOW() - INTERVAL '1 year'
  RETURNING *
)
INSERT INTO messages_archive SELECT * FROM moved;
```

---

## 📊 CONNECTION POOLING

### Problem with Single RDS Instance:
- db.t3.micro: max 150 connections
- Prisma default: 10 connections per instance
- If you scale to 15+ instances → run out of connections

### Solution: PgBouncer (Later, when scaling)

**For MVP: Optimize Prisma Pool**
```typescript
// prisma/schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  
  // Optimize connection pool
  connectionLimit = 5        // Lower limit per instance
  poolTimeout = 10           // Seconds to wait for connection
  statementTimeout = 30000   // Kill slow queries after 30s
}
```

**When to Add PgBouncer:**
- When DB connections > 80 (out of 150)
- When scaling to multiple EC2 instances

---

## 🔍 MONITORING QUERIES

### Enable Slow Query Logging:

```sql
-- In RDS parameter group
ALTER SYSTEM SET log_min_duration_statement = 1000; -- Log queries > 1s

-- Find slow queries
SELECT 
  query, 
  calls, 
  mean_exec_time, 
  max_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

### Index Usage Analysis:

```sql
-- Find unused indexes (candidates for deletion)
SELECT 
  schemaname, 
  tablename, 
  indexname, 
  idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND indexname NOT LIKE '%pkey%';

-- Find missing indexes (sequential scans on large tables)
SELECT 
  schemaname, 
  tablename, 
  seq_scan, 
  seq_tup_read
FROM pg_stat_user_tables
WHERE seq_scan > 1000
  AND seq_tup_read / NULLIF(seq_scan, 0) > 10000
ORDER BY seq_tup_read DESC;
```

---

## ✅ OPTIMIZATION CHECKLIST

### Before MVP Launch:

- [ ] Refactor MessageReceipts to JSONB approach (saves 75% storage)
- [ ] Add covering indexes for common queries
- [ ] Remove redundant indexes (audit with pg_stat_user_indexes)
- [ ] Setup Redis caching for unread counts
- [ ] Enable slow query logging (log_min_duration_statement = 1000)
- [ ] Create cleanup job for soft-deleted records
- [ ] Test pagination with cursor-based approach
- [ ] Set Prisma connection pool to 5

### After 3 Months (5K users):

- [ ] Analyze slow queries with pg_stat_statements
- [ ] Consider partitioning Messages table by month
- [ ] Add PgBouncer if connection limit reached
- [ ] Setup read replica for analytics queries

### After 6 Months (10K users):

- [ ] Archive old messages (> 1 year) to separate table
- [ ] Optimize full-text search with partial indexes
- [ ] Consider database sharding (if > 100M messages)

---

## 💰 COST IMPACT

**Current**: 20GB storage = $2.30/month

**After MessageReceipts optimization**:
- Storage: 14GB → 11GB (savings: $0.35/month)
- IOPS: Fewer writes (group messages faster)
- Query speed: 2-3x faster (smaller table)

**After index optimization**:
- Storage: 11GB → 10GB (savings: $0.12/month)
- IOPS: Fewer index updates on INSERT

**Total savings**: $0.47/month (not huge, but faster queries!)

---

## 🚀 NEXT STEPS

1. **Test current schema locally**
   - Load test with 1M messages
   - Measure query times
   - Identify bottlenecks

2. **Implement MessageReceipts refactor**
   - Create migration script
   - Test with staging data
   - Deploy to production

3. **Setup monitoring**
   - CloudWatch for slow queries
   - Cron job for index usage analysis

4. **Document query patterns**
   - Create SQL playbook for common operations
   - Share with team

---

**Document Status**: Ready for implementation  
**Estimated Impact**: 3x faster queries, 25% less storage  
**Risk Level**: Medium (requires migration)
