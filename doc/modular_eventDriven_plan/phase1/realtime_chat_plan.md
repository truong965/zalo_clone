# Phase 1 — Realtime Chat Stabilization Plan (CRITICAL → LOW)

> Mục tiêu: làm chat realtime **đúng UX**, **không mất tin**, **không trùng**, **chịu reconnect**, và **đồng bộ conversation list**.  
> Ghi chú: Đây là plan kiến trúc/triển khai mức module (không đi vào code chi tiết).

---

## 0) Hiện trạng kiến trúc (để định hướng sửa)

- **Backend (NestJS + Socket.IO + Redis PubSub)**
  - Auth socket: `backend/zalo_backend/src/socket/services/socket-auth.service.ts` (verify JWT lúc connect)
  - Socket gateway core: `backend/zalo_backend/src/socket/socket.gateway.ts`
  - Message gateway: `backend/zalo_backend/src/modules/message/message.gateway.ts`
  - Message realtime logic: `backend/zalo_backend/src/modules/message/services/message-realtime.service.ts`
  - Offline queue: `backend/zalo_backend/src/modules/message/services/message-queue.service.ts`
  - Broadcaster (Redis PubSub): `backend/zalo_backend/src/modules/message/services/message-broadcaster.service.ts`
  - Conversation gateway: `backend/zalo_backend/src/modules/conversation/conversation.gateway.ts`

- **Frontend (React + React Query + Socket.IO client)**
  - Socket manager: `frontend/zalo_clone_web/src/lib/socket.ts`
  - Socket hook: `frontend/zalo_clone_web/src/hooks/use-socket.ts`
  - Message socket hook: `frontend/zalo_clone_web/src/hooks/use-message-socket.ts`
  - Conversation socket hook: `frontend/zalo_clone_web/src/hooks/use-conversation-socket.ts`
  - Chat page: `frontend/zalo_clone_web/src/features/chat/index.tsx`
  - Message fetching: `frontend/zalo_clone_web/src/features/chat/hooks/use-chat-messages.ts`

---

## 1) CRITICAL — Conversation list realtime (reorder/snippet/unread) & không drop message ngoài active chat

### 1.1 Vấn đề
- FE hiện tại **drop** `message:new` nếu message thuộc conversation khác (do filter theo `conversationIdRef.current` trong `use-message-socket.ts`).
- Conversation list **không**:
  - nhảy lên top khi có tin mới
  - cập nhật preview/snippet
  - tăng unread
  - xử lý sync offline (MESSAGES_SYNC) cho conversation khác

### 1.2 Giải pháp tổng
Thiết kế lại luồng realtime theo 2 lớp:

- **Lớp A — Message stream toàn cục**: luôn nhận `message:new` và `messages:sync` cho *mọi* conversation.
- **Lớp B — Active conversation UI**: chỉ xử lý scroll/seen/typing cho conversation đang mở.

### 1.3 Frontend changes
- **Sửa**: `frontend/zalo_clone_web/src/hooks/use-message-socket.ts`
  - Bỏ logic “return nếu conversationId không match” đối với phần **cache update**.
  - Upsert message vào cache của **đúng queryKey theo conversationId**.
  - Cần cơ chế build queryKey chuẩn: ví dụ helper `getMessagesQueryKey(conversationId, limit)`.

- **Tạo mới** (khuyến nghị):
  - `frontend/zalo_clone_web/src/features/chat/query-keys.ts`
    - Export hàm tạo queryKey chuẩn:
      - `conversationsKey({ limit })`
      - `messagesKey({ conversationId, limit })`
  - `frontend/zalo_clone_web/src/hooks/use-chat-realtime.ts` (hoặc `use-conversation-list-realtime.ts`)
    - Listen `message:new`, `messages:sync`
    - Update conversation list cache:
      - update `lastMessageObj`, `updatedAt/lastMessageAt`, `timestamp`
      - increment `unreadCount` nếu message đến từ conversation khác đang không active
      - reorder: move conversation item lên đầu page 0

- **Sửa**: `frontend/zalo_clone_web/src/features/chat/index.tsx`
  - Cắm hook mới cho realtime conversation list.
  - Khi select conversation:
    - reset unread local state (optimistic) + trigger mark-as-seen (mục 4)

### 1.4 Backend changes (tuỳ chọn nhưng tốt cho enterprise)
- **Option 1 (FE tự derive)**: dùng `message:new` để update conversation list. (Nhanh)
- **Option 2 (đề xuất)**: backend emit event chuyên cho conversation list:
  - **Implement emit** `SocketEvents.CONVERSATION_UPDATED` trong:
    - `backend/zalo_backend/src/modules/message/services/message-realtime.service.ts`
  - Payload đề xuất:
    - `conversationId`, `lastMessage` (DTO), `lastMessageAt`, `unreadCountDelta` hoặc `unreadCount` theo user.
  - Ưu điểm: FE đỡ tính toán, chuẩn hoá multi-device.

---

## 2) CRITICAL — Reconnection + Resync sau reconnect

### 2.1 Vấn đề
- Socket tự reconnect nhưng FE không:
  - invalidate/refetch conversations
  - resubscribe logic active conversation
  - đảm bảo nhận đủ tin missed (ngoài offlineQueue)

### 2.2 Giải pháp
- **Frontend**
  - **Sửa** `frontend/zalo_clone_web/src/lib/socket.ts`
    - Listen `connect`/`reconnect`/`connect_error` để phát tín hiệu “reconnected”.
  - **Sửa/Tạo mới** `frontend/zalo_clone_web/src/hooks/use-socket.ts`
    - Expose thêm:
      - `connectionState` (connecting/connected/disconnected)
      - `lastConnectedAt` hoặc `reconnectCount`
  - **Sửa** `frontend/zalo_clone_web/src/features/chat/index.tsx`
    - Khi socket reconnect:
      - `queryClient.invalidateQueries(conversationsKey)`
      - Nếu đang mở 1 conversation: `invalidateQueries(messagesKey(conversationId))`

- **Backend**
  - Xác định rõ server-side “reconnect” có trigger `handleConnection` không.
  - Nếu không đảm bảo: thêm **event client→server** `sync:request` (tạo mới) để client yêu cầu sync.
    - Nơi tạo mới:
      - `backend/zalo_backend/src/socket/socket.gateway.ts` hoặc module riêng `sync.gateway.ts`

---

## 3) HIGH — Scroll anchoring + new-message indicator

### 3.1 Vấn đề
- ChatContent không phân biệt:
  - user đang ở bottom
  - user đang đọc tin cũ

### 3.2 Giải pháp (Frontend)
- **Sửa** `frontend/zalo_clone_web/src/features/chat/hooks/use-chat-messages.ts`
  - Track `isAtBottom` (dựa trên scrollTop + clientHeight vs scrollHeight).
  - Expose API:
    - `scrollToBottom()`
    - `shouldAutoScrollOnNewMessage` (chỉ true khi isAtBottom hoặc sender=me)
    - `newMessageCountWhileAway`

- **Sửa** `frontend/zalo_clone_web/src/features/chat/components/chat-content.tsx` và/hoặc tạo component mới
  - Hiển thị “Có tin nhắn mới” button khi user không ở bottom.
  - Khi click → scrollToBottom + reset counter.

- **Sửa** `frontend/zalo_clone_web/src/features/chat/index.tsx`
  - Sau khi optimistic send: auto-scroll to bottom.

---

## 4) HIGH — Mark-as-read/seen + receipts delivered/seen end-to-end

### 4.1 Vấn đề
- FE không emit `message:seen`, không reset unread.
- FE không emit `message:delivered` khi nhận `message:new`.

### 4.2 Backend alignment
- Backend đã có:
  - `MESSAGE_SEEN` handler: `backend/.../message.gateway.ts` → `realtime.markAsSeen()`
  - Delivered ack handlers: `MESSAGE_DELIVERED_ACK`, `MESSAGE_DELIVERED_CLIENT_ACK`

### 4.3 Frontend changes
- **Sửa** `frontend/zalo_clone_web/src/hooks/use-message-socket.ts`
  - Khi nhận `message:new` từ người khác:
    - emit `message:delivered` (hoặc `message:delivered:ack`) với `messageId`.

- **Sửa/Tạo mới**: trong `frontend/zalo_clone_web/src/features/chat/index.tsx` hoặc hook mới `use-mark-as-seen.ts`
  - Khi user mở conversation:
    - xác định danh sách messageIds cần mark seen (ví dụ newest N hoặc message trong viewport)
    - emit `message:seen` với `conversationId` + `messageIds`
  - Sau seen:
    - optimistic set `unreadCount = 0`, update `lastReadMessageId`

- **UI (optional)**
  - Message bubble có thể hiển thị tick/seen dựa vào `receipts`.

---

## 5) HIGH — Socket auth & token expiry strategy

### 5.1 Vấn đề
- Backend chỉ verify token khi connect.
- FE socket connect dùng accessToken từ localStorage, không refresh trước khi connect.

### 5.2 Giải pháp đề xuất (tối thiểu)
- **Frontend**
  - **Sửa** `frontend/zalo_clone_web/src/lib/socket.ts` + `use-socket.ts`
    - Khi nhận `auth_failed` hoặc `connect_error` dạng 401:
      - trigger refresh token flow (tái dùng logic axios interceptor hoặc expose refresh API từ auth store)
      - reconnect socket với token mới.

- **Backend (không cần thiết, chỉ khi làm với độ bảo mật cao)**
  - **Tạo mới guard** cho WS events quan trọng:
    - Ví dụ `WsJwtGuard` hoặc verify on each message (tradeoff perf).
  - Hoặc implement cơ chế "token rotation" cho socket:
    - client emit `auth:refresh` với token mới
    - server cập nhật context user trên socket.

phân tích :"Phase 5 (HIGH) — Review lại Socket auth & token expiry (dựa trên code auth hiện có)
Những gì bạn đã có (và là “đủ tốt” cho HTTP)
Frontend:
Axios interceptor refresh token khi gặp 401 (src/lib/axios.ts).
Auth store init bằng /auth/me để lấy role/permission chuẩn (auth.store.ts).
Backend:
Access token verify + role include (JWT strategy).
Refresh token rotation qua cookie httpOnly (JwtRefreshStrategy, AuthController.refresh).
Socket authenticate ở connect (SocketAuthService.authenticateSocket) có kiểm:
type === 'access'
user.status
passwordVersion (pwdVer) để invalidate nhanh.
Vấn đề còn thiếu riêng cho Socket (đây là trọng tâm Phase 5)
Socket.IO không đi qua Axios interceptor, nên khi accessToken hết hạn:
Socket reconnect sẽ fail (AUTH_FAILED) vì FE vẫn lấy token cũ từ localStorage.
Hiện FE SocketManager.connect() không có cơ chế “thử refresh rồi reconnect” khi auth failed.
Backend socket auth verify token chỉ lúc connect (đúng hiện trạng). Khi token hết hạn nhưng socket vẫn còn sống, server vẫn giữ session socket đó cho tới khi disconnect. (Điều này thường chấp nhận được cho MVP, nhưng cần policy rõ ràng.)
Khuyến nghị tối thiểu (không phá kiến trúc hiện tại)
A) Frontend: refresh trước khi reconnect socket khi auth failed
Implement trong src/lib/socket.ts hoặc use-socket.ts:
Listen SocketEvents.AUTH_FAILED hoặc connect_error có message liên quan auth.
Khi gặp auth fail:
gọi authService.refresh() (hoặc useAuthStore.getState().refreshToken() nếu bạn muốn đồng bộ store)
lấy accessToken mới từ localStorage
socketManager.disconnect() rồi socketManager.connect(newToken)
Đây là phần còn thiếu lớn nhất để socket “chịu được token expiry”.
B) Backend (optional, chỉ khi cần hard security)
Nếu muốn chặt hơn:
Verify token/policy theo event (guard) hoặc implement “auth:refresh” event.
Nhưng theo code hiện tại, mức tối thiểu chỉ cần FE refresh & reconnect đã giải quyết pain-point chính.
Bạn muốn mình làm tiếp gì cho Phase 5?
Chọn 1 trong 2 hướng:

Hướng 1 (khuyến nghị, ít thay đổi): chỉ sửa Frontend socket reconnect auth refresh.
Hướng 2 (enterprise): thêm cơ chế auth:refresh cho socket (client gửi token mới, server cập nhật context mà không cần disconnect/reconnect)."
---

## 6) MEDIUM-HIGH — Send failure handling (SocketEvents.ERROR) + retry

### 6.1 Vấn đề
- FE optimistic message không có trạng thái failed.
- `emitSendMessage` không truyền ACK callback.

### 6.2 Giải pháp (Frontend)
- **Sửa** `frontend/zalo_clone_web/src/hooks/use-message-socket.ts`
  - Listen `SocketEvents.ERROR` và filter `event === message:send`.
  - Khi lỗi:
    - update message optimistic theo `clientMessageId` → set `metadata.sendStatus = 'FAILED'` hoặc field UI riêng.

- **Sửa** `frontend/zalo_clone_web/src/features/chat/components/message-list.tsx`
  - Render trạng thái failed + nút “Gửi lại”.

- **Sửa** `frontend/zalo_clone_web/src/features/chat/index.tsx`
  - Khi emit socket send: truyền ACK callback để biết success/fail.
  - Retry logic: reuse same `clientMessageId` để đảm bảo idempotent.

---

## 7) MEDIUM — Group events completeness

### 7.1 Vấn đề
- FE không remove conversation khi dissolved.
- FE không listen `GROUP_YOU_WERE_REMOVED`, `GROUP_MEMBER_JOINED`.

### 7.2 Frontend changes
- **Sửa** `frontend/zalo_clone_web/src/hooks/use-conversation-socket.ts`
  - Add listeners:
    - `SocketEvents.GROUP_YOU_WERE_REMOVED`
    - `SocketEvents.GROUP_MEMBER_JOINED`
  - Expose handlers callback tương ứng.

- **Sửa** `frontend/zalo_clone_web/src/features/chat/index.tsx`
  - Implement `removeConversation(conversationId)` update React Query cache.
  - Nếu user đang mở conversation bị remove/dissolve:
    - set `selectedId = null` và show notification.

---

## 8) MEDIUM — Race conditions giữa pagination fetch và socket upsert

### 8.1 Giải pháp
- **Frontend**
  - Chuẩn hoá cache update functions (single source of truth):
    - `upsertMessage(queryClient, messagesKey, message)`
    - `applyAck(queryClient, messagesKey, ack)`
    - `applyReceipt(queryClient, messagesKey, receipt)`
  - Khi fetchNextPage về:
    - ensure merge theo id/clientMessageId (không overwrite).

- **Backend** (optional)
  - Bảo đảm `MessageListItem` luôn serialize id/createdAt nhất quán.

---

## 9) LOW — Typing indicator

### Frontend
- **Sửa** `frontend/zalo_clone_web/src/hooks/use-message-socket.ts`
  - Listen `SocketEvents.TYPING_STATUS`.
- **Sửa** `frontend/zalo_clone_web/src/features/chat/components/chat-input.tsx`
  - On input change → debounce emit `typing:start`.
  - On blur / stop typing → emit `typing:stop`.
- **UI**
  - Show “X đang nhập…” trong `ChatContent`.

### Backend
- Đã có đủ (gateway + broadcaster). Không cần đổi.

---

## 10) LOW — Online/Offline presence end-to-end

### Backend
- **Sửa** `backend/zalo_backend/src/socket/socket.gateway.ts`
  - `handlePresenceOnline/Offline` hiện chỉ log.
  - Implement notify friends:
    - cần data source: friend list (Friendship) + privacy settings.
    - emit `SocketEvents.FRIEND_ONLINE/OFFLINE` tới user liên quan.

### Frontend
- **Sửa** `frontend/zalo_clone_web/src/hooks/use-conversation-socket.ts` (hoặc hook presence riêng)
  - Listen `friend:online/offline`.
  - Update `isOnline` trong conversation list cache.

---

## 11) LOW — Refactor hygiene + reliability + performance

### 11.1 Tránh duplicate socket listeners
- **Vấn đề**: `useSocket()` được gọi nhiều nơi → nhiều `connect/disconnect` listeners.
- **Giải pháp**:
  - tạo **1 provider** `SocketProvider` (React Context) giữ 1 instance state.
  - hooks khác consume context, không tự attach connect listeners.
  - File mới đề xuất:
    - `frontend/zalo_clone_web/src/providers/socket-provider.tsx`

### 11.2 Error-boundary cho socket handlers
- Wrap handler nội bộ trong try/catch để tránh crash silent.
- Nơi sửa: `use-message-socket.ts`, `use-conversation-socket.ts`.

### 11.3 Virtualization cho message list dài
- `MessageList` render toàn bộ messages → lag.
- Plan:
  - Dùng `react-virtuoso` hoặc `react-window`.
  - File sửa chính: `frontend/.../message-list.tsx`.

### 11.4 Dọn mock/hardcode
- Header đang hardcode avatar; cần lấy từ conversation.
- Xoá hoặc tách `mock-data.ts` khỏi build.

---

## 12) Deliverables checklist (Definition of Done)

- Conversation list:
  - realtime reorder + snippet + unread increment + reset
  - xử lý offline sync đầy đủ
- Active chat:
  - scroll anchoring đúng
  - new-message indicator
- Receipts:
  - delivered + seen chạy end-to-end
- Reconnect:
  - sau reconnect không mất tin; data được invalidate/refetch
- Auth:
  - token expiry không làm socket chết silently
- Reliability:
  - không leak listeners; handlers có try/catch

---

## 13) File/Module map (tóm tắt nơi sửa/tạo)

### Frontend (sửa)
- `src/hooks/use-message-socket.ts`
- `src/hooks/use-socket.ts`
- `src/lib/socket.ts`
- `src/hooks/use-conversation-socket.ts`
- `src/features/chat/index.tsx`
- `src/features/chat/hooks/use-chat-messages.ts`
- `src/features/chat/components/chat-content.tsx`
- `src/features/chat/components/message-list.tsx`
- `src/features/chat/components/chat-input.tsx`

### Frontend (tạo mới)
- `src/features/chat/query-keys.ts`
- `src/hooks/use-chat-realtime.ts` (hoặc module tương đương cho conversation list realtime)
- `src/providers/socket-provider.tsx` (optional refactor)

### Backend (sửa)
- `src/modules/message/services/message-realtime.service.ts` (emit conversation updated, sync strategy)
- `src/socket/socket.gateway.ts` (presence fanout, sync endpoints nếu cần)

### Backend (tạo mới — optional)
- `src/socket/guards/ws-jwt.guard.ts` hoặc cơ chế `auth:refresh`.
- `src/socket/dto/sync-request.dto.ts` (nếu implement `sync:request`).

Deliverables checklist (ngắn gọn)
Phase 5: Socket auth refresh + reconnect FE-only + forced logout UI khi auth fail.
Phase 6: Send failure handling (SocketEvents.ERROR) + optimistic sendStatus + retry UI (“Gửi lại”) + rollback FAILED.
Phase 7: Group events completeness (listen GROUP_YOU_WERE_REMOVED, GROUP_MEMBER_JOINED, remove conversation khi dissolved/removed).
Phase 8: Fix race condition pagination vs socket upsert (dedupe/merge metadata/sort) trong messages infinite cache.
UI nhỏ: Spinner “Đang gửi…” khi sendStatus === 'SENDING'.
Phase 9: Typing indicator end-to-end (emit start/stop + listen typing:status + hiển thị “Đang nhập…”).
Phase 10: Presence end-to-end + tôn trọng PrivacySettings.showOnlineStatus (BE fanout friend:online/offline, FE update isOnline cache theo otherUserId, BE trả otherUserId + compute initial isOnline).
Phase 11: Refactor hygiene/reliability (try/catch handlers, cleanup listeners, bỏ hardcode avatar header).