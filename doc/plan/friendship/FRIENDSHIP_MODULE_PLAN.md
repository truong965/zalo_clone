# Kế hoạch hoàn thiện Module Friendship

> **Ngày tạo:** 12/02/2026
> **Phạm vi:** Backend (NestJS) + Frontend (React/Vite)
> **Trạng thái:** Bản kế hoạch — chưa triển khai code

---

## Mục lục

1. [Tổng quan hiện trạng](#1-tổng-quan-hiện-trạng)
2. [Nhiệm vụ 2: Di chuyển component sai vị trí](#2-nhiệm-vụ-2-di-chuyển-component-sai-vị-trí)
3. [Nhiệm vụ 1: Hoàn thiện module Friendship](#3-nhiệm-vụ-1-hoàn-thiện-module-friendship)
4. [Thứ tự thực hiện](#4-thứ-tự-thực-hiện)

---

## 1. Tổng quan hiện trạng

### 1.1 Backend — Những gì đã có

| Thành phần | File | Trạng thái |
|---|---|---|
| **Controller: Friendships** | `src/modules/friendship/controller/friendships.controller.ts` | ✅ Hoàn chỉnh |
| **Controller: FriendRequests** | `src/modules/friendship/controller/friendRequest.controller.ts` | ✅ Hoàn chỉnh |
| **Service** | `src/modules/friendship/service/friendship.service.ts` (1084 dòng) | ✅ Hoàn chỉnh |
| **DTOs** | `src/modules/friendship/dto/friendship.dto.ts` | ⚠️ Thiếu info user trong response lời mời |
| **Events** | `src/modules/friendship/events/friendship.events.ts` (5 events) | ✅ Hoàn chỉnh |
| **Errors** | `src/modules/friendship/errors/friendship.errors.ts` (11 exceptions) | ✅ Hoàn chỉnh |
| **Cache Helper** | `src/modules/friendship/helpers/friendship-cache.helper.ts` | ✅ Hoàn chỉnh |
| **Listeners** | 6 listeners (sent, accepted, declined, removed, unfriended, block) | ✅ Hoàn chỉnh |

**Backend endpoints hiện có:**

| Method | Route | Chức năng |
|---|---|---|
| `POST /friend-requests` | Gửi lời mời kết bạn | ✅ |
| `GET /friend-requests/received` | Lấy danh sách lời mời đã nhận | ⚠️ Thiếu thông tin user |
| `GET /friend-requests/sent` | Lấy danh sách lời mời đã gửi | ⚠️ Thiếu thông tin user |
| `PUT /friend-requests/:id/accept` | Chấp nhận lời mời | ✅ |
| `PUT /friend-requests/:id/decline` | Từ chối lời mời | ✅ |
| `DELETE /friend-requests/:id` | Hủy lời mời đã gửi | ✅ |
| `GET /friendships` | Danh sách bạn bè (paginated) | ✅ |
| `DELETE /friendships/:targetUserId` | Hủy kết bạn | ✅ |
| `GET /friendships/mutual/:targetUserId` | Bạn chung | ✅ |
| `GET /friendships/check/:targetUserId` | Kiểm tra trạng thái | ✅ |

### 1.2 Frontend — Những gì đã có

| Thành phần | File | Trạng thái |
|---|---|---|
| **FriendshipSearchModal** | `features/chat/components/friendship-search-modal.tsx` | ✅ Hoạt động, ❌ sai vị trí |
| **FriendRequestModal** | `features/search/components/FriendRequestModal.tsx` | ✅ Hoạt động, ❌ sai vị trí |
| **UserInfoView** (refactored) | `features/profile/components/user-info-view.tsx` | ✅ Hỗ trợ read-only + actions |
| **useFriendSearchStore** | `features/search/stores/search.store.ts` | ✅ |
| **useSearch** (mở rộng) | `features/search/hooks/use-search.ts` | ✅ Hỗ trợ store 'friend' |
| **contacts/** feature module | `features/contacts/` | ⚠️ Scaffold rỗng (chỉ có types) |
| **API_ENDPOINTS.FRIENDS** | `constants/api-endpoints.ts` | ❌ URL sai so với backend |
| **Friendship service layer** | Không tồn tại | ❌ Chưa có |
| **Friends list UI** | Không tồn tại | ❌ Chưa có |
| **Friend requests UI** | Không tồn tại | ❌ Chưa có |
| **Socket realtime cho friendship** | Không tồn tại | ❌ Chưa có |

### 1.3 Lỗi API path mismatch (Quan trọng)

Frontend `API_ENDPOINTS.FRIENDS` **không khớp** với backend controller routes:

| Frontend (hiện tại) | Backend (thực tế) | Ghi chú |
|---|---|---|
| `/api/v1/friends` | `/api/v1/friendships` | Sai prefix |
| `/api/v1/friends/request` | `/api/v1/friend-requests` | Sai path |
| `/api/v1/friends/request/:id/accept` | `/api/v1/friend-requests/:id/accept` | Sai path |
| `/api/v1/friends/request/:id/reject` | `/api/v1/friend-requests/:id/decline` | Sai path + sai action name |
| `/api/v1/friends/requests` | `/api/v1/friend-requests/received` + `/sent` | Thiếu phân biệt received/sent |

> ⚠️ **Lưu ý:** Cần xác nhận prefix `/api/v1/` được gắn ở đâu (global prefix trong `main.ts`). Các route ở trên giả định global prefix là `/api/v1/`.

---

## 2. Nhiệm vụ 2: Di chuyển component sai vị trí

### 2.1 Phân tích vi phạm

Theo nguyên tắc **Feature-based architecture** (mỗi feature sở hữu domain riêng) và các skills:
- **`architecture-avoid-boolean-props`**: Component nên được tổ chức theo domain, không theo nơi sử dụng
- **`bundle-barrel-imports`**: Import qua barrel exports, không deep import
- **`patterns-explicit-variants`**: Tạo variant rõ ràng thay vì boolean mode

#### ❌ Component 1: `friendship-search-modal.tsx`

| | Chi tiết |
|---|---|
| **Vị trí hiện tại** | `features/chat/components/friendship-search-modal.tsx` |
| **Lý do sai** | Đây là modal tìm bạn qua SĐT + gửi lời mời kết bạn → domain **Contacts/Friendship**, không phải Chat. Không import bất kỳ thứ gì từ chat module. |
| **Vi phạm cross-feature** | Import từ 3 feature khác: `search` (hook, component, type), `profile` (component) |
| **Vị trí đúng** | `features/contacts/components/friendship-search-modal.tsx` |

#### ❌ Component 2: `FriendRequestModal.tsx`

| | Chi tiết |
|---|---|
| **Vị trí hiện tại** | `features/search/components/FriendRequestModal.tsx` |
| **Lý do sai** | Gửi lời mời kết bạn → domain **Contacts/Friendship**. Không có import nào từ search module. |
| **Vị trí đúng** | `features/contacts/components/friend-request-modal.tsx` |

#### 🟡 Vi phạm import: `chat-search-sidebar.tsx`

| | Chi tiết |
|---|---|
| **File** | `features/chat/components/chat-search-sidebar.tsx` |
| **Vi phạm** | Import trực tiếp `@/features/search/components/...` thay vì qua barrel `@/features/search` |
| **Hành động** | Sửa import path sử dụng barrel exports |

### 2.2 Kế hoạch di chuyển

#### Bước 2.1: Tạo cấu trúc `features/contacts/`

```
features/contacts/
├── api/
│   └── friendship.api.ts          ← NEW: TanStack Query hooks gọi REST API
├── components/
│   ├── friend-request-modal.tsx   ← MOVE từ search/components/FriendRequestModal.tsx
│   ├── friendship-search-modal.tsx← MOVE từ chat/components/friendship-search-modal.tsx
│   ├── friend-list.tsx            ← NEW (Nhiệm vụ 1)
│   ├── friend-request-list.tsx    ← NEW (Nhiệm vụ 1)
│   └── friend-card.tsx            ← NEW (Nhiệm vụ 1)
├── hooks/
│   └── use-friendship-socket.ts   ← NEW (Nhiệm vụ 1)
├── stores/
│   └── friendship.store.ts        ← NEW (Nhiệm vụ 1)
├── types/
│   └── index.ts                   ← UPDATE: thêm types cho friend request/list
└── index.ts                       ← UPDATE: barrel exports
```

#### Bước 2.2: Di chuyển `FriendRequestModal.tsx`

| Hành động | Chi tiết |
|---|---|
| **Move file** | `features/search/components/FriendRequestModal.tsx` → `features/contacts/components/friend-request-modal.tsx` |
| **Đổi tên** | PascalCase file → kebab-case (nhất quán với convention project) |
| **Cập nhật imports tại** | `features/search/components/SearchPanel.tsx` (dòng 18) |
| **Cập nhật imports tại** | `features/chat/components/friendship-search-modal.tsx` (dòng 5) — sẽ cập nhật sau khi move file này |
| **Cập nhật barrel** | `features/contacts/index.ts` — export mới |
| **Xóa khỏi search** | Không cần xóa export vì `FriendRequestModal` không có trong `features/search/index.ts` barrel |

#### Bước 2.3: Di chuyển `friendship-search-modal.tsx`

| Hành động | Chi tiết |
|---|---|
| **Move file** | `features/chat/components/friendship-search-modal.tsx` → `features/contacts/components/friendship-search-modal.tsx` |
| **Cập nhật imports tại** | `features/chat/index.tsx` (dòng 9) |
| **Cập nhật import trong file** | `FriendRequestModal` import path → `./friend-request-modal` (cùng thư mục) |
| **Cập nhật barrel** | `features/contacts/index.ts` — export mới |

#### Bước 2.4: Sửa deep imports trong `chat-search-sidebar.tsx`

```diff
- import { ContactResult } from '@/features/search/components/ContactResult';
- import { SearchLoading } from '@/features/search/components/SearchLoading';
- import { SearchEmpty } from '@/features/search/components/SearchEmpty';
+ import { ContactResult, SearchLoading, SearchEmpty } from '@/features/search';
```

> **Điều kiện:** Xác nhận các component trên đã được export từ `features/search/index.ts`.

---

## 3. Nhiệm vụ 1: Hoàn thiện module Friendship

### 3.1 Backend — Cải thiện cần thiết

#### BE-1: Sửa DTO `getReceivedRequests` / `getSentRequests` để trả về thông tin user

**Vấn đề:** `getReceivedRequests()` và `getSentRequests()` chỉ trả về `FriendshipResponseDto` chứa các ID (`user1Id`, `user2Id`, `requesterId`), **không có** `displayName`, `avatarUrl`. Frontend không thể hiển thị danh sách lời mời nếu thiếu thông tin này.

**Vị trí cần sửa:**

| File | Thay đổi |
|---|---|
| `dto/friendship.dto.ts` | Tạo `FriendRequestWithUserDto` kế thừa `FriendshipResponseDto` + thêm `requesterDisplayName`, `requesterAvatarUrl`, `targetDisplayName`, `targetAvatarUrl` |
| `service/friendship.service.ts` dòng 757-789 | `getReceivedRequests()` thêm `include: { user1: { select: ... }, user2: { select: ... } }` và map thêm user info |
| `service/friendship.service.ts` dòng 776-789 | `getSentRequests()` tương tự ở trên |

**DTO mới (mô tả):**
```
FriendRequestWithUserDto:
  - id, status, createdAt, expiresAt (kế thừa)
  - requester: { userId, displayName, avatarUrl }
  - target: { userId, displayName, avatarUrl }
```

#### BE-2: Backend socket notification cho friend request events

**Vấn đề:** Hiện tại `socket-notification.listener.ts` **không** lắng nghe bất kỳ friendship event nào. Khi user A gửi lời mời, user B không nhận được thông báo realtime.

**(tách riêng):** Tạo file mới `socket/listeners/friendship-notification.listener.ts` — tuân thủ R6 split-concern.
**Vị trí cần sửa/thêm:**

| File | Thay đổi |
|---|---|
| `socket/listeners/friendship-notification.listener.ts` | **Thêm** handler cho: `friendship.request.sent` → emit socket event `FRIEND_REQUEST_RECEIVED` tới `toUserId`. `friendship.accepted` → emit `FRIEND_REQUEST_ACCEPTED` tới `requesterId`. `friendship.request.cancelled` → emit `FRIEND_REQUEST_CANCELLED` tới target. `friendship.declined` → emit `FRIEND_REQUEST_DECLINED` tới requester. `friendship.unfriended` → emit `UNFRIENDED` tới đối phương.


#### BE-3: Privacy enforcement trong Contact Search (tùy chọn)

**Vấn đề:** `contact-search.repository.ts` → `mapToDto()` luôn trả về `phoneNumber`, bất kể `showProfile` setting của target user.

**Vị trí cần sửa:**

| File | Thay đổi |
|---|---|
| `modules/search_engine/repositories/contact-search.repository.ts` | Trong `mapToDto()`: kiểm tra `showProfile` của target user, nếu `= 'CONTACTS'` và searcher không phải bạn bè → omit `phoneNumber`, `gender`, `dateOfBirth` |

> **Ưu tiên:** Thấp — Frontend đã sẵn sàng handle (`isPrivacyLimited` logic), backend chỉ cần bổ sung.

#### BE-4: Endpoint friend count

**Mô tả:** Service đã có `getFriendCount()` (private) nhưng chưa expose qua controller. Có thể thêm:

| File | Thay đổi |
|---|---|
| `controller/friendships.controller.ts` | Thêm `GET /friendships/count` → trả về số lượng bạn bè |
| `service/friendship.service.ts` | Đổi `getFriendCount()` từ `private` sang `public` |

---

### 3.2 Frontend — API Endpoints sửa lỗi

#### FE-1: Sửa `API_ENDPOINTS.FRIENDS` khớp với backend

**Vị trí:** `constants/api-endpoints.ts` dòng 53-61

**Thay đổi:**

```diff
  FRIENDS: {
-   GET_ALL: '/api/v1/friends',
-   GET_BY_ID: (id: string) => `/api/v1/friends/${id}`,
-   SEND_REQUEST: '/api/v1/friends/request',
-   ACCEPT_REQUEST: (id: string) => `/api/v1/friends/request/${id}/accept`,
-   REJECT_REQUEST: (id: string) => `/api/v1/friends/request/${id}/reject`,
-   REMOVE: (id: string) => `/api/v1/friends/${id}`,
-   GET_REQUESTS: '/api/v1/friends/requests',
+   // Friendships controller: /friendships
+   GET_ALL: '/api/v1/friendships',
+   UNFRIEND: (targetUserId: string) => `/api/v1/friendships/${targetUserId}`,
+   MUTUAL: (targetUserId: string) => `/api/v1/friendships/mutual/${targetUserId}`,
+   CHECK_STATUS: (targetUserId: string) => `/api/v1/friendships/check/${targetUserId}`,
+   // Friend requests controller: /friend-requests
+   SEND_REQUEST: '/api/v1/friend-requests',
+   GET_RECEIVED: '/api/v1/friend-requests/received',
+   GET_SENT: '/api/v1/friend-requests/sent',
+   ACCEPT_REQUEST: (id: string) => `/api/v1/friend-requests/${id}/accept`,
+   DECLINE_REQUEST: (id: string) => `/api/v1/friend-requests/${id}/decline`,
+   CANCEL_REQUEST: (id: string) => `/api/v1/friend-requests/${id}`,
  },
```

> ⚠️ Sau khi sửa, cần cập nhật tất cả nơi sử dụng `API_ENDPOINTS.FRIENDS.*` (ít nhất `FriendRequestModal.tsx`).

### 3.3 Frontend — Service layer cho Friendship

#### FE-2: Tạo `friendship.api.ts`

**Vị trí:** `features/contacts/api/friendship.api.ts`

**Nội dung (mô tả):**

| Function | Mô tả | HTTP |
|---|---|---|
| `getFriendsList(params)` | Lấy danh sách bạn bè (cursor pagination) | `GET /friendships` |
| `unfriend(targetUserId)` | Hủy kết bạn | `DELETE /friendships/:id` |
| `checkFriendshipStatus(targetUserId)` | Kiểm tra trạng thái | `GET /friendships/check/:id` |
| `getMutualFriends(targetUserId)` | Lấy bạn chung | `GET /friendships/mutual/:id` |
| `sendFriendRequest(targetUserId)` | Gửi lời mời | `POST /friend-requests` |
| `getReceivedRequests()` | Lấy lời mời nhận được | `GET /friend-requests/received` |
| `getSentRequests()` | Lấy lời mời đã gửi | `GET /friend-requests/sent` |
| `acceptRequest(requestId)` | Chấp nhận | `PUT /friend-requests/:id/accept` |
| `declineRequest(requestId)` | Từ chối | `PUT /friend-requests/:id/decline` |
| `cancelRequest(requestId)` | Hủy lời mời | `DELETE /friend-requests/:id` |

**TanStack Query hooks (cùng file hoặc file riêng):**

| Hook | Query/Mutation | Stale/Cache |
|---|---|---|
| `useFriendsList(params)` | `useInfiniteQuery` — cursor pagination | `staleTime: 30s` |
| `useReceivedRequests()` | `useQuery` | `staleTime: 10s` |
| `useSentRequests()` | `useQuery` | `staleTime: 10s` |
| `useSendFriendRequest()` | `useMutation` → invalidate `received`/`sent` queries | — |
| `useAcceptRequest()` | `useMutation` → invalidate `friendsList` + `received` | — |
| `useDeclineRequest()` | `useMutation` → invalidate `received` | — |
| `useCancelRequest()` | `useMutation` → invalidate `sent` | — |
| `useUnfriend()` | `useMutation` → invalidate `friendsList` | — |
| `useCheckStatus(targetUserId)` | `useQuery` — on-demand | `staleTime: 60s` |

### 3.4 Frontend — Zustand Store

#### FE-3: Tạo `friendship.store.ts`

**Vị trí:** `features/contacts/stores/friendship.store.ts`

**State cần quản lý:**

```
FriendshipStore:
  // Badge counts (cho navigation/sidebar)
  pendingReceivedCount: number    ← số lời mời chờ → hiển thị badge
  pendingSentCount: number

  // Actions
  setPendingReceivedCount(n)
  incrementPendingReceived()
  decrementPendingReceived()

  // Active tab (cho Friend Request UI)
  activeTab: 'received' | 'sent'
  setActiveTab(tab)
```

> **Lưu ý:** Danh sách bạn bè & lời mời được quản lý bởi TanStack Query (server state), Zustand chỉ quản lý UI state & badge count.

### 3.5 Frontend — Socket hook cho Friendship

#### FE-4: Tạo `use-friendship-socket.ts`

**Vị trí:** `features/contacts/hooks/use-friendship-socket.ts`

**Events cần lắng nghe (tương ứng BE-2):**

| Socket Event | Hành động frontend |
|---|---|
| `FRIEND_REQUEST_RECEIVED` | `incrementPendingReceived()`, invalidate `receivedRequests` query, show notification |
| `FRIEND_REQUEST_ACCEPTED` | Invalidate `friendsList` + `sentRequests`, show notification |
| `FRIEND_REQUEST_CANCELLED` | `decrementPendingReceived()`, invalidate `receivedRequests` |
| `FRIEND_REQUEST_DECLINED` | Invalidate `sentRequests`, show notification (tùy chọn) |
| `UNFRIENDED` | Invalidate `friendsList`, show notification |

**Nơi sử dụng:** Hook này cần mount ở top-level (trong layout hoặc `App`) để luôn nhận được realtime updates dù user đang ở page nào.

### 3.6 Frontend — UI Components mới

#### FE-5: `friend-request-list.tsx`

**Vị trí:** `features/contacts/components/friend-request-list.tsx`

**Mô tả:**
- Tabs: "Đã nhận" / "Đã gửi"
- Tab "Đã nhận": list các lời mời + nút "Chấp nhận" / "Từ chối"
- Tab "Đã gửi": list các lời mời + nút "Hủy"
- Mỗi item hiển thị: avatar, displayName, thời gian gửi
- Sử dụng `useReceivedRequests()` / `useSentRequests()`
- Badge count trên tab "Đã nhận" = `pendingReceivedCount` từ store

#### FE-6: `friend-list.tsx`

**Vị trí:** `features/contacts/components/friend-list.tsx`

**Mô tả:**
- Danh sách bạn bè với infinite scroll (cursor pagination)
- Thanh tìm kiếm inline (search by name/phone — dùng query param `search` của `GET /friendships`)
- Mỗi item: avatar, displayName, click → mở conversation (hoặc tạo nếu chưa có)
- Context menu / swipe: "Nhắn tin", "Hủy kết bạn"
- Sử dụng `useFriendsList()`

#### FE-7: `friend-card.tsx`

**Vị trí:** `features/contacts/components/friend-card.tsx`

**Mô tả:**
- Component tái sử dụng cho mỗi item trong `friend-list.tsx` và `friend-request-list.tsx`
- Props: `user: { userId, displayName, avatarUrl }`, `actions: ReactNode`
- Tuân thủ `architecture-avoid-boolean-props` — dùng slot `actions` thay vì `showAcceptButton`, `showRejectButton`

### 3.7 Frontend — Cải thiện `friendship-search-modal.tsx`

#### FE-8: Xử lý thêm trạng thái relationship

**Vấn đề:** Hiện tại chỉ phân biệt `FRIEND` vs "không phải bạn". Cần xử lý thêm:

| `relationshipStatus` | Hành động UI |
|---|---|
| `FRIEND` | Nút "Nhắn tin" (giữ nguyên) |
| `PENDING_SENT` | Nút "Đã gửi lời mời" (disabled) hoặc "Hủy lời mời" |
| `PENDING_RECEIVED` | Nút "Chấp nhận" + "Từ chối" |
| `NONE` / `DECLINED` | Nút "Kết bạn" (giữ nguyên) |
| `BLOCKED` | Ẩn hoàn toàn / thông báo "Không thể liên hệ" |

**Vị trí:** `features/contacts/components/friendship-search-modal.tsx` (sau khi di chuyển)

#### FE-9: Cập nhật `FriendRequestModal` dùng `friendship.api.ts`

**Vấn đề:** `FriendRequestModal` hiện gọi `apiClient.post()` trực tiếp thay vì dùng service/hook.

**Thay đổi:**

| File | Thay đổi |
|---|---|
| `features/contacts/components/friend-request-modal.tsx` | Thay `apiClient.post(API_ENDPOINTS.FRIENDS.SEND_REQUEST, { friendId })` bằng `useSendFriendRequest()` mutation |
| | Sửa body: backend expects `{ targetUserId }` không phải `{ friendId }` |

### 3.8 Frontend — Tích hợp vào Navigation/Layout

#### FE-10: Contacts page

**Mô tả:** Cần có một page/tab hiển thị module Contacts hoàn chỉnh:

```
/contacts (hoặc tab trong sidebar chính)
├── FriendRequestList (tabs: Đã nhận / Đã gửi)
├── FriendList (danh sách bạn bè + search)
└── Badge count trên icon contacts
```

**Vị trí cần cập nhật:**
- Router: thêm route `/contacts` nếu chưa có
- Sidebar navigation: thêm badge count cho lời mời pending
- `features/contacts/index.ts`: export tất cả public API

---

## 4. Thứ tự thực hiện

### Phase 1: Sửa lỗi & di chuyển (không feature mới)

| # | Task | Loại | Ưu tiên |
|---|---|---|---|
| 1.1 | **FE-1** — Sửa `API_ENDPOINTS.FRIENDS` khớp backend | Fix bug | 🔴 Cao |
| 1.2 | **Bước 2.1** — Tạo cấu trúc thư mục `features/contacts/` | Refactor | 🔴 Cao |
| 1.3 | **Bước 2.2** — Di chuyển `FriendRequestModal` → contacts | Refactor | 🔴 Cao |
| 1.4 | **Bước 2.3** — Di chuyển `friendship-search-modal` → contacts | Refactor | 🔴 Cao |
| 1.5 | **Bước 2.4** — Sửa deep imports trong `chat-search-sidebar.tsx` | Refactor | 🟡 Trung bình |
| 1.6 | Cập nhật `FriendRequestModal` body request: `friendId` → `targetUserId` | Fix bug | 🔴 Cao |

### Phase 2: Backend bổ sung

| # | Task | Loại | Ưu tiên |
|---|---|---|---|
| 2.1 | **BE-1** — Bổ sung user info trong `getReceivedRequests/getSentRequests` | Enhancement | 🔴 Cao |
| 2.2 | **BE-2** — Socket notification cho friendship events | Feature | 🔴 Cao |
| 2.3 | **BE-3** — Privacy enforcement trong contact search | Enhancement | 🟡 Trung bình |
| 2.4 | **BE-4** — Endpoint friend count | Enhancement | 🟢 Thấp |

### Phase 3: Frontend service & state layer

| # | Task | Loại | Ưu tiên |
|---|---|---|---|
| 3.1 | **FE-2** — Tạo `friendship.api.ts` (REST functions + TanStack hooks) | Feature | 🔴 Cao |
| 3.2 | **FE-3** — Tạo `friendship.store.ts` (Zustand) | Feature | 🔴 Cao |
| 3.3 | **FE-4** — Tạo `use-friendship-socket.ts` | Feature | 🔴 Cao |
| 3.4 | **FE-9** — Cập nhật `FriendRequestModal` dùng mutation hook | Refactor | 🟡 Trung bình |

### Phase 4: UI Components

| # | Task | Loại | Ưu tiên |
|---|---|---|---|
| 4.1 | **FE-7** — Tạo `friend-card.tsx` (base component) | Feature | 🔴 Cao |
| 4.2 | **FE-5** — Tạo `friend-request-list.tsx` | Feature | 🔴 Cao |
| 4.3 | **FE-6** — Tạo `friend-list.tsx` | Feature | 🔴 Cao |
| 4.4 | **FE-8** — Cải thiện `friendship-search-modal` xử lý thêm trạng thái | Enhancement | 🟡 Trung bình |
| 4.5 | **FE-10** — Tích hợp vào navigation/layout + badge count | Feature | 🔴 Cao |

### Phase 5: Testing & Polish

| # | Task | Loại | Ưu tiên |
|---|---|---|---|
| 5.1 | Test E2E: gửi/nhận/chấp nhận/từ chối/hủy lời mời | Test | 🔴 Cao |
| 5.2 | Test realtime: socket events cho friendship | Test | 🔴 Cao |
| 5.3 | Test edge cases: concurrent requests, block + friend, rate limits | Test | 🟡 Trung bình |
| 5.4 | UI polish: loading states, error states, empty states | Polish | 🟡 Trung bình |

---

## Phụ lục

### A. Cấu trúc thư mục cuối cùng (dự kiến)

```
features/contacts/
├── api/
│   └── friendship.api.ts          ← REST + TanStack Query hooks
├── components/
│   ├── friend-card.tsx            ← Base card component
│   ├── friend-list.tsx            ← Danh sách bạn bè (infinite scroll)
│   ├── friend-request-list.tsx    ← Danh sách lời mời (tabs)
│   ├── friend-request-modal.tsx   ← Modal gửi lời mời (moved from search)
│   └── friendship-search-modal.tsx← Modal tìm bạn bằng SĐT (moved from chat)
├── hooks/
│   └── use-friendship-socket.ts   ← Socket realtime hook
├── stores/
│   └── friendship.store.ts        ← Zustand (badge count, UI state)
├── types/
│   └── index.ts                   ← Types cho friendship domain
└── index.ts                       ← Barrel exports
``` 

### B. Checklist kiểm tra sau hoàn thành

- [ ] Tất cả API_ENDPOINTS khớp backend controller routes
- [ ] Không còn component friendship nào trong `features/chat/` hoặc `features/search/`
- [ ] Tất cả imports cross-feature đi qua barrel exports
- [ ] `FriendRequestModal` dùng đúng body request `{ targetUserId }`
- [ ] Socket events realtime hoạt động cho tất cả friendship lifecycle
- [ ] `getReceivedRequests` / `getSentRequests` trả về thông tin user
- [ ] Badge count cập nhật realtime khi nhận lời mời
- [ ] Infinite scroll hoạt động cho friend list
- [ ] Friendship search modal xử lý đúng tất cả `relationshipStatus`
- [ ] Privacy enforcement: backend ẩn thông tin khi `showProfile = CONTACTS`
