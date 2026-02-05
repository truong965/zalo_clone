# Đánh giá sau triển khai: Block, Privacy, Friendship Modules

**Ngày đánh giá:** 2026-02-04  
**Phạm vi:** 3 modules Block, Privacy, Friendship sau khi hoàn thành Phase 0–6 theo [IMPLEMENTATION_PLAN_BLOCK_PRIVACY_FRIENDSHIP.md](./IMPLEMENTATION_PLAN_BLOCK_PRIVACY_FRIENDSHIP.md)

---

## 1. Tổng quan

Báo cáo này liệt kê **vấn đề tồn đọng**, **technical debt** và **rủi ro** còn lại sau khi triển khai. Các mục được phân theo mức độ ưu tiên.

---

## 2. Technical Debt

### 2.1 Deprecated code chưa được loại bỏ

| Mục | Mô tả | File liên quan | Ưu tiên | Status |
|-----|-------|----------------|---------|--------|
| **redis-keys.constant.ts** | Migration hoàn tất, file orphan | `redis-keys.constant.ts` | - | ✅ Migrated |
| **RedisCacheFacade** | Đánh dấu deprecated nhưng file vẫn tồn tại | `shared/facades/redis-cache.facade.ts` | Trung bình | Pending |
| **Shared InteractionAuthorizationService** | Deprecated facade vẫn tồn tại | `shared/facades/interaction-authorization.service.ts` | Trung bình | Pending |

**redis-keys.constant – Đã migration (2026-02-04):**
- Contact, Socket, Messaging, Redis services đã chuyển sang `@shared/redis/redis-key-builder`
- File redis-keys.constant.ts hiện không còn import, có thể xóa

---

### 2.2 Tài liệu/comment không cập nhật

| Mục | Mô tả | File |
|-----|-------|------|
| FriendshipModule comment | Vẫn đề cập RedisCacheFacade, InteractionAuthorizationService (TODO) | `friendship.module.ts` |
| Các listener Friendship | Comment "Uses RedisCacheFacade" trong khi đã dùng FriendshipCacheHelper | `friend-request-sent.listener.ts`, `friendship-accepted.listener.ts`, `unfriended.listener.ts` |
| Migration checklist | Trùng lặp: `[ ]` và `[x]` cho cùng Phase 5 | `IMPLEMENTATION_PLAN_BLOCK_PRIVACY_FRIENDSHIP.md` |

---

### 2.3 Shared/facades export deprecated service

- `shared/facades/index.ts` export `InteractionAuthorizationService` deprecated
- Cần kiểm tra và cập nhật để tránh import nhầm

---

## 3. Vấn đề tồn đọng (Outstanding Issues)

### 3.1 MessagingController – sendMessage thiếu authorization guard

| Mục | Mô tả | Rủi ro |
|-----|-------|--------|
| **sendMessage endpoint** | Không có `InteractionGuard` hay guard tương đương | Trung bình |

**Chi tiết:**
- `POST /messages` (sendMessage) dùng `conversationId` trong body, không có `targetUserId`/`recipientId`
- `InteractionGuard` cần `targetUserId` (params hoặc body) nên không áp dụng trực tiếp
- Hiện tại chỉ kiểm tra tại `getOrCreateDirectConversation` và `isMember` trong service

**Rủi ro:**
- Client có `conversationId` hợp lệ (ví dụ từ trước khi bị block) vẫn có thể gửi tin nhắn
- Cần kiểm tra block/privacy tại thời điểm gửi trong `MessageService` hoặc thêm guard riêng

**Đề xuất:**
- Thêm kiểm tra block/privacy trong `MessageService.sendMessage()` trước khi gửi
- Hoặc tạo guard/resolver lấy target từ `conversationId` rồi dùng `canInteract`

---

### 3.2 Event emission – dùng emit() thay vì emitAsync()

| Mục | Mô tả | Rủi ro |
|-----|-------|--------|
| **BlockService, FriendshipService, PrivacyService** | Dùng `eventEmitter.emit()` (sync) | Thấp |

**Chi tiết:**
- `emit()` chạy listeners đồng bộ; nếu listener lỗi, request API có thể fail
- Đồng bộ giúp đảm bảo thứ tự và consistency

**Rủi ro:**
- Nhiều listeners làm tăng latency request
- Một listener chậm/lỗi có thể block toàn bộ flow

**Đề xuất:**
- Cân nhắc `emitAsync()` cho listeners không quan trọng cho response
- Đảm bảo DomainEventPersistenceListener có retry/fallback (DLQ) khi cần

---

### 3.3 DomainEventPersistenceListener – không có retry khi lỗi

| Mục | Mô tả | Rủi ro |
|-----|-------|--------|
| **Persist failure** | Listener `throw error` khi persist fail → event có thể mất | Trung bình |

**Chi tiết:**
- Nếu `domainEvent.upsert` lỗi (DB, connection, …), event không được lưu
- Không có cơ chế retry hay Dead Letter Queue

**Đề xuất:**
- Thêm retry với backoff
- Ghi log + metric khi persist fail
- Cân nhắc DLQ cho phase sau

---

### 3.4 FriendshipService – validateCooldowns không check deletedAt

| Mục | Mô tả | Rủi ro |
|-----|-------|--------|
| **Cooldown query** | `findFirst` không filter `deletedAt: null` | Thấp |

**Chi tiết:**
- Bản ghi friendship đã soft-delete (do block) vẫn có thể được dùng cho decline cooldown
- Có thể gây cooldown lâu hơn dự kiến trong một số trường hợp

**Đề xuất:**
- Thêm `deletedAt: null` vào where khi query decline cooldown (nếu logic nghiệp vụ yêu cầu)

---

### 3.5 Multi-node cache invalidation chưa triển khai

| Mục | Mô tả | Rủi ro |
|-----|-------|--------|
| **CacheInvalidationListener** | Chỉ invalidate local Redis, chưa sync multi-node | Thấp (hiện tại) |

**Chi tiết:**
- `cache.invalidate` chỉ xóa key trên instance hiện tại
- Trong multi-node, cache trên node khác có thể stale
- Đã có comment TODO trong code

**Đề xuất:**
- Giữ nguyên cho giai đoạn single-node
- Khi scale, thêm Redis Pub/Sub để broadcast invalidation (như đã gợi ý trong code)

---

## 4. Rủi ro (Risks)

### 4.1 Circular dependency

| Rủi ro | Mitigation hiện tại | Trạng thái |
|--------|---------------------|------------|
| FriendshipModule ↔ AuthorizationModule | Friendship dùng `IBlockChecker` từ BlockModule, không import AuthorizationModule | Đang ổn |
| EventPersistenceModule ↔ BlockModule | Chỉ import type `UserBlockedEvent`, `UserUnblockedEvent` từ BlockModule | Đang ổn |

Cần duy trì cấu trúc module và dependency như hiện tại.

---

### 4.2 Event ordering & consistency

| Rủi ro | Mô tả | Mitigation |
|--------|-------|------------|
| Thứ tự event | Block, Friendship, Privacy emit sync; nhiều listener chạy song song | Block luôn ưu tiên trong `canInteract` |
| Duplicate events | Retry, duplicate request | Idempotency (ProcessedEvent, unique eventId) |
| Listener failure | Một listener lỗi có thể fail request | `emit()` sync; cần retry/DLQ cho DomainEventPersistenceListener |

---

### 4.3 Redis key inconsistency (nếu migration chưa xong)

| Rủi ro | Mô tả |
|--------|-------|
| Key format | `redis-keys.constant`: `social:block:`, `social:friendship:` (lowercase) vs `RedisKeyBuilder`: `SOCIAL:BLOCK:`, `SOCIAL:FRIENDSHIP:` (uppercase) |
| Scope | Block/Privacy/Friendship đã dùng RedisKeyBuilder; các module khác vẫn dùng redis-keys |

Cần hoàn tất migration và loại bỏ redis-keys.constant để tránh nhầm lẫn.

---

### 4.4 Thiếu test

| Mục | Mô tả | Ưu tiên |
|-----|-------|---------|
| **Unit tests** | Không có file `*.spec.ts` | Cao |
| **Integration tests** | Event flow (block → soft delete → unblock → restore) chưa được test tự động | Cao |
| **E2E** | API với guard chưa được kiểm tra E2E | Trung bình |

---

## 5. Các mục chưa triển khai (per plan)

| Mục | Mô tả | Phase |
|-----|-------|-------|
| **Cron 90 ngày** | Xóa/archived friend request hết hạn | Phase sau |
| **Multi-node cache sync** | Redis Pub/Sub cho cache invalidation | Phase sau |
| **Message broker (Kafka/RabbitMQ)** | Thay EventEmitter2 bằng message broker | Phase sau |

---

## 6. Khuyến nghị ưu tiên

### Ưu tiên cao
1. Thêm unit test cho Block, Privacy, Friendship (service + listener chính)
2. Migration các module còn lại khỏi redis-keys.constant
3. Bổ sung kiểm tra block/privacy trong MessageService.sendMessage()

### Ưu tiên trung bình
4. Cập nhật comment/docs (FriendshipModule, listeners)
5. Xóa hoặc tách biệt các facade deprecated
6. Retry / error handling cho DomainEventPersistenceListener

### Ưu tiên thấp
7. Sửa duplicate checklist trong plan
8. Đánh giá emit vs emitAsync cho từng event
9. Bổ sung `deletedAt: null` trong cooldown query nếu cần

---

## Phụ lục: DOMAIN_SOCIAL trong RedisKeyBuilder

**Câu hỏi:** Xóa DOMAIN_SOCIAL có ảnh hưởng gì? Domain này có tác dụng gì?

**Trả lời:**

- **DOMAIN_SOCIAL** là **namespace prefix** cho nhóm Redis keys, không phải tên module.
- Dùng cho các keys: `SOCIAL:BLOCK:`, `SOCIAL:FRIENDSHIP:`, `SOCIAL:PRIVACY:`, `SOCIAL:PERMISSION:`, `SOCIAL:FRIEND_COUNT:`.
- Được dùng bởi Block, Friendship, Privacy (các module thay thế SocialModule cũ).

**Nếu xóa:**
- Tất cả chỗ dùng `DOMAIN_SOCIAL` phải đổi sang prefix khác.
- Format key sẽ thay đổi (ví dụ `SOCIAL:BLOCK:` → `BLOCK:BLOCK:` hoặc tương tự).
- Dữ liệu cache hiện tại trong Redis sẽ bị orphan vì key cũ không còn được dùng.

**Khuyến nghị:** Giữ nguyên DOMAIN_SOCIAL. Có thể đổi tên constant thành `DOMAIN_SOCIAL_GRAPH` cho rõ nghĩa, nhưng giá trị `'SOCIAL'` nên giữ để không phải migrate cache.

---

*Tài liệu này nên được cập nhật sau mỗi lần xử lý technical debt hoặc thay đổi kiến trúc.*
