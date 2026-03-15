# Event Catalog — Review & Risk Report

> **Ngày tạo:** 2025-03-12 | **Cập nhật lần cuối:** 2026-03-12
> **Phạm vi:** Phân tích `04-EVENT-CATALOG.md` đối chiếu mã nguồn thực tế
> trong `backend/zalo_backend/src/`.
>
> **Trạng thái:** Tất cả quyết định kiến trúc cho R1–R4 và W2 đã được xác định.
> Xem mục [Quyết định kiến trúc đã xác nhận](#quyết-định-kiến-trúc-đã-xác-nhận) ở cuối tài liệu.

---

## Tổng quan

Hệ thống hiện có **~35 event name** duy nhất, **~80 listener registration** phân
bổ trên 12 module. Sau khi rà soát toàn bộ `.emit()` và `@OnEvent()`, tôi phát
hiện **3 nhóm vấn đề chính**: dead code, missing emit (tính năng chạy nhưng
không phát event), và rủi ro kiến trúc (event chain, naming, persistence
inconsistency).

| Mức độ | Số lượng | Mô tả |
|--------|----------|-------|
| 🔴 Critical | 3 | Bug thực tế — tính năng đã implement nhưng không emit event → listener không bao giờ chạy |
| 🟡 Warning | 4 | Dead code / naming mismatch — lãng phí tài nguyên, gây nhầm lẫn |
| 🟠 Risk | 4 | Rủi ro kiến trúc — chưa gây bug nhưng sẽ gây vấn đề khi scale |

---

## 🔴 Critical — Missing Emit (Bug thực tế)

### C1. `deleteMessage()` không emit `message.deleted`

**File:** `modules/message/services/message.service.ts` → `deleteMessage()` (line 703)

**Hiện trạng:**
- `MessageService.deleteMessage()` soft-delete message (set `deletedAt`) nhưng
  **không gọi** `eventPublisher.publish()` hay `eventEmitter.emit()`.
- `SearchEventListener` đang listen `message.deleted` → sẽ **không bao giờ fire**.
- Hệ quả: Sau khi user xoá tin nhắn, search cache **vẫn trả về tin nhắn đã
  xoá** trong kết quả tìm kiếm. Nếu real-time search đang active, client
  **không nhận được** `search:resultRemoved` socket event.

**Giải pháp đề xuất:**
Thêm `eventPublisher.publish(new MessageDeletedEvent(...))` vào cuối
`deleteMessage()` sau khi Prisma update thành công. Event name: `message.deleted`.

---

### C2. `updateGroup()` không emit `conversation.updated`

**File:** `modules/conversation/services/group.service.ts` → `updateGroup()` (line 117)

**Hiện trạng:**
- `GroupService.updateGroup()` cập nhật name/avatar/settings trong DB nhưng
  **không emit** bất kỳ event nào.
- `SearchEventListener` đang listen `conversation.updated` → **không bao giờ fire**.
- `ConversationGateway` cũng **không nhận được** notification → các client
  **không thấy** tên/avatar group đổi real-time (phải refresh trang).

**Giải pháp đề xuất:**
Thêm `eventPublisher.publish(new ConversationUpdatedEvent(...))` vào cuối
`updateGroup()`. Event name: `conversation.updated`. Listener cần:
1. `SearchEventListener` — invalidate conversation search cache (đã có sẵn)
2. `ConversationGateway` hoặc `ConversationEventHandler` — broadcast
   `conversation:updated` socket event đến tất cả members (cần thêm listener mới
   hoặc reuse `system-message.broadcast`)

---

### C3. `UsersService.update()` không emit `user.profile.updated`

**File:** `modules/users/users.service.ts` → `update()` (line 202)

**Hiện trạng:**
- `UsersService.update()` gọi `super.update()` (Prisma update) nhưng **không
  emit** event nào.
- 2 listener đang chờ `user.profile.updated`:
  - `ConversationEventHandler` — muốn cập nhật display name across tất cả
    conversation mà user tham gia
  - `SearchEventListener` — muốn invalidate contact/user search cache
- Hệ quả: Khi user đổi display name, tên cũ **vẫn hiện** trong danh sách
  conversation của người khác. Search cũng trả về tên cũ cho đến khi cache
  tự expire.

**Giải pháp đề xuất:**
Thêm `eventPublisher.publish(new UserProfileUpdatedEvent(...))` vào cuối
`update()`. Event name: `user.profile.updated`. Cả 2 listener đã có sẵn code xử
lý, chỉ thiếu emit.

> **Lưu ý:** `EventType` enum trong Prisma schema **đã có**
> `USER_PROFILE_UPDATED`, vậy đây rõ ràng là tính năng đã plan nhưng chưa
> hoàn thiện emit.

---

## 🟡 Warning — Dead Code

### W1. `MessagingFriendshipListener` — 100% dead code

**File:** `modules/message/listeners/messaging-friendship.listener.ts`

**Hiện trạng:**
- 4 handler lắng nghe: `friend_request.accepted`, `unfriended`,
  `friend_request.rejected`, `friend_request.sent`
- **Không có emitter nào** trong codebase phát ra các event này. Canonical naming
  là `friendship.accepted`, `friendship.unfriended`, v.v.
- Tất cả 4 handler đều **chỉ log** (`this.logger.debug(...)`) — không thực hiện
  bất kỳ business logic nào.
- Class này registered trong `MessageModule` → NestJS vẫn instantiate nó,
  EventEmitter2 vẫn register 4 listener → lãng phí bộ nhớ.

**Giải pháp đề xuất:**
**Xoá file** `messaging-friendship.listener.ts` và remove import/provider khỏi
`message.module.ts`. Không có side-effect vì code chỉ log.

---

### W2. `message.updated` / `message.edited` — Listener tồn tại nhưng feature chưa implement

**File:** `modules/search_engine/listeners/search-event.listener.ts` (line 375–376)

**Hiện trạng:**
- Listener listen cả `message.updated` và `message.edited` (2 `@OnEvent` on
  same method).
- Không có tính năng edit message trong hệ thống hiện tại — `MessageService`
  không có `editMessage()` method.
- Đây là code viết trước cho tính năng tương lai (search engine Phase B TD-11).

**Quyết định (2026-03-12):**
Giữ nguyên listener. Thêm comment `// TODO(edit-message): Activate when editMessage() is implemented` vào 2 dòng `@OnEvent`. Không comment out hoặc xoá code vì đây là placeholder có chủ đích cho tính năng tương lai.

---

### W3. Emit không có listener

| Event | Emitter | Lý do |
|-------|---------|-------|
| `user.logged_out` | `AuthService` | Không có listener nào. Có thể dự kiến cho analytics/audit nhưng chưa ai đăng ký. |
| `media.processed` | `MediaUploadService`, `MediaConsumer`* | Không có listener. Dự kiến cho future frontend notification (media ready). |
| `media.failed` | `MediaConsumer`*, `SqsMediaConsumer`* | Không có listener. Dự kiến cho retry/alert mechanism. |
| `reminder.deleted` | `ReminderService` | Không có listener. Có thể cần broadcast xoá reminder cho cross-device sync. |

> \* Worker process — không active trong production hiện tại.

**Giải pháp đề xuất:**
Không cần xoá (emit rất rẻ khi không có listener). Nhưng nên document rõ trong
code rằng đây là **placeholder events** để dev mới không tốn thời gian tìm
listener.

---

### W4. Tên class trùng nhau — `FriendshipNotificationListener` × 2

**Hiện trạng:**
- `socket/listeners/friendship-notification.listener.ts` → Emit socket events
- `modules/notifications/listeners/friendship-notification.listener.ts` → Send FCM push

Cùng tên class `FriendshipNotificationListener`, khác module. Không gây bug
(NestJS DI phân biệt bằng module scope) nhưng gây nhầm lẫn khi đọc code, log,
và khi tra cứu Event Catalog.

**Giải pháp đề xuất:**
Rename một trong hai. Gợi ý:
- Socket module: `FriendshipSocketNotifier` (hoặc giữ nguyên vì nằm trong
  `socket/listeners/`)
- Notifications module: `FriendshipPushNotifier` hoặc
  `FriendshipFcmNotificationListener`

---

## 🟠 Risk — Rủi ro kiến trúc

### R1. Event chain depth — `call.ended` tạo cascade 3 cấp

**Kiến trúc hiện tại (cần thay thế):**
```
CallHistoryService
  └─ emit('call.ended')
       └─ CallEventHandler  ← KẺ TRUNG GIAN CẦN XOÁ
            ├─ emit('call.log_message_needed')        → CallMessageListener
            ├─ emit('call.missed_notification_needed') → CallNotificationListener
            └─ emit('call.conversation_update_needed') → CallConversationListener
```

**Rủi ro hiện tại:**
- **3 cấp event chain** — debugging khó vì stack trace bị gián đoạn tại mỗi event boundary.
- `CallEventHandler` là lớp trung gian không có business logic thực thụ, chỉ relay và
  thực hiện một số data transformation nhỏ → vi phạm Choreography Pattern.
- Nếu listener ở cấp 2 throw error, idempotency ghi nhận thành công nhưng side-effect
  có thể bị mất.

---

**✅ Quyết định (2026-03-12): Áp dụng Choreography Pattern**

Xoá `CallEventHandler`. `CallHistoryService` chỉ emit 1 event duy nhất `call.ended`
và để **3 listener độc lập** tự lắng nghe trực tiếp:

```
CallHistoryService
  └─ emit('call.ended')   ← 1 event duy nhất
       ├─ CallMessageListener       (module: message)
       ├─ CallNotificationListener  (module: notifications)
       ├─ CallConversationListener  (module: conversation)
       ├─ CallEndedSocketListener   (module: socket)   ← đã có sẵn
       └─ StatsCounterListener     (module: admin)    ← đã có sẵn, { async: true }
```

---

**⚠️ Lưu ý bắt buộc khi implement R1 (3 điểm)**

**Lưu ý 1 — Data transformation: `callerName` / `callerAvatar` không có trong payload gốc**

Payload thực tế mà `CallHistoryService` emit (kiểm tra tại `call-history.service.ts` line 411, 788, 949):
```typescript
this.eventEmitter.emit('call.ended', {
  callId, callType, initiatorId, receiverIds,
  conversationId, status, reason, provider, durationSeconds,
  // KHÔNG CÓ callerName hay callerAvatar
});
```

`CallEventHandler` hiện truy cập 2 trường này bằng `(payload as any).callerName` — luôn
trả về `'Unknown'` và `null` vì payload không có chúng. Sau R1, `CallNotificationListener`
phải **tự query `callerName`/`callerAvatar` từ DB** bằng `initiatorId` (giống cách nó đã
query `conversationName` cho group calls trong handler `handleMissedCallPush`).

**Lưu ý 2 — Idempotency: mỗi listener cần idempotency riêng**

`CallEventHandler` hiện tập trung idempotency cho toàn bộ flow:
```typescript
const alreadyProcessed = await this.idempotency.isProcessed(eventId, handlerId);
// handlerId = 'CallEventHandler'
```

Sau R1, mỗi listener phải inject `IdempotencyService` và tự track với `handlerId` riêng:
- `CallMessageListener` → `handlerId: 'CallMessageListener'`
- `CallNotificationListener` → `handlerId: 'CallNotificationListener'` (per-receiver: `${callId}:${receiverId}`)
- `CallConversationListener` → `handlerId: 'CallConversationListener'`

Hiện tại `CallMessageListener` và `CallConversationListener` **chưa có** idempotency
— phải thêm vào khi refactor R1.

**Lưu ý 3 — Preconditions: mỗi listener tự kiểm tra điều kiện của mình**

Logic hiện nằm trong `CallEventHandler` phải phân tán đúng owner:

| Listener | Precondition cần tự check |
|---|---|
| `CallMessageListener` | `if (!payload.conversationId) return` |
| `CallNotificationListener` | `if (status !== MISSED && status !== NO_ANSWER) return` (per-receiver loop) |
| `CallConversationListener` | `if (!payload.conversationId) return` |

Đây là **lợi thế** của Choreography — mỗi domain hiểu rõ precondition của mình,
thay vì phụ thuộc vào trung gian kiểm tra hộ.

---

### R2. Inconsistent persistence — Cùng "tầm quan trọng" nhưng khác xử lý

| Event | Qua EventPublisher (persisted)? | Nhận xét |
|-------|--------------------------------|----------|
| `friendship.accepted` | ✅ Có | Đúng — business event quan trọng |
| `call.ended` | ❌ Không | **Thiếu** — business event cùng mức quan trọng nhưng dùng direct emit |
| `conversation.muted` | ❌ Không | OK — personal preference, ít quan trọng |
| `system-message.broadcast` | ❌ Không | OK — internal routing event |

**Rủi ro:**
- `call.ended` không được persist vào `domain_events` table → không có audit
  trail cho cuộc gọi. Nếu cần replay event (ví dụ: fix data sau incident),
  call events bị mất.
- `EventType` enum trong Prisma schema **đã có** `CALL_ENDED` → thiết kế ban đầu
  dự định persist nhưng chưa implement.

**✅ Quyết định (2026-03-12): Bắt buộc phải chuyển sang `EventPublisher`**

Scope thay đổi:
1. Tạo `CallEndedEvent` class (tương tự `FriendshipAcceptedEvent`, v.v.)
2. Sửa **3 emit sites** trong `CallHistoryService` (line 411, 788, 949):
   ```typescript
   // Trước
   this.eventEmitter.emit('call.ended', { ... });
   // Sau
   await this.eventPublisher.publish(new CallEndedEvent({ ... }));
   ```
3. `EventPublisher` tự động: validate → persist `domain_events` → attach correlation-id
   → `eventEmitter.emit()` — các listener downstream **không cần** thay đổi.

`EventType.CALL_ENDED` đã có sẵn trong Prisma enum — đây là tình trạng
**feature đã plan, chưa hoàn thiện** (giống C1–C3).

---

### R3. `system-message.broadcast` — 4 emitter, 1 listener, naming mơ hồ

**Hiện trạng:**
- 4 nơi emit cùng event `system-message.broadcast`:
  1. `ConversationRealtimeService` — Group member changes
  2. `ConversationEventHandler` — Conversation created/member join
  3. `ReminderSystemMessageListener` — Reminder created
  4. `CallMessageListener` — Call log message
- Chỉ có 1 listener: `ConversationGateway.handleSystemMessageBroadcast()`

**Rủi ro:**
- Event name `system-message.broadcast` là **imperative** (ra lệnh "hãy broadcast")
  thay vì **declarative** (mô tả "có gì xảy ra") → vi phạm event-driven best
  practice — event nên mô tả fact đã xảy ra, không phải command.
- Bất kỳ module nào cũng có thể emit event này → không kiểm soát được ai
  được phép broadcast message hệ thống.
- Chỉ có 1 listener: bản chất thực sự là **command**, không phải domain event.
  Dùng EventEmitter để route command là anti-pattern.

---

**✅ Quyết định (2026-03-12): Tạo `SystemMessageBroadcasterService`**

Tạo một service mới thuộc `ConversationModule` đóng gói toàn bộ logic broadcast:

```typescript
// modules/conversation/services/system-message-broadcaster.service.ts
@Injectable()
export class SystemMessageBroadcasterService {
  constructor(private readonly conversationGateway: ConversationGateway) {}

  async broadcast(payload: SystemMessagePayload): Promise<void> {
    await this.conversationGateway.handleSystemMessageBroadcast(payload);
  }
}
```

Các module khác inject service này thay vì emit event:

| Emitter hiện tại | Module | Hành động |
|---|---|---|
| `ConversationRealtimeService` | Conversation | Inject trực tiếp (cùng module) |
| `ConversationEventHandler` | Conversation | Inject trực tiếp (cùng module) |
| `ReminderSystemMessageListener` | Reminder | Import `SystemMessageBroadcasterService` từ Conversation module |
| `CallMessageListener` | Message | Import `SystemMessageBroadcasterService` từ Conversation module |

**Kiểm tra circular dependency:**
- Message module → import từ Conversation module ✅ (one-way)
- Reminder module → import từ Conversation module ✅ (one-way)
- Conversation module → **không** import từ Message hay Reminder ✅

**Không có circular dependency.** `ConversationModule` cần export
`SystemMessageBroadcasterService` để các module khác inject được.

**Lợi ích so với event:**
- **Type-safe**: method call → IDE bắt lỗi compile-time, không cần đoán string event name.
- **Stack trace rõ ràng**: không bị đứt qua EventEmitter boundary.
- **Đúng bản chất**: `system-message.broadcast` là command, không phải domain event
  — method call phản ánh đúng ý định hơn.

---

### R4. `{ async: true }` chỉ dùng ở 6/80 listener — mặc định là synchronous

**Hiện trạng:**
- EventEmitter2 mặc định **chờ tất cả listener hoàn thành** trước khi trả
  control về emitter (synchronous execution).
- Chỉ 6 listener dùng `{ async: true }`: `StatsCounterListener` (4 events),
  `FriendshipConversationListener`, `PrivacyUserRegisteredListener`.
- Phần lớn listener (74/80) chạy synchronous → emitter phải chờ tất cả
  listener xong.

**Rủi ro:**
- `message.sent` có **5 listener synchronous** → `MessageService.sendMessage()`
  phải chờ tất cả 5 (update conversation, broadcast, search cache, FCM push,
  stats) hoàn thành trước khi return response cho client.
- Nếu 1 listener chậm (ví dụ: FCM push timeout), user thấy "gửi tin nhắn
  chậm".
- Nếu 1 listener throw error, các listener sau có thể không chạy (tuỳ
  EventEmitter2 config).

---

**✅ Quyết định (2026-03-12): Bắt buộc, ưu tiên số 1**

Audit toàn bộ 80 listener. Chuyển ngay lập tức các tác vụ mang tính side-effect
sang `{ async: true }`.

**Quy tắc phân loại:**

| Loại listener | async? | Ví dụ |
|---|---|---|
| **Side-effect** (không ảnh hưởng response) | ✅ `{ async: true }` | FCM push, log, stats, cache invalidation |
| **State change** (caller cần biết kết quả) | ❌ sync | Create message, update conversation, update user profile |

---

**🚨 Cảnh báo bắt buộc: Try-catch trong mọi `async` listener**

Δây là điểm **nguy hiểm nhất** khi chuyển listener sang async. Hành vi của
EventEmitter2 với `{ async: true }`:

```
1. Listener chạy trên microtask queue → không block caller (đúng mục đích)
2. Nếu listener throw → error trở thành unhandled rejection
3. Node.js từ v15+: unhandled rejection → PROCESS CRASH
4. NestJS KHÔNG tự catch errors trong async EventEmitter2 listeners
```

**Mọi `async` listener BẮT BUỘC phải có try-catch:**

```typescript
// ✅ ĐÚNG
@OnEvent('message.sent', { async: true })
async handleMessageSent(payload: MessageSentPayload): Promise<void> {
  try {
    await this.pushService.sendPush(...);
  } catch (error) {
    this.logger.error('[MESSAGE_SENT] Push failed:', error);
    // KHÔNG re-throw — swallow error để tránh crash process
  }
}

// ❌ SAI — async listener không try-catch = ticking time bomb
@OnEvent('message.sent', { async: true })
async handleMessageSent(payload: MessageSentPayload): Promise<void> {
  await this.pushService.sendPush(...); // Throw → process crash
}
```

**Các listener rõ ràng cần chuyển async ngay:**
- `MessageNotificationListener` (FCM push) — ❌ sync → **async + try-catch**
- `SearchEventListener` (cache invalidation) — ❌ sync → **async + try-catch**
- `FriendshipNotificationListener` (push, socket) — ❌ sync → **async + try-catch**
- `CallNotificationListener` (FCM push) — đã async nhưng **kiểm tra try-catch**

**`StatsCounterListener`** — ✅ đã async, đã có try-catch.

---

## Tổng hợp hành động

### Ưu tiên P0 — Stability (ngăn crash production)

| # | Vấn đề | Hành động | Scope |
|---|--------|-----------|-------|
| R4 | 74/80 listener sync, không có try-catch | Audit toàn bộ 80 listener; chuyển side-effect sang `{ async: true }` + thêm try-catch | 12+ files |

### Ưu tiên P1 — Bug thực tế (fix ngay) ✅ COMPLETED

| # | Vấn đề | Hành động | Scope | Status |
|---|--------|-----------|-------|--------|
| C1 | `deleteMessage()` thiếu emit | Thêm `MessageDeletedEvent` + emit trong `message.service.ts` | 2 files | ✅ Done |
| C2 | `updateGroup()` thiếu emit | Thêm `ConversationUpdatedEvent` + emit trong `group.service.ts` | 2 files | ✅ Done |
| C3 | `update()` (user profile) thiếu emit | Tạo `UserProfileUpdatedEvent` class + emit trong `users.service.ts` | 3 files (new event class) | ✅ Done |

**P1 Implementation Details:**
- **C1**: Created `MessageDeletedEvent` in `message.events.ts`, added `eventPublisher.publish()` after soft-delete in `deleteMessage()`. Event maps to `message.deleted` → `SearchEventListener` now fires.
- **C2**: Created `ConversationUpdatedEvent` in `conversation.events.ts`, added `eventPublisher.publish()` after group update in `updateGroup()`. Event maps to `conversation.updated` → `SearchEventListener` now fires.
- **C3**: Created new `users/events/user.events.ts` with `UserProfileUpdatedEvent` class, added `eventPublisher.publish()` after `super.update()` in `UsersService.update()`. Event maps to `user.profile.updated` → both `ConversationEventHandler` and `SearchEventListener` now fire.
- All 3 events use `{ fireAndForget: true }` with `.catch()` wrapper to avoid blocking the main request path.
- None of these events are in `CRITICAL_EVENTS` set, so they are emitted but not persisted to the event store (appropriate for cache invalidation / real-time sync).
- TypeScript compilation: 0 errors after all changes.

### Ưu tiên P2 — Correctness (audit trail) ✅ COMPLETED

| # | Vấn đề | Hành động | Scope | Status |
|---|--------|-----------|-------|--------|
| R2 | `call.ended` không persist | Chuyển `CallHistoryService` sang `EventPublisher`, sửa 3 emit sites | 3 files | ✅ Done |

**P2 Implementation Details:**
- **CallHistoryService**: Replaced `EventEmitter2` injection with `EventPublisher`. All 3 emit sites now use `await this.eventPublisher.publish(new CallEndedEvent(...))`.
  - Site 1 (`endCall`, L411): Full payload with 9 fields — persisted with complete call data.
  - Site 2 (`terminateActiveCall`, L788): Partial payload (block scenario) — `callType`, `conversationId`, `provider` are `undefined`.
  - Site 3 (`terminateCallsBetweenUsers`, L949): Same partial payload as site 2.
- **CallEndedEvent**: Updated constructor to accept `callType`, `provider` as `| undefined` (was required before). Class already existed as dead code — now actively used.
- **CallEndedPayload interface**: Updated `callType`, `provider` to optional in `call-event.handler.ts` to match the new reality.
- **Persistence**: `CALL_ENDED` was already in `CRITICAL_EVENTS` set in `EventPublisher` — events are now automatically persisted to `domain_events` table for audit trail.
- **Downstream listeners unchanged**: `EventPublisher.emitEvent()` converts `CALL_ENDED` → `call.ended` via default mapping → all 3 existing listeners (`CallEventHandler`, `CallEndedSocketListener`, `StatsCounterListener`) continue to work without changes.
- TypeScript compilation: 0 errors after all changes.

### Ưu tiên P3 — Refactor kiến trúc

| # | Vấn đề | Hành động | Scope |
|---|--------|-----------|-------|
| R3 | `system-message.broadcast` là command giả dạng event | Tạo `SystemMessageBroadcasterService`, xoá event, sửa 4 emitter | 6+ files |
| R1 | `CallEventHandler` — trung gian không cần thiết | Xoá handler; chuyển 3 listener sang lắng nghe `call.ended` trực tiếp (xem 3 lưu ý) | 4 files |

> **✅ R3 — COMPLETED** (2025-07-24)
>
> Created `SystemMessageBroadcasterService` in `ConversationModule`. Replaced all 4 `system-message.broadcast` event emissions with direct service calls. Removed `@OnEvent('system-message.broadcast')` decorator from `ConversationGateway.handleSystemMessageBroadcast()`.
>
> **Files changed (9):**
> - **Created**: `modules/conversation/services/system-message-broadcaster.service.ts` — new service wrapping gateway method
> - **Modified (emitters)**:
>   - `modules/conversation/listeners/conversation-event.handler.ts` — replaced `EventEmitter2` with `SystemMessageBroadcasterService`, made helper `async`
>   - `modules/conversation/services/conversation-realtime.service.ts` — replaced `EventEmitter2` with `SystemMessageBroadcasterService`
>   - `modules/reminder/listeners/reminder-system-message.listener.ts` — replaced `EventEmitter2` with `SystemMessageBroadcasterService`
>   - `modules/message/listeners/call-message.listener.ts` — replaced `EventEmitter2` with `SystemMessageBroadcasterService`
> - **Modified (listener)**: `modules/conversation/conversation.gateway.ts` — removed `@OnEvent` decorator (method kept, called by service)
> - **Modified (modules)**:
>   - `modules/conversation/conversation.module.ts` — added `SystemMessageBroadcasterService` to providers + exports
>   - `modules/message/message.module.ts` — added `ConversationModule` to imports
>   - `modules/reminder/reminder.module.ts` — added `ConversationModule` to imports
> - **No circular dependency**: ConversationModule does NOT import MessageModule or ReminderModule (one-way dependency).
> - TypeScript compilation: 0 errors.

> **✅ R1 — COMPLETED** (2026-03-12)
>
> Deleted `CallEventHandler` middleman. All 3 downstream listeners now listen directly to `call.ended` (Choreography Pattern). All 3 mandatory notes addressed:
>
> **Lưu ý 1 — Data transformation:**
> - `CallMessageListener`: computes `participantCount = receiverIds.length + 1` locally; handles `callType` being `undefined` (fallback to `'VOICE'`).
> - `CallNotificationListener`: queries `callerName`/`callerAvatar` from DB via `prisma.user.findUnique({ where: { id: initiatorId } })`; computes `isGroupCall = receiverIds.length > 1`; loops per-receiver.
> - `CallConversationListener`: generates `timestamp: new Date()` locally.
>
> **Lưu ý 2 — Idempotency:**
> - `CallMessageListener`: `IdempotencyService` with `handlerId = 'CallMessageListener'`.
> - `CallNotificationListener`: `IdempotencyService` with `handlerId = 'CallNotificationListener:${callId}:${receiverId}'` (per-receiver dedup).
> - `CallConversationListener`: `IdempotencyService` with `handlerId = 'CallConversationListener'`.
> - All 3 use `recordProcessed`/`recordError` pattern with `EventType.CALL_ENDED`.
>
> **Lưu ý 3 — Preconditions:**
> - `CallMessageListener`: `if (!conversationId) return`.
> - `CallNotificationListener`: `if (status !== MISSED && status !== NO_ANSWER) return`.
> - `CallConversationListener`: `if (!conversationId) return`.
>
> **Files changed (10):**
> - **Deleted**: `modules/call/listeners/call-event.handler.ts` — the middleman
> - **Modified (listeners — now listen to `call.ended` directly)**:
>   - `modules/message/listeners/call-message.listener.ts` — `@OnEvent('call.ended', { async: true })` + idempotency + precondition
>   - `modules/notifications/listeners/call-notification.listener.ts` — `@OnEvent('call.ended', { async: true })` + DB query for caller info + per-receiver idempotency
>   - `modules/conversation/listeners/call-conversation.listener.ts` — `@OnEvent('call.ended', { async: true })` + idempotency + precondition
> - **Modified (events)**:
>   - `modules/call/events/call.events.ts` — moved `CallEndedPayload` interface here + updated JSDoc
>   - `modules/call/events/index.ts` — exported `CallEndedPayload` and `CallEndReasonType`
> - **Modified (import fix)**: `socket/listeners/call-ended.listener.ts` — updated import path from deleted handler to `@modules/call/events`
> - **Modified (modules)**:
>   - `modules/call/call.module.ts` — removed `CallEventHandler` from providers, removed `IdempotencyModule` import
>   - `modules/message/message.module.ts` — added `IdempotencyModule` to imports
>   - `modules/notifications/notifications.module.ts` — added `IdempotencyModule` to imports
> - TypeScript compilation: 0 errors.

### Ưu tiên P4 — Cleanup

| # | Vấn đề | Hành động | Scope |
|---|--------|-----------|-------|
| W1 | `MessagingFriendshipListener` dead code | Xoá file + remove từ `message.module.ts` | 2 files |
| W2 | Listener cho feature chưa implement | Thêm `// TODO(edit-message)` — giữ nguyên code | 1 file |
| W4 | Class name trùng nhau | Rename `FriendshipNotificationListener` trong notifications module | 1 file |

> **✅ P4 — COMPLETED** (2025-07-25)
>
> - **W1**: Đã xoá `messaging-friendship.listener.ts` (4 handler dead code chỉ `logger.debug()`, lắng nghe event không ai emit). Removed import + provider từ `message.module.ts` và barrel export từ `listeners/index.ts`. Tổng: 3 files.
> - **W2**: Đã thêm `// TODO(edit-message): Activate when editMessage() is implemented` vào 2 decorator `@OnEvent('message.updated')` và `@OnEvent('message.edited')` trong `search-event.listener.ts`.
> - **W4**: Đã rename `FriendshipNotificationListener` → `FriendshipPushNotificationListener` trong `notifications` module (listener file + `notifications.module.ts` import/provider/JSDoc). Giải quyết naming collision với `socket/listeners/friendship-notification.listener.ts`.
>
> TypeScript compilation: **0 errors**.

---

## Quyết định kiến trúc đã xác nhận

> Tất cả quyết định dưới đây đã được xác nhận ngày **2026-03-12**.
> Không còn open question. Xem chi tiết tại từng mục R1–R4 và W2 ở trên.

| Item | Quyết định |
|------|------------|
| **R1** | Xoá `CallEventHandler`. Áp dụng Choreography Pattern — 3 listener trực tiếp lắng nghe `call.ended`. Lưu ý: tự query `callerName`/`callerAvatar`, thêm idempotency cho từng listener, tự check precondition. |
| **R2** | Bắt buộc chuyển sang `EventPublisher`. Tạo `CallEndedEvent` class, sửa 3 emit sites. |
| **R3** | Tạo `SystemMessageBroadcasterService` (thuộc `ConversationModule`). Xoá event `system-message.broadcast`. Các module khác inject service này. Không có circular dependency. |
| **R4** | Bắt buộc, ưu tiên số 1. Audit 80 listener. Async cho side-effect, sync cho state change. Mọi async listener phải có try-catch — không re-throw. |
| **W2** | Giữ nguyên listener, chỉ thêm `// TODO(edit-message)`. |
