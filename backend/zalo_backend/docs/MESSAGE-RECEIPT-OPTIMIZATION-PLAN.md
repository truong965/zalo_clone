# Kế hoạch tối ưu MessageReceipt — Hybrid Approach

> **Ngày tạo:** 2026-02-15  
> **Phạm vi:** Backend (schema, message module, socket events) + Frontend (types, receipt rendering)  
> **Mục tiêu:** Loại bỏ `MessageReceipt` model, thay thế bằng hybrid approach: JSONB cho 1v1, counters cho group

---

## 1. Đánh giá giải pháp

### 1.1 Ưu điểm

| # | Ưu điểm | Chi tiết |
|---|---------|----------|
| 1 | **Giảm ~98% storage** | 32 GB → 0.6 GB (scenario 10K users, 6 tháng). Loại bỏ hoàn toàn `message_receipts` table |
| 2 | **Loại bỏ N+1 query** | Hiện tại: mỗi message query receipts table riêng. Mới: receipt data nằm trong chính message row |
| 3 | **Đơn giản hóa group receipt** | Chỉ cần 3 integer counters thay vì N rows (N = số member) |
| 4 | **Lazy load chi tiết group** | "Ai đã xem" chỉ query khi user click — tận dụng `lastReadMessageId` đã có sẵn trên `ConversationMember` |
| 5 | **1v1 receipt vẫn chi tiết** | `directReceipts` JSONB giữ timestamp chính xác cho delivered/seen per recipient |
| 6 | **Giảm write amplification** | Group: 1 atomic `UPDATE SET seen_count = seen_count + 1` thay vì N inserts |
| 7 | **Index hiệu quả hơn** | Loại bỏ 3 indexes trên `message_receipts` (composite PK, `userId+status+timestamp`, `messageId+status`) |

### 1.2 Rủi ro & Cân nhắc

| # | Rủi ro | Mức độ | Giải pháp |
|---|--------|--------|-----------|
| R1 | **JSONB không enforce schema** — `directReceipts` có thể bị corrupt | LOW | Validate via application layer + TypeScript types. JSONB rất ổn định trên Postgres |
| R2 | **Race condition `seen_count`** — 2 users đọc cùng lúc → count sai | LOW | `seen_count = seen_count + 1` là atomic trong Postgres. Dùng `$executeRaw` với single UPDATE |
| R3 | **Double-count** — Cùng user đọc message 2 lần → `seen_count` increment 2x | MEDIUM | So sánh `previousLastReadId` trước khi increment. Backend cần check `lastReadMessageId > currentLastReadId` |
| R4 | **JSONB index** — Query theo `directReceipts` fields cần GIN index nếu query frequently | LOW | Không cần index — chỉ read JSONB khi render message UI, không search bằng receipt fields |
| R5 | **Migration phức tạp** — Data migration từ `message_receipts` sang `directReceipts` JSONB | MEDIUM | Chạy migration script riêng, backfill cho DIRECT conversations, set counters cho GROUP |
| R6 | **`totalRecipients` stale khi member join/leave group** | LOW | Accept eventual consistency. Hoặc recalculate khi member count thay đổi (batch job) |
| R7 | **`seenCount` có thể > `totalRecipients`** nếu members join sau khi message gửi rồi đọc | LOW | Clamp ở UI: `Math.min(seenCount, totalRecipients)`. Không cần fix ở DB |

### 1.3 Kết luận

**Giải pháp HYBRID phù hợp.** Đây là pattern chuẩn của các messaging app lớn (WhatsApp, Telegram, Signal):
- 1v1: Full receipt detail (JSONB) — vì chỉ 1 recipient, data nhỏ
- Group: Aggregate counters — vì detail không cần real-time, lazy load từ `ConversationMember.lastReadMessageId`

**Khuyến nghị bổ sung:**
- Thêm check double-count (R3) bằng cách so sánh `previousLastReadId` trước khi increment
- Frontend clamp `seenCount` tại `totalRecipients` (R7)
- Không cần GIN index trên `directReceipts` — chỉ read, không search

---

## 2. Thay đổi Schema

### 2.1 Message Model — Thêm columns

```prisma
model Message {
  // ... existing fields ...

  // 🆕 Receipt counters (group conversations)
  deliveredCount  Int   @default(0) @map("delivered_count")
  seenCount       Int   @default(0) @map("seen_count")
  totalRecipients Int   @default(0) @map("total_recipients")

  // 🆕 JSONB receipt (1v1 / DIRECT conversations only)
  directReceipts  Json? @map("direct_receipts") @db.JsonB

  // ❌ XÓA relation
  // receipts  MessageReceipt[]  ← REMOVE
}
```

### 2.2 MessageReceipt Model — XÓA

```prisma
// ❌ XÓA toàn bộ model
// model MessageReceipt { ... }
```

### 2.3 ReceiptStatus Enum — TÙY CHỌN

- Nếu `ReceiptStatus` chỉ dùng cho `MessageReceipt` → XÓA enum
- Nếu dùng ở nơi khác → giữ lại

### 2.4 ConversationMember — Đã có sẵn (không đổi)

`lastReadMessageId` và `lastReadAt` đã tồn tại trên `ConversationMember` — đây là data source cho "ai đã xem" trong group.

---

## 3. Thay đổi Backend

### 3.1 ReceiptService — Refactor hoàn toàn

Hiện tại `receipt.service.ts` dùng `prisma.messageReceipt.upsert()` và bulk insert. Cần refactor thành:

**Luồng 1v1 (DIRECT):**
- `markDelivered(messageId, userId)` → `jsonb_set()` trên `direct_receipts`
- `markSeen(messageId, userId)` → `jsonb_set()` trên `direct_receipts` + increment `seen_count`

**Luồng Group:**
- `markConversationRead(userId, conversationId)` → Update `ConversationMember.lastReadMessageId` + bulk increment `seen_count` trên affected messages
- Không tạo/update `directReceipts` cho group

### 3.2 MessageService — Thêm `totalRecipients` khi tạo message

- 1v1: `totalRecipients = 1`, `directReceipts = { [recipientId]: { delivered: null, seen: null } }`
- Group: `totalRecipients = memberCount - 1` (trừ sender), `directReceipts = null`

### 3.3 Socket Events — Update payload

| Event | Hiện tại | Sau thay đổi |
|-------|----------|-------------|
| `message:receipt` | Emit full `MessageReceipt` object | Emit `{ messageId, userId, type: 'delivered'│'seen', conversationId }` |
| `conversation:read` | N/A (chưa có riêng) | Emit `{ userId, conversationId, messageId, timestamp }` cho group read |

### 3.4 MessageGateway / Event Handlers

- `handleMarkAsRead` cần phân biệt DIRECT vs GROUP:
  - DIRECT: Update `directReceipts` JSONB + emit `message:receipt` per message
  - GROUP: Update `ConversationMember.lastReadMessageId` + batch increment `seenCount` + emit `conversation:read`

### 3.5 Prisma Migration

- `ALTER TABLE messages ADD COLUMN delivered_count INT DEFAULT 0`
- `ALTER TABLE messages ADD COLUMN seen_count INT DEFAULT 0`
- `ALTER TABLE messages ADD COLUMN total_recipients INT DEFAULT 0`
- `ALTER TABLE messages ADD COLUMN direct_receipts JSONB`
- Data migration script (backfill)
- `DROP TABLE message_receipts` (sau khi verify backfill)

---

## 4. Thay đổi Frontend

### 4.1 Types — Update `MessageListItem`

```typescript
// Thêm vào interface MessageListItem
deliveredCount?: number;
seenCount?: number;
totalRecipients?: number;
directReceipts?: Record<string, { delivered: string | null; seen: string | null }>;

// XÓA
// receipts?: MessageReceiptItem[];
```

### 4.2 Receipt Rendering Logic

```
// 1v1 Chat:
- Read directReceipts[recipientId]
- seen → "✓✓ Đã xem" (blue)
- delivered → "✓✓ Đã nhận" (gray)
- null → "✓ Đã gửi"

// Group Chat:
- seenCount === totalRecipients → "✓✓ Tất cả đã xem"
- seenCount > 0 → "✓✓ đã xem"
- deliveredCount > 0 → "✓✓ đã nhận"
- 0 → "✓ Đang gửi"
```

### 4.3 Socket Event Handlers

- `message:receipt` handler cần update JSONB field trên cached message (1v1)
- `conversation:read` handler cần increment `seenCount` trên cached messages (group)
- TanStack Query cache update: `queryClient.setQueryData()` modify message in-place

### 4.4 "Chi tiết ai đã xem" (Group — Lazy Load)

- Thêm API endpoint: `GET /messages/:id/seen-by`
- Query `ConversationMember WHERE lastReadMessageId >= messageId`
- Frontend: Button "Xem chi tiết" → popover với list users + seenAt
- Chỉ fetch khi user click (không auto-load)

---

## 5. Data Migration Strategy

### 5.1 Phân giai đoạn

| Phase | Thao tác | Downtime |
|-------|----------|----------|
| **M1** | Add new columns (non-breaking) | ❌ None |
| **M2** | Deploy backend code hỗ trợ cả 2 (read old + write new) | ❌ None |
| **M3** | Backfill script: populate counters + JSONB từ `message_receipts` | ❌ None (background job) |
| **M4** | Verify data consistency | ❌ None |
| **M5** | Deploy backend chỉ dùng new approach | ❌ None |
| **M6** | Drop `message_receipts` table | ❌ None |

### 5.2 Backfill Script — Logic

```
1. DIRECT conversations:
   - Query message_receipts GROUP BY messageId
   - Build JSONB { userId: { delivered, seen } }
   - UPDATE messages SET direct_receipts = ..., delivered_count = ..., seen_count = ..., total_recipients = 1

2. GROUP conversations:
   - Count receipts per message: COUNT(*) WHERE status = 'DELIVERED', COUNT(*) WHERE status = 'SEEN'
   - UPDATE messages SET delivered_count = ..., seen_count = ..., total_recipients = (member_count - 1)
```

### 5.3 Batch Processing

- Process 1000 messages per batch
- Use cursor pagination (ORDER BY id)
- Log progress for resumability
- Estimated time: ~30 min cho 5M messages

---

## 6. Task Breakdown

### Phase A: Schema Migration (1 ngày)

| Task | Mô tả |
|------|--------|
| A.1 | Thêm 4 columns vào Message model (Prisma schema) |
| A.2 | Tạo Prisma migration |
| A.3 | Viết backfill script (SQL hoặc Node.js) |

### Phase B: Backend Refactor (2-3 ngày)

| Task | Mô tả |
|------|--------|
| B.1 | Refactor `ReceiptService` — tách logic DIRECT vs GROUP |
| B.2 | Update `MessageService.sendMessage()` — set `totalRecipients` + `directReceipts` |
| B.3 | Update socket handlers — `markAsRead` phân biệt DIRECT/GROUP |
| B.4 | Thêm `GET /messages/:id/seen-by` endpoint (lazy load group details) |
| B.5 | Update socket event payload `message:receipt` |
| B.6 | Dual-write compatibility (read old + write new) trong transition period |

### Phase C: Frontend Update (1-2 ngày)

| Task | Mô tả |
|------|--------|
| C.1 | Update `MessageListItem` type — thêm new fields, remove `receipts` |
| C.2 | Refactor receipt rendering component — DIRECT vs GROUP logic |
| C.3 | Update `use-message-socket.ts` — handle new receipt payload |
| C.4 | Implement "Chi tiết ai đã xem" popover component (group) |
| C.5 | TanStack Query cache updates cho receipt events |

### Phase D: Cleanup (0.5 ngày)

| Task | Mô tả |
|------|--------|
| D.1 | Run backfill script trên production |
| D.2 | Verify data consistency (spot check) |
| D.3 | Remove `MessageReceipt` model từ Prisma schema |
| D.4 | Remove `ReceiptStatus` enum nếu không dùng ở nơi khác |
| D.5 | Drop `message_receipts` table |
| D.6 | Clean up old receipt code/types/imports |

---

## 7. Monitoring & Rollback

### 7.1 Metrics cần theo dõi

- `messages` table size trước/sau
- Average query time cho message list (có receipt data)
- `seen_count` accuracy (spot check random messages)

### 7.2 Rollback Plan

- Phase M1-M2: Revert migration, columns mới bị ignore
- Phase M3-M5: Có thể rebuild `message_receipts` từ `directReceipts` JSONB + `ConversationMember.lastReadMessageId`
- Phase M6 (drop table): **Không rollback được** — chỉ thực hiện sau khi fully verified

---

## Tổng kết

| Metric | Giá trị |
|--------|---------|
| **Estimated effort** | 5-7 ngày dev |
| **Storage saving** | ~98% (32 GB → 0.6 GB cho 10K users/6 months) |
| **Write performance** | ~50x better cho group messages (1 UPDATE vs N INSERTs) |
| **Read performance** | ~2x better (no JOIN to receipts table) |
| **Breaking changes** | Socket event payload, frontend types |
| **Downtime required** | 0 (phased migration) |
