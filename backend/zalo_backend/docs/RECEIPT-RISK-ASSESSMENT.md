# Đánh giá Risk — Hybrid Receipt Implementation

> Ngày đánh giá: 2026-02-17  
> Phạm vi: `receipt.service.ts`, `message-realtime.service.ts`, `message-broadcaster.service.ts`

---

## RISK 1: Race Condition trong Group Read (HIGH SEVERITY)

### Phân tích: ✅ ĐÚNG — Đây là risk thực sự

**Mô tả vấn đề:** `markGroupConversationRead()` thực hiện pattern read-then-write không atomic:

```
Step 1: SELECT lastReadMessageId          ← read
Step 2: UPDATE lastReadMessageId = new    ← write
Step 3: UPDATE messages SET seen_count+1  ← write (dựa trên range từ step 1)
```

Nếu 2 request đồng thời từ cùng 1 user:
- Request A reads `previousLastReadId = 100`
- Request B reads `previousLastReadId = 100` (A chưa update xong)
- Cả 2 đều increment `seenCount` cho range `(100, 200]` → **double-count**

**Mức độ nghiêm trọng: HIGH** — Đúng đánh giá. Data corruption (seenCount sai) không tự heal, chỉ có thể fix bằng recalculate batch job.

**Xác suất xảy ra:** MEDIUM — User mở app trên 2 device, scroll qua nhiều messages, cả 2 device emit `MESSAGE_SEEN` gần như đồng thời. Hoặc frontend retry khi network rung lắc.

### Giải pháp đề xuất

**Approach 1: Pessimistic Lock (SELECT … FOR UPDATE)** — Đơn giản nhất

Wrap cả 3 bước trong 1 transaction với `SELECT … FOR UPDATE` trên `ConversationMember`. Điều này đảm bảo chỉ 1 request có thể thực hiện tại 1 thời điểm cho mỗi `(userId, conversationId)` — request thứ 2 sẽ block chờ request thứ nhất commit.

- **Ưu điểm:** Simple, dễ hiểu, đúng hoàn toàn
- **Nhược điểm:** Lock contention nếu user read rất nhanh — nhưng đây là low-frequency operation (user chỉ read vài lần/phút)
- **Phù hợp:** ✅ Recommended — messaging app không có high-write contention trên cùng 1 member row

**Approach 2: Atomic CAS (Compare-And-Swap) với single query**

Kết hợp step 1 + 2 thành 1 `UPDATE … WHERE lastReadMessageId < newId RETURNING lastReadMessageId` — nếu trả về 0 rows nghĩa là đã có request khác update trước → skip increment. Tuy nhiên cách này phải dùng raw SQL phức tạp hơn.

**Đánh giá:** Approach 1 (transaction + `FOR UPDATE`) là phù hợp nhất cho scale hiện tại. Chỉ cần đảm bảo transaction ngắn (không có I/O bên ngoài DB trong transaction).

---

## RISK 2: N+1 Query trong Offline Sync (MEDIUM SEVERITY)

### Phân tích: ✅ ĐÚNG — Risk thực sự nhưng severity nên là LOW-MEDIUM

**Mô tả vấn đề:** Trong `syncOfflineMessages()`:

```typescript
for (const qm of offlineMessages) {
  await this.broadcaster.broadcastReceiptUpdate(message.senderId, { ... });
}
```

100 offline messages = 100 `Redis PUBLISH` commands tuần tự.

**Mức độ nghiêm trọng: LOW-MEDIUM** (không phải MEDIUM)

- Redis PUBLISH rất nhanh (~0.1ms/command trên localhost, ~1-2ms qua network)
- 100 messages × 2ms = ~200ms — chấp nhận được cho 1 lần sync khi reconnect
- Chỉ thành vấn đề khi Redis ở remote region hoặc user có >1000 offline messages

**Xác suất xảy ra:** Câu hỏi là bao nhiêu offline messages trung bình? Nếu app chỉ queue messages trong 1-2 ngày và user active → thường <50 messages. Nếu queue không giới hạn → có thể lên 10K.

### Giải pháp đề xuất

**Approach: Group broadcasts by senderId + batch emit**

Thay vì emit 1 receipt per message, group all receipt updates by `senderId` và emit 1 batch event per sender. Sender's frontend nhận 1 payload chứa array messageIds thay vì N events riêng lẻ.

Đồng thời dùng **Redis pipeline** (MULTI/EXEC hoặc pipeline API) để gom N `PUBLISH` thành 1 round-trip.

**Lưu ý:** Nên kết hợp với **giới hạn offline queue** (cap tối đa 500-1000 messages per user) — đây mới là root fix cho vấn đề "10K offline messages".

---

## RISK 3: Missing Transaction trong markDirectSeen (LOW SEVERITY)

### Phân tích: ⚠️ ĐÚNG NHƯNG SEVERITY CÒN THẤP HƠN — gần như NEGLIGIBLE

**Mô tả vấn đề:** `markAsSeen()` trong `message-realtime.service.ts` gọi 2 operations tuần tự:

```typescript
await this.receiptService.markDirectSeen(messageIds, userId);   // ← SQL update
await this.resetUnreadCount(dto.conversationId, userId);         // ← SQL update
```

Nếu `markDirectSeen` thành công nhưng `resetUnreadCount` fail → messages marked "seen" nhưng unreadCount vẫn > 0.

**Tại sao severity thấp hơn bạn nghĩ:**

1. `resetUnreadCount` là một UPDATE đơn giản trên 1 row — xác suất fail cực kỳ thấp (chỉ khi DB connection bị đứt giữa chừng)
2. **Hậu quả nhẹ:** unreadCount sai chỉ ảnh hưởng badge UI — user mở conversation lần sau sẽ tự trigger `markAsSeen` lại → unreadCount được reset
3. **Self-healing:** Mỗi lần user mở conversation, frontend emit `MESSAGE_SEEN` → `resetUnreadCount` được gọi lại → tự fix

**Tuy nhiên**, nếu muốn đúng hoàn toàn thì nên wrap trong transaction.

### Giải pháp đề xuất

Wrap `markDirectSeen` + `resetUnreadCount` trong cùng 1 Prisma interactive transaction (`prisma.$transaction()`). Tuy nhiên lưu ý: `markDirectSeen` dùng `$executeRaw` nên transaction phải dùng raw SQL `BEGIN/COMMIT` hoặc Prisma interactive transaction mode.

**Đánh giá:** Nice-to-have, không urgent. Nếu muốn clean code thì implement, nhưng không phải priority.

---

## RISK 4: Potential Memory Issue khi Bulk Update (LOW-MEDIUM)

### Phân tích: ✅ ĐÚNG — Risk hợp lệ

**Mô tả vấn đề:** `bulkMarkDirectDelivered()` nhận array messageIds và truyền vào SQL `WHERE id = ANY(${messageIds}::bigint[])`. Nếu user offline lâu → array có thể rất lớn.

**Tuy nhiên, severity cần xem xét kỹ hơn:**

1. **PostgreSQL xử lý `ANY(array)` tốt** — đây là parameterized query, PG tối ưu thành index scan. 10K elements trong array thường chạy <500ms nếu có index trên `id` (primary key)
2. **Memory concern:** 10K `bigint` values = ~80KB memory — không phải vấn đề
3. **Real bottleneck:** Không phải SQL query mà là **offline message queue** chứa 10K messages (Redis memory + deserialization)
4. **PostgreSQL limit:** Query parameter size limit ~1GB — 10K bigints không gần limit

**Xác suất xảy ra:** Phụ thuộc vào offline queue policy. Nếu không cap queue → có thể xảy ra. Nếu cap 500-1000 → không bao giờ xảy ra.

### Giải pháp đề xuất

**Approach: Chunk + Cap**

1. **Cap offline queue** tại Redis level: tối đa 500-1000 messages per user. Messages cũ hơn bị discard (user sẽ fetch bằng HTTP pagination)
2. **Chunk SQL updates**: Nếu vì lý do nào đó array lớn, split thành chunks 500 IDs/batch, execute tuần tự. Tuy nhiên nếu đã cap queue thì không cần chunk.

**Đánh giá:** Giải pháp đúng hướng. Cap offline queue là root fix — chunk chỉ là defense-in-depth.

---

## RISK 5: Missing Index cho JSONB Query (PERFORMANCE)

### Phân tích: ⚠️ SAI — Risk này KHÔNG tồn tại trong thực tế

**Mô tả vấn đề:** Các query trong `receipt.service.ts` dùng JSONB condition:

```sql
WHERE (COALESCE(direct_receipts, '{}'::jsonb) -> ${userId} ->> 'delivered') IS NULL
```

**Tại sao risk này không đúng:**

1. **Query luôn có `WHERE id = ${messageId}` hoặc `WHERE id = ANY(${messageIds})`** — PostgreSQL dùng **primary key index** để tìm row trước, sau đó mới check JSONB condition trên 1 (hoặc vài) rows đã tìm được
2. JSONB condition chỉ là **filter condition** trên rows đã được narrowed bởi PK index — không bao giờ full table scan
3. **Trường hợp `markGroupConversationRead`** dùng `WHERE conversation_id = X AND id > A AND id <= B` — đây filter bằng composite index `(conversation_id, created_at)` hoặc PK range — vẫn là index scan, không full scan

**Xem lại các query pattern:**

| Method | WHERE clause | Index dùng | JSONB scan? |
|--------|-------------|------------|-------------|
| `markDirectDelivered` | `id = ${messageId} AND jsonb...` | PK (1 row) | 1 row only |
| `bulkMarkDirectDelivered` | `id = ANY(ids) AND jsonb...` | PK (N rows) | N rows only |
| `markDirectSeen` | `id = ANY(ids) AND jsonb...` | PK (N rows) | N rows only |
| `markGroupConversationRead` | `conversation_id = X AND id > A AND id <= B` | PK range | **No JSONB** |

**Kết luận:** Không cần GIN index trên `directReceipts`. Tất cả query đều bắt đầu từ PK lookup → JSONB được eval trên tập kết quả nhỏ (1-50 rows), không bao giờ scan 20M rows.

> **Lưu ý:** Nếu tương lai có query kiểu `SELECT * FROM messages WHERE direct_receipts -> ${userId} ->> 'seen' IS NOT NULL` (không có PK filter) thì mới cần GIN index. Hiện tại không có use case này.

---

## Tổng kết

| Risk | Đánh giá | Severity thực tế | Cần fix? | Ưu tiên |
|------|----------|-------------------|----------|---------|
| **R1: Race Condition Group Read** | ✅ Đúng | **HIGH** | ✅ Cần fix ngay | P0 |
| **R2: N+1 Offline Sync** | ✅ Đúng | LOW-MEDIUM | ⚠️ Nice-to-have | P2 |
| **R3: Missing Transaction** | ✅ Đúng nhưng self-healing | NEGLIGIBLE | ❌ Optional | P3 |
| **R4: Bulk Update Memory** | ✅ Đúng | LOW | ⚠️ Cap offline queue | P2 |
| **R5: Missing JSONB Index** | ❌ Sai | NONE | ❌ Không cần | — |

### Thứ tự ưu tiên triển khai

1. **P0 — R1:** Transaction + `SELECT FOR UPDATE` cho `markGroupConversationRead` — fix data corruption
2. **P2 — R2 + R4:** Cap offline queue (500-1000) + batch broadcast by senderId — cả 2 risk này share cùng root cause (unbounded offline queue)
3. **P3 — R3:** Wrap trong transaction nếu có thời gian — không urgent vì self-healing
