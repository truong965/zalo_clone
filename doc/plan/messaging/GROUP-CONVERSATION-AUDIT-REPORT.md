# GROUP-CONVERSATION — Báo cáo kiểm tra tổng hợp

> **Ngày:** 2025-01-20 (cập nhật: 2025-01-20)
> **Phạm vi:** Phase 1–5 của GROUP-CONVERSATION-PLAN.md
> **Ghi chú:** Task 1.7 (Unit tests) được bỏ qua theo yêu cầu. Task 1.6 (Group avatar endpoint) bỏ qua — sẽ implement tại module media.

---

## Mục lục

1. [Tổng quan Phase 5 (vừa implement)](#1-tổng-quan-phase-5-vừa-implement)
2. [Kiểm tra Phase 1–4](#2-kiểm-tra-phase-1-4)
3. [Lỗi tiềm ẩn & Risks](#3-lỗi-tiềm-ẩn--risks)
4. [Technical Debt](#4-technical-debt)
5. [Danh sách việc cần làm (Action Items)](#5-danh-sách-việc-cần-làm-action-items)

---

## 1. Tổng quan Phase 5 (vừa implement)

| Task | Trạng thái | Ghi chú |
|------|-----------|---------|
| 5.1 `useGroupNotifications` hook | ✅ Hoàn thành | Xử lý 8 events, toast thông báo, click-to-navigate |
| 5.2 Mount ở ClientLayout | ✅ Hoàn thành | Cùng pattern `useFriendshipSocket` |
| 5.3 Invalidate cache khi nhận events | ✅ Hoàn thành | `invalidateGroups`, `invalidateAll`, `invalidateMembers`, `invalidateDetail` |
| 5.4 Loading states + error states | ✅ Hoàn thành | Thêm error state vào `GroupList`, `MemberList`; thêm `isError`/`refetch` vào `useFriendSearch` |
| 5.5 Responsive design (P2) | ⚠️ Ghi nhận | Không thay đổi layout — ghi nhận issues trong báo cáo |
| 5.6 Accessibility keyboard nav (P2) | ✅ Hoàn thành | `GroupListItemCard`: `role="button"`, `tabIndex`, `onKeyDown`, `aria-label`. `MemberListItem`: `role="checkbox"`, `aria-checked`, `aria-disabled`. `contacts.tsx`: `role="tablist"`, `role="tab"`, `aria-selected` |

### Files tạo mới
- `features/conversation/hooks/use-group-notifications.ts`

### Files chỉnh sửa
- `components/layout/client-layout.tsx` — import + mount `useGroupNotifications`
- `features/conversation/hooks/index.ts` — export mới
- `features/conversation/index.ts` — export mới
- `features/conversation/hooks/use-friend-search.ts` — thêm `isError`, `error`, `refetch`
- `features/conversation/components/create-group-modal/member-list.tsx` — thêm error state UI
- `features/conversation/components/group-list/group-list.tsx` — thêm error state UI
- `features/conversation/components/group-list/group-list-item.tsx` — a11y attributes
- `features/conversation/components/create-group-modal/member-list-item.tsx` — a11y attributes
- `pages/contacts.tsx` — ARIA tablist/tab/tabpanel attributes

---

## 2. Kiểm tra Phase 1–4

### Phase 1: Backend API

| Task | Trạng thái | Chi tiết |
|------|-----------|---------|
| 1.1 `getUserGroups()` | ✅ | — |
| 1.2 `GET /groups` endpoint | ✅ Fixed | ~~Controller không bind `@Query('search')`~~ → Đã thêm `@Query('search')` + Prisma `name: { contains: search, mode: 'insensitive' }` |
| 1.3 `GroupListItemDto` | ✅ Fixed | ~~Thiếu `myRole`, `isMuted`, `requireApproval`, `createdAt`~~ → Đã thêm tất cả fields vào DTO + service query + mapToDto |
| 1.4 `GET /search/contacts` | ✅ | — |
| 1.5 `ContactSearchService` injection | ✅ | — |
| 1.6 Upload group avatar endpoint | ❌ Chưa có | Không có `POST /conversations/groups/:id/avatar`. Frontend dùng workaround qua generic presigned URL, chỉ set avatar lúc tạo, không update được sau |

### Phase 2: Frontend Feature Scaffold

| Task | Trạng thái |
|------|-----------|
| 2.1 `features/conversation/` structure | ✅ |
| 2.2 `conversation.api.ts` | ✅ |
| 2.3 TanStack hooks | ✅ |
| 2.4 Re-exports backward compat | ✅ |
| 2.5 API endpoints constants | ✅ |
| 2.6 Types (`GroupListItem`, etc.) | ✅ (thiếu `CreateGroupFormData` type — nhưng logic nằm trong store) |

### Phase 3: Create Group Modal

| Task | Trạng thái |
|------|-----------|
| 3.1 Zustand store | ✅ |
| 3.2 GroupInfoHeader | ✅ |
| 3.3 MemberSearchBar | ✅ |
| 3.4 MemberListItem | ✅ |
| 3.5 MemberList | ✅ |
| 3.6 SelectedMembersPanel | ✅ |
| 3.7 CreateGroupModal container | ✅ |
| 3.8 useCreateGroup hook | ✅ |
| 3.9 useFriendSearch hook | ✅ |
| 3.10 Button trong sidebar | ✅ (wired khác plan — từ `features/chat/index.tsx`) |
| 3.11 Confirm dialog khi close | ✅ |
| 3.12 Phone validation | ✅ (logic trong hook, không trong search bar component) |

### Phase 4: Groups Tab

| Task | Trạng thái |
|------|-----------|
| 4.1 GroupList component | ✅ |
| 4.2 GroupListItem component | ✅ |
| 4.3 useUserGroups hook | ✅ |
| 4.4 Replace GroupsPlaceholder | ✅ |
| 4.5 "Tạo nhóm" button | ✅ |
| 4.6 Search filter | ✅ Fixed | Backend đã xử lý `search` param |

### Tổng kết Phase 1–4

| Phase | Tổng | ✅ | ⚠️ | ❌ |
|-------|------|----|----|-----|
| Phase 1 (skip 1.6, 1.7) | 5 | 5 | 0 | 0 |
| Phase 2 | 6 | 6 | 0 | 0 |
| Phase 3 | 12 | 12 | 0 | 0 |
| Phase 4 | 6 | 6 | 0 | 0 |
| **Tổng** | **29** | **29** | **0** | **0** |

---

## 3. Lỗi tiềm ẩn & Risks

### 3.1 Bugs (B1–B6)

| ID | Mô tả | Trạng thái | Giải pháp đề xuất |
|----|-------|-----------|-------------------|
| B1 | Race condition tạo nhóm trùng | ✅ Đã xử lý | Button disabled + loading state |
| B2 | Stale friends list khi submit | ❌ **Chưa xử lý** | Backend `createGroup()` cần validate friendship status cho từng `memberIds[]` trước khi tạo. Nếu đã unfriend → trả error cụ thể, frontend hiển thị "A không còn là bạn bè" |
| B3 | Avatar upload fail | ✅ Đã xử lý | Graceful fallback, tạo nhóm không avatar |
| B4 | Group name XSS | ⚠️ Một phần | React JSX escape an toàn. Cần thêm `sanitize-html` hoặc `class-validator` `@Matches()` ở backend DTO nếu group name dùng ngoài JSX (email, push notification) |
| B5 | Search contacts trả về chính mình | ✅ Đã xử lý | SQL `WHERE u.id != $1` |
| B6 | Conversation list cache stale | ✅ Đã xử lý (Phase 5) | `useGroupNotifications` invalidate cache khi nhận `group:created` event |

### 3.2 Performance (P1–P4)

| ID | Mô tả | Trạng thái | Giải pháp đề xuất |
|----|-------|-----------|-------------------|
| P1 | N+1 query `getUserGroups()` | ⚠️ Một phần | Prisma `include` tránh N+1, nhưng chưa tối ưu bằng raw SQL `json_agg()`. Chấp nhận được với < 100 groups. Nếu cần scale: viết raw query với `json_agg()` + `lateral join` |
| P2 | Re-render MemberList toàn bộ | ✅ Đã xử lý | `memo()` + per-item selector `selectIsSelected(id)` |
| P3 | Search debounce quá ngắn | ✅ Đã xử lý | 300–350ms |
| P4 | Friends list render ALL items | ❌ **Chưa xử lý** | IntersectionObserver chỉ load pages, nhưng render TẤT CẢ items vào DOM. Cần `react-window` hoặc `@tanstack/virtual` cho danh sách > 500 items |

### 3.3 UX (U1–U5)

| ID | Mô tả | Trạng thái | Giải pháp đề xuất |
|----|-------|-----------|-------------------|
| U1 | Không cảnh báo blocked members | ❌ **Chưa xử lý** | Backend cần trả `isBlocked` trong friend list response. Frontend disable + tooltip "Người dùng bị chặn" trong MemberListItem |
| U2 | Socket disconnect → user confused | ✅ Fixed | `useCreateGroup`: `Promise.race([emit, timeout(15s)])`. Timeout → toast "Kết nối quá thời gian. Vui lòng thử lại." |
| U3 | Stranger search leak info | ✅ Đã xử lý | Phone regex gate |
| U4 | Selected members panel overflow | ✅ Fixed | Giới hạn 250 thành viên tại frontend (`MAX_SELECTED_MEMBERS=250`). Khi vượt → hiển thị warning notification |
| U5 | Modal close mất state | ✅ Đã xử lý | `Modal.confirm` |

### 3.4 Tổng kết Risks

| Loại | Tổng | ✅ | ⚠️ | ❌ |
|------|------|----|----|-----|
| Bugs | 6 | 4 | 1 | 1 |
| Performance | 4 | 2 | 1 | 1 |
| UX | 5 | 4 | 0 | 1 |
| **Tổng** | **15** | **10** | **2** | **3** |

---

## 4. Technical Debt

| ID | Mô tả | Mức độ | Giải pháp đề xuất |
|----|-------|--------|-------------------|
| D1 | `ChatInfoSidebar` hardcoded cho DIRECT | HIGH | Refactor theo CHAT-INFO-SIDEBAR-PLAN.md — thêm GROUP variant với member list, group settings, admin actions |
| D2 | `conversationService` cũ trong `services/` | ✅ Đã xử lý | Re-export `@deprecated` — sẽ xóa khi migration xong |
| D3 | `ChatConversation` type coupling | MEDIUM | `conversation.api.ts` import từ `@/features/chat/types`. Cần tách conversation types riêng, chat feature import từ conversation — không ngược lại |
| D4 | Socket handlers tight coupling | MEDIUM | `features/chat/index.tsx` điều phối socket handlers. Cần tách thành composition pattern: mỗi feature module register handlers riêng qua provider |
| D5 | Responsive layout cứng | LOW | `CreateGroupModal` width=640px cứng, `contacts.tsx` sidebar w-[280px] cứng. Cần `max-w-screen` + responsive breakpoints (sm/md/lg) |
| D6 | Không có Error Boundary | ✅ Fixed | Tạo `components/shared/error-boundary.tsx` (class component + default fallback UI). Wrap `GroupList` trong `contacts.tsx` + `CreateGroupModal` trong `chat/index.tsx` |
| D7 | Duplicate socket listener risk | LOW | `useGroupNotifications` mount ở ClientLayout + `useConversationSocket` có thể mount ở chat page. Cần verify không duplicate listener registration (hiện tại handlersRef pattern tránh được nếu cùng instance) |
| D8 | Missing `search` param backend | ✅ Fixed | Đã thêm `@Query('search')` vào controller + Prisma `name: { contains: search, mode: 'insensitive' }` filter |

---

## 5. Danh sách việc cần làm (Action Items)

### Ưu tiên CRITICAL (cần sửa ngay)

| # | Việc cần làm | File | Giải pháp |
|---|-------------|------|-----------|
| 1 | ~~Backend bind `search` param cho `GET /groups`~~ | ✅ DONE | Đã fix: `@Query('search')` + Prisma filter |
| 2 | ~~Thêm `GroupListItemDto` fields còn thiếu~~ | ✅ DONE | Đã thêm `myRole`, `isMuted`, `requireApproval`, `createdAt` |

### Ưu tiên HIGH

| # | Việc cần làm | Giải pháp |
|---|-------------|-----------|
| 3 | ~~Tạo `POST /groups/:id/avatar` endpoint~~ | SKIP | Sẽ implement tại module media |
| 4 | Validate friendship status khi tạo nhóm (B2) | Backend `createGroup()`: query friendship table, reject members không còn là friend |
| 5 | ~~React ErrorBoundary (D6)~~ | ✅ DONE | Tạo `components/shared/error-boundary.tsx`, wrap `GroupList` + `CreateGroupModal` |
| 6 | ~~Socket emit timeout + fallback REST (U2)~~ | ✅ DONE | `Promise.race([emit, timeout(15s)])` trong `useCreateGroup` |

### Ưu tiên MEDIUM

| # | Việc cần làm | Giải pháp |
|---|-------------|-----------|
| 7 | Tách `ChatConversation` type (D3) | Tạo `features/conversation/types/conversation.ts` chứa shared conversation types. `features/chat/types` import từ đây |
| 8 | Virtual list cho friends/groups (P4) | Thay thế plain `div` list bằng `@tanstack/react-virtual` cho MemberList + GroupList. Giữ IntersectionObserver cho load-more trigger |
| 9 | Blocked member warning (U1) | Backend trả `isBlocked` trong friend list API. Frontend disable + tooltip trong `MemberListItem` |
| 10 | ~~Selected members overflow indicator (U4)~~ | ✅ DONE — Giới hạn 250 thành viên (`MAX_SELECTED_MEMBERS=250`) + warning notification khi vượt limit |

### Ưu tiên LOW

| # | Việc cần làm | Giải pháp |
|---|-------------|-----------|
| 11 | Responsive layout (D5) | `CreateGroupModal`: `width={{ base: '100%', md: 640 }}`. `contacts.tsx`: sidebar hidden on mobile, hamburger menu |
| 12 | Group name sanitization (B4) | Backend DTO: `@Matches(/^[^<>]*$/)` hoặc dùng `sanitize-html` library |
| 13 | Socket handler composition pattern (D4) | Refactor thành provider-based registration: mỗi feature module export `useXxxSocketHandlers()`, ClientLayout mount tất cả |

---

## Tóm tắt

- **Phase 1–4:** **29/29 tasks** hoàn thành (skip 1.6 → media module, skip 1.7 → unit tests)
- **Risks:** **10/15** addressed, **2 partial**, **3 unaddressed** (B2, P4, U1)
- **CRITICAL fixes hoàn thành:** Backend `search` param + GroupListItemDto fields
- **HIGH fixes hoàn thành:** ErrorBoundary (D6) + Socket emit timeout (U2)
- **U4 hoàn thành:** Giới hạn 250 thành viên tại frontend + warning notification
- **Tech debt còn lại:** D1 (HIGH), D3–D5 (MEDIUM/LOW), D7 (LOW)

### Files đã sửa (session fix)
- `conversation.controller.ts` — thêm `@Query('search')` param
- `conversation.service.ts` — thêm `search` filter + `role`/`isMuted` select + mapToDto fields
- `group-list-item.dto.ts` — thêm `myRole`, `isMuted`, `requireApproval`, `createdAt`
- `features/conversation/types/index.ts` — sync `GroupListItem` interface với DTO mới
- `components/shared/error-boundary.tsx` — **mới** — shared ErrorBoundary component
- `pages/contacts.tsx` — wrap `GroupList` với ErrorBoundary
- `features/chat/index.tsx` — wrap `CreateGroupModal` với ErrorBoundary
- `features/conversation/hooks/use-create-group.ts` — thêm `Promise.race` timeout 15s
- `features/conversation/stores/create-group.store.ts` — thêm `MAX_SELECTED_MEMBERS=250` + limit check
