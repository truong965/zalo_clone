# Frontend Architecture Review Report

> **Project:** zalo_clone_web (Vite + React 19 + TypeScript)  
> **Review Date:** 2026-02-22  
> **Scope:** `frontend/zalo_clone_web/src/` — pages, features, services, hooks, types, components, utils, routing, state management  
> **Evaluation Rules:** vercel-composition-patterns, vercel-react-best-practices, web-design-guidelines

---

## 1. Executive Summary

| Metric | Value |
|--------|-------|
| **Overall Score** | **4.5 / 10** |
| **Main Risks** | God component (chat/index.tsx — 738 lines), circular cross-feature dependencies, duplicate auth state, feature boundary violations, global hooks/services that belong in features, 100% hardcoded admin module |
| **Technical Debt Level** | **High** |
| **Estimated total source lines** | ~16,700 (features + components), ~2,800 (global infra) |
| **Files > 300 lines** | 17 |
| **Cross-feature violations** | 22+ direct internal imports |

### Score Breakdown

| Category | Weight | Score | Notes |
|----------|--------|-------|-------|
| Architecture & Feature Boundary | 25% | 4/10 | Chat module has no boundary; 4-feature coupling |
| Dependency Management | 15% | 5/10 | Circular type dep; global → feature imports in lib/socket |
| React Best Practices | 20% | 4/10 | 738-line god component; 13-ref hook; re-render bombs |
| Types & Contracts | 10% | 5/10 | 704-line monolith types file; 6+ duplicate types |
| Error Handling & Resilience | 10% | 3/10 | ErrorBoundary exists but deployed inconsistently; no API error normalization |
| Scalability & Maintainability | 20% | 4/10 | Adding features requires touching chat god component; no established patterns |

---

## 2. Current Structure Overview

### 2.1 Directory Map

```
src/
├── app/                        # App shell
│   ├── App.tsx                 # RouterProvider wrapper
│   ├── main.tsx                # ReactDOM entry
│   └── providers.tsx           # QueryClient + Ant ConfigProvider + Sonner
├── components/
│   ├── layout/
│   │   ├── admin-header.tsx
│   │   ├── admin-layout.tsx
│   │   ├── admin-sidebar.tsx
│   │   ├── client-layout.tsx
│   │   └── client-sidebar.tsx
│   ├── shared/
│   │   └── error-boundary.tsx  # Only shared component
│   ├── ui/                     # EMPTY — unused layer
│   └── private-route.tsx       # Auth guard
├── config/
│   ├── env.ts                  # Env validation (warn-only, not throw)
│   └── paths.ts                # DEAD CODE — entirely commented out
├── constants/
│   ├── api-endpoints.ts        # Centralized API routes (good)
│   └── socket-events.ts        # Centralized socket events (good)
├── features/
│   ├── auth/       ✅ Well-structured (api, hooks, stores, types)
│   ├── chat/       ❌ GOD MODULE (738-line index, no api/, no store)
│   ├── contacts/   ⚠️ Fair (duplicate types, socket events hardcoded locally)
│   ├── conversation/ ⚠️ Fair (circular dep with chat, duplicate formatTimestamp)
│   ├── profile/    ❌ SKELETON (no api, no hooks, no store — only types + 3 components)
│   ├── call/       ❌ EMPTY SHELL (only types/index.ts)
│   ├── search/     ⚠️ Large but organized (433-line types, 432-line hook)
│   └── notification/ ❌ EMPTY SHELL (only types/index.ts)
├── hooks/                      # Global hooks — 3 deprecated shims + 2 misplaced feature hooks
│   ├── index.ts                # useMobileView, useDebounce, usePrevious (OK)
│   ├── use-socket.ts           # Global socket connector (OK)
│   ├── use-message-socket.ts   # ⚠️ 516 lines — SHOULD BE IN features/chat or features/messaging
│   ├── use-infinite-scroll.ts  # OK (generic) but has hardcoded 500ms artificial delay
│   ├── use-conversation-list-realtime.ts  # DEPRECATED shim — delete
│   └── use-conversation-socket.ts         # DEPRECATED shim — delete
├── lib/
│   ├── axios.ts                # Axios instance + interceptors (global — OK)
│   ├── query-client.ts         # QueryClient config (global — OK)
│   ├── socket.ts               # SocketManager class — ⚠️ imports from @/features/auth
│   └── utils.ts                # cn(), formatBytes — ⚠️ missing tailwind-merge
├── pages/
│   ├── chat.tsx                # Thin wrapper → <ChatFeature /> (good)
│   ├── contacts.tsx            # ⚠️ 116 lines with layout logic + cross-feature import
│   ├── login.tsx               # ⚠️ Hardcoded routes, broken phone regex comment
│   ├── register.tsx            # ⚠️ setTimeout leak, hardcoded routes
│   ├── profile.tsx             # ❌ 100% MOCK DATA, no API, English labels
│   ├── calls.tsx               # ❌ 100% MOCK DATA
│   ├── not-found.tsx           # OK (hardcoded '/chat' route)
│   ├── permission-denied.tsx   # OK (hardcoded '/chat' route)
│   └── admin/                  # ❌ ENTIRE MODULE IS MOCK DATA
│       ├── dashboard.tsx       # Hardcoded stats (1234, 45678, etc.)
│       ├── users.tsx           # console.log actions, non-functional search
│       ├── messages.tsx        # Bug: substring + '...' on short text
│       ├── calls.tsx           # Duplicated duration formatting
│       ├── reports.tsx         # Non-functional actions
│       └── settings.tsx        # console.log onFinish, inconsistent notification
├── routes/
│   └── index.tsx               # React Router config — inline <div> placeholders
├── services/                   # ⚠️ Global services — should be feature-scoped
│   ├── conversation.service.ts # DEPRECATED re-export shim
│   ├── media.service.ts        # 242 lines — borderline global (used by chat + profile)
│   └── message.service.ts      # 63 lines — SHOULD BE in features/chat/api
├── stores/
│   └── use-app-store.ts        # ⚠️ Duplicates auth state from useAuthStore
├── styles/
│   └── (CSS files)
├── types/
│   ├── api.ts                  # 704-line monolith — ALL domain types
│   └── index.ts                # Barrel re-export
└── utils/
    ├── date.ts                 # formatMessageTime, formatTimeAgo (OK)
    ├── interaction-error.ts    # Block/error handler — ⚠️ coupled to antd + string matching
    └── validation.ts           # Zod schemas — ⚠️ overlaps with media.service.ts
```

### 2.2 Feature Boundary Analysis

| Feature | API | Hooks | Store | Types | Components | Boundary |
|---------|-----|-------|-------|-------|------------|----------|
| **auth** | ✅ | ✅ | ✅ | ✅ | ❌ (0) | **Good** — leaf module |
| **chat** | ❌ (0) | ✅ (4) | ❌ (0) | ✅ | ✅ (17) | **Broken** — imports from 4 features, no own API/store |
| **contacts** | ✅ (2) | ✅ (2) | ✅ | ✅ | ✅ (5) | **Fair** — some cross-feature imports |
| **conversation** | ✅ | ✅ (7) | ✅ | ✅ (2) | ✅ (14) | **Fair** — circular with chat types |
| **profile** | ❌ (0) | ❌ (0) | ❌ (0) | ✅ | ✅ (3) | **Skeleton** — not a real module |
| **search** | ✅ | ✅ (4) | ✅ | ✅ | ✅ (12) | **Good** (minor cross-feature) |
| **call** | ❌ | ❌ | ❌ | ✅ | ❌ | **Empty shell** |
| **notification** | ❌ | ❌ | ❌ | ✅ | ❌ | **Empty shell** |

---

## 3. Critical Issues

### 3.1 GOD COMPONENT — `ChatFeature` (738 lines, 9 useState, 10 useEffect, 10 useRef, 11 useCallback)

| Attribute | Value |
|-----------|-------|
| **File** | `src/features/chat/index.tsx` |
| **Why problematic** | Single function component owns ~15 responsibilities: conversation list CRUD, message send/retry, typing indicators, media progress, mark-as-seen, URL sync, sidebar state, optimistic updates. Any state change re-renders the entire chat shell. |
| **Risk Level** | **CRITICAL** |
| **Violations** | `architecture-avoid-boolean-props`, `rerender-memo`, `rerender-defer-reads` (vercel-react-best-practices) |
| **Refactor** | Decompose into: `useChatSelection()`, `useConversationList()`, `useSendMessage()`, `useMarkAsSeen()`, `useTypingIndicator()`, plus a Zustand `chat.store.ts` for shared UI state. The JSX should be a pure layout shell <200 lines. |

### 3.2 CIRCULAR TYPE DEPENDENCY — `conversation ↔ chat`

| Attribute | Value |
|-----------|-------|
| **File** | `src/features/conversation/types/conversation.ts` → defines `ConversationUI` → `src/features/chat/types/index.ts` imports it as `ChatConversation = ConversationUI` → `src/features/conversation/hooks/use-conversation-list-realtime.ts` imports `ChatConversation` from `@/features/chat/types` |
| **Why problematic** | Circular cross-feature dependency. If either feature is extracted to a separate package/micro-frontend, this breaks. Prevents independent deployment/testing of either feature. |
| **Risk Level** | **CRITICAL** |
| **Refactor** | `ConversationUI` is the canonical type — move it to `src/types/api.ts` (shared types) or keep it in `conversation/types`. Delete the `ChatConversation` alias entirely. All consumers import `ConversationUI` from one canonical location. |

### 3.3 DUPLICATE AUTH STATE — `useAppStore` vs `useAuthStore`

| Attribute | Value |
|-----------|-------|
| **File** | `src/stores/use-app-store.ts` has `user: User | null`, `isAuthenticated: boolean` AND `src/features/auth/stores/auth.store.ts` has the same fields |
| **Why problematic** | Two sources of truth for authentication. If `useAuthStore.logout()` is called but `useAppStore.user` isn't cleared (or vice versa), the app enters an inconsistent state. |
| **Risk Level** | **HIGH** |
| **Refactor** | Remove `user` and `isAuthenticated` from `useAppStore`. Keep only cross-cutting UI state (theme, language, sidebarOpen). All auth reads go through `useAuthStore`. |

### 3.4 GLOBAL LIB IMPORTS FROM FEATURE MODULE

| Attribute | Value |
|-----------|-------|
| **File** | `src/lib/socket.ts` imports `authService` from `@/features/auth/api/auth.service` and `useAuthStore` from `@/features/auth/stores/auth.store` |
| **Why problematic** | Violates the dependency rule: global infrastructure (`lib/`) must not depend on domain features (`features/`). Creates an implicit circular dependency since features depend on `lib/`. |
| **Risk Level** | **HIGH** |
| **Refactor** | Use dependency injection: `SocketManager.init({ getToken, refreshToken })` called from `providers.tsx`, passing auth functions as parameters. `lib/socket.ts` becomes feature-agnostic. |

### 3.5 CHAT FEATURE HAS NO API LAYER AND NO STORE

| Attribute | Value |
|-----------|-------|
| **File** | `src/features/chat/` — no `api/` directory, no `stores/` directory |
| **Why problematic** | The chat feature (largest in the app) relies entirely on global `src/services/message.service.ts` and imports from `@/features/conversation/api/`. All state lives in `useState` inside the 738-line god component, making it untestable and unshareable. |
| **Risk Level** | **HIGH** |
| **Refactor** | Create `features/chat/api/chat.api.ts` (move message service logic here), `features/chat/stores/chat.store.ts` (selectedConversation, typingUsers, sidebarState, pendingMedia). |

### 3.6 100% MOCK PAGES — profile, calls, entire admin module

| Attribute | Value |
|-----------|-------|
| **Files** | `src/pages/profile.tsx`, `src/pages/calls.tsx`, `src/pages/admin/*.tsx` (all 6 files) |
| **Why problematic** | 8 pages contain hardcoded mock data (`'John Doe'`, `value={1234}`, `'https://i.pravatar.cc/...'`), `console.log` action handlers, non-functional search inputs. These pages ship to production as non-functional UI. |
| **Risk Level** | **HIGH** |
| **Refactor** | Either implement API integration or remove and replace with explicit "Coming Soon" placeholders. Current state creates false impression of functionality. |

### 3.7 ENV VALIDATION WARNS INSTEAD OF THROWING

| Attribute | Value |
|-----------|-------|
| **File** | `src/config/env.ts` — `console.warn` for missing required env vars, then casts `undefined as string` |
| **Why problematic** | Missing `VITE_BACKEND_URL` silently produces `undefined`, causing all API calls to fail with cryptic `Network Error`. Developers waste time debugging instead of seeing a clear startup failure. |
| **Risk Level** | **MEDIUM** |
| **Refactor** | Change `console.warn` to `throw new Error(...)` in production. Allow warn-only in development with a `import.meta.env.DEV` check. |

---

## 4. Structural Violations

### 4.1 Boundary Violations — Cross-Feature Direct Imports

| Source File | Imports From | What |
|-------------|-------------|------|
| `features/chat/index.tsx` | `features/contacts` | `FriendshipSearchModal` (component) |
| `features/chat/index.tsx` | `features/conversation` | `CreateGroupModal`, `useCreateGroupStore` |
| `features/chat/index.tsx` | `features/search` | `SearchPanel` |
| `features/chat/index.tsx` | `features/auth` | `useAuthStore` (direct store path) |
| `features/chat/hooks/use-chat-messages.ts` | `features/auth` | `useAuthStore` |
| `features/chat/hooks/use-chat-conversation-realtime.ts` | `features/conversation` | `useInvalidateConversations` |
| `features/chat/components/group-info-content.tsx` | `features/conversation` | 7 imports (hooks, components, modals) |
| `features/chat/components/direct-info-content.tsx` | `features/contacts` | `useBlockUser` |
| `features/chat/components/direct-info-content.tsx` | `features/conversation` | `ConversationUI` type |
| `features/chat/components/chat-search-sidebar.tsx` | `features/search` | `useSearch`, search types |
| `features/conversation/hooks/use-conversation-list-realtime.ts` | `features/chat` | `ChatConversation` type (circular!) |
| `features/conversation/hooks/use-friend-search.ts` | `features/contacts` | `useFriendsList` |
| `features/contacts/components/friendship-search-modal.tsx` | `features/search` | `useSearch`, search types |
| `features/contacts/components/friendship-search-modal.tsx` | `features/profile` | `UserInfoView` |
| `features/search/components/SearchPanel.tsx` | `features/contacts` | `FriendRequestModal`, friendship API |
| `lib/socket.ts` | `features/auth` | `authService`, `useAuthStore` |

**Total: 22+ direct cross-feature imports, primarily from `chat` → other features.**

### 4.2 Deep Internal Imports (Bypassing Barrel Exports)

Even when features expose barrel `index.ts` files, most consumers bypass them:

```typescript
// ❌ Deep internal import (common pattern in codebase)
import { useAuthStore } from '@/features/auth/stores/auth.store';

// ✅ Should use barrel
import { useAuthStore } from '@/features/auth';
```

| Pattern | Count | Example |
|---------|-------|---------|
| `@/features/*/stores/*.store` (direct) | 8+ | `auth/stores/auth.store`, `contacts/stores/friendship.store` |
| `@/features/*/components/*` (direct) | 12+ | `conversation/components/group-info/*`, `contacts/components/friend-request-modal` |
| `@/features/*/hooks/*` (direct) | 6+ | `conversation/hooks/use-conversation-queries` |
| `@/features/*/api/*` (direct) | 4+ | `contacts/api/friendship.api`, `auth/api/auth.service` |

### 4.3 Service Misplacement

| File | Current Location | Should Be | Reason |
|------|-----------------|-----------|--------|
| `src/services/conversation.service.ts` | Global | **DELETE** | Deprecated re-export shim, all code is in `features/conversation/api/` |
| `src/services/message.service.ts` | Global | `features/chat/api/message.api.ts` | 100% messaging domain — only used by chat feature |
| `src/services/media.service.ts` | Global | Keep global OR `features/media/api/` | Cross-feature (chat media + profile avatar) — acceptable as shared |

### 4.4 Hook Misplacement

| File | Current Location | Should Be | Reason |
|------|-----------------|-----------|--------|
| `src/hooks/use-message-socket.ts` (516 lines) | Global | `features/chat/hooks/` | 100% messaging domain: delivery, receipts, typing, cache updates |
| `src/hooks/use-conversation-list-realtime.ts` | Global | **DELETE** | Deprecated shim → `features/conversation/hooks/` |
| `src/hooks/use-conversation-socket.ts` | Global | **DELETE** | Deprecated shim → `features/conversation/hooks/` |

### 4.5 Type Duplication

| Type | Location 1 | Location 2 | Action |
|------|-----------|-----------|--------|
| `AuthState` | `features/auth/types/index.ts` | `features/auth/stores/auth.store.ts` | Remove from types/ (store is source of truth) |
| `CursorPaginatedResponse<T>` | `src/types/api.ts` | `features/contacts/types/index.ts` | Remove from contacts, use shared |
| `FriendshipStatus` | `src/types/api.ts` (enum) | `features/contacts/types/index.ts` (union) | Remove from contacts, use shared enum |
| `ContactSearchResult` | `features/conversation/types/index.ts` | `features/search/types/index.ts` | Consolidate — near-identical interfaces |
| `ChatConversation` | `features/chat/types/index.ts` | = alias of `ConversationUI` from conversation | Delete alias, use `ConversationUI` directly |
| `User` re-export | `features/auth/types/`, `contacts/types/`, `profile/types/` | All re-export from `src/types/` | Remove passthrough re-exports |
| `formatTimestamp` | `features/conversation/api/conversation.api.ts` | `features/conversation/hooks/use-conversation-list-realtime.ts` | Deduplicate — extract to `src/utils/date.ts` |
| `MessageContextResponse` | Inline in `src/services/message.service.ts` | Should be in `src/types/api.ts` | Move to shared types |

---

## 5. Code Smells & Anti-Patterns

### 5.1 Hardcoding

| Category | Examples | Files |
|----------|---------|-------|
| **Route strings** | `'/chat'`, `'/login'`, `'/register'` | `pages/login.tsx`, `pages/register.tsx`, `auth/hooks/use-auth.ts`, `pages/not-found.tsx`, `pages/permission-denied.tsx`, `lib/axios.ts` |
| **localStorage keys** | `'accessToken'`, `'expiresIn'`, `'auth-store'`, `'theme'`, `'language'`, `'chat_selectedId'` | `auth/api/auth.service.ts`, `auth/stores/auth.store.ts`, `stores/use-app-store.ts`, `hooks/use-socket.ts`, `chat/index.tsx` |
| **API path prefix** | `'/api/v1/'` repeated ~30 times | `constants/api-endpoints.ts` |
| **Vietnamese strings** | `'Vừa xong'`, `'Đang tải...'`, `'Bạn'`, `'Hôm qua'`, `'[Hình ảnh]'`, etc. | 15+ files across features, utils, hooks |
| **Mock data** | `'John Doe'`, `'https://i.pravatar.cc/...'`, `value={1234}` | `pages/profile.tsx`, `pages/calls.tsx`, `pages/admin/*.tsx`, `conversation/api/conversation.api.ts` |
| **Magic numbers** | `10000` (timeout), `500` (fetch delay), `150` (unlock delay), `MAX_SELECTED_MEMBERS = 250` | `lib/axios.ts`, `hooks/use-infinite-scroll.ts`, `conversation/stores/create-group.store.ts` |
| **Color values** | `'#1976d2'`, `'#cf1322'` | `app/providers.tsx`, `pages/admin/dashboard.tsx` |
| **Socket event names** | Local `FRIENDSHIP_SOCKET_EVENTS` object | `contacts/hooks/use-friendship-socket.ts` (should use `@/constants/socket-events`) |

### 5.2 God Components / God Hooks

| File | Lines | Type | Responsibilities |
|------|-------|------|------------------|
| `features/chat/index.tsx` | 738 | Component | Conversation list, message send/retry, typing, media, mark-as-seen, URL sync, sidebar state, optimistic updates (~15 concerns) |
| `features/chat/hooks/use-chat-messages.ts` | 576 | Hook | Message query, scroll management, load-older/newer, jump-to-message, new-message-count, highlighting (6 concerns) |
| `hooks/use-message-socket.ts` | 516 | Hook | 7 socket listeners + 5 cache-update helpers + 5 emitters (could be 3 files) |
| `features/chat/hooks/use-media-upload.ts` | 501 | Hook | State machine — justified but fixable stale closure |
| `features/chat/components/chat-input.tsx` | 459 | Component | File selection + preview + emoji + send + reply logic |
| `features/search/hooks/use-search.ts` | 432 | Hook | 18 store selectors + subscription + filters + actions |

### 5.3 Tight Coupling

| Coupling | Severity | Files |
|----------|----------|-------|
| Chat ↔ Conversation | **CRITICAL** | `chat/index.tsx` imports 3+ from conversation. `chat/components/group-info-content.tsx` imports 7 from conversation. `conversation/hooks/use-conversation-list-realtime.ts` imports from chat types (circular). |
| Chat ↔ Search | **HIGH** | `chat/index.tsx` renders `<SearchPanel>` directly. `chat/components/chat-search-sidebar.tsx` uses `useSearch` + 5 search types. |
| Chat ↔ Contacts | **HIGH** | `chat/index.tsx` renders `<FriendshipSearchModal>`. `chat/components/direct-info-content.tsx` uses `useBlockUser`. |
| Contacts ↔ Search | **MEDIUM** | `contacts/components/friendship-search-modal.tsx` uses `useSearch` + search types. |
| Contacts ↔ Profile | **LOW** | `contacts/components/friendship-search-modal.tsx` uses `<UserInfoView>` from profile. |
| `lib/socket.ts` → Auth feature | **HIGH** | Global infra depends on feature module (inverted dependency). |

### 5.4 Re-Render Risks

| Risk | File | Impact |
|------|------|--------|
| **Chat god component re-renders on every message** | `features/chat/index.tsx` — 9 `useState`, `conversations` array recreated every render via `.flatMap()` without `useMemo` | **HIGH** — entire chat shell (sidebar + messages + input) re-renders |
| **Unstable callback refs in ChatFeature** | `onTypingStatus`, `onNavigateToConversation` lambdas in JSX | **MEDIUM** — propagate re-renders to child components |
| **`useChatMessages` — `messagesAsc` recomputed per render** | `use-chat-messages.ts` L113 — `reverse + dedup + map` without memoization on receipt updates | **MEDIUM** — message list re-renders on every receipt acknowledgment |
| **`useSearch` with 18 store selectors** | Each `useSearchStore()` call is a separate subscription | **LOW** — Zustand shallow compare mitigates, but 18 selectors is unusual |
| **`usePrevious` triggers extra render** | `hooks/index.ts` — uses `useState + useEffect` instead of `useRef` | **LOW** — one extra render per value change |

### 5.5 Inconsistent Notification Pattern

| Approach | Files |
|----------|-------|
| `antd notification` API | `pages/login.tsx`, `pages/register.tsx`, `utils/interaction-error.ts`, `contacts/hooks/use-friendship-socket.ts` |
| `antd message` API | `pages/profile.tsx`, `pages/admin/settings.tsx` |
| `sonner Toaster` | `app/providers.tsx` (mounted but never used) |

Three different notification systems are set up. The `sonner` Toaster is even mounted globally but no code calls it.

---

## 6. Refactor Proposal (Concrete)

### 6.1 Target Folder Structure

```
src/
├── app/
│   ├── App.tsx
│   ├── main.tsx
│   └── providers.tsx
├── components/
│   ├── layout/                 # App shell layouts
│   ├── shared/                 # ErrorBoundary, LoadingSpinner, EmptyState
│   └── ui/                     # Generic UI primitives (if needed beyond Ant Design)
├── config/
│   ├── env.ts                  # Env validation (throw on missing)
│   └── routes.ts               # ← NEW: Centralized route path constants
├── constants/
│   ├── api-endpoints.ts        # Extract API_V1 prefix constant
│   ├── socket-events.ts
│   └── storage-keys.ts         # ← NEW: Centralized localStorage/sessionStorage keys
├── features/
│   ├── auth/
│   │   ├── api/auth.service.ts
│   │   ├── hooks/use-auth.ts
│   │   ├── stores/auth.store.ts
│   │   ├── types/index.ts      # Only feature-specific types (not re-exports of shared)
│   │   └── index.ts            # Named exports ONLY (no `export *`)
│   ├── chat/
│   │   ├── api/                # ← NEW
│   │   │   ├── message.api.ts  # ← Moved from src/services/message.service.ts
│   │   │   └── chat.queries.ts # ← NEW: React Query hooks for messages
│   │   ├── components/         # Existing (well-structured)
│   │   ├── hooks/
│   │   │   ├── use-chat-selection.ts     # ← NEW: extracted from index.tsx
│   │   │   ├── use-send-message.ts       # ← NEW: extracted from index.tsx
│   │   │   ├── use-mark-as-seen.ts       # ← NEW: extracted from index.tsx
│   │   │   ├── use-typing-indicator.ts   # ← NEW: extracted from index.tsx
│   │   │   ├── use-message-socket.ts     # ← Moved from src/hooks/
│   │   │   ├── use-chat-messages.ts      # Existing (refactor into sub-hooks)
│   │   │   ├── use-media-upload.ts       # Existing (minor fixes)
│   │   │   └── use-media-progress.ts     # Existing
│   │   ├── stores/
│   │   │   └── chat.store.ts   # ← NEW: selectedId, sidebarState, typingUsers
│   │   ├── types/index.ts
│   │   ├── utils/
│   │   │   ├── batch-files.ts
│   │   │   └── message-cache-helpers.ts  # ← NEW: extracted from use-message-socket
│   │   └── index.ts
│   ├── contacts/               # Existing (fix duplicate types, use shared SocketEvents)
│   ├── conversation/           # Existing (fix circular dep, deduplicate formatTimestamp)
│   ├── profile/
│   │   ├── api/                # ← NEW: profile API (update profile, upload avatar)
│   │   ├── hooks/              # ← NEW: useProfile query hook
│   │   ├── stores/             # ← NEW (if needed)
│   │   ├── components/
│   │   ├── types/
│   │   └── index.ts
│   ├── search/                 # Existing (split 433-line types file)
│   ├── call/                   # Existing (implement when ready)
│   └── notification/           # Existing (implement when ready)
├── hooks/
│   ├── index.ts                # useMobileView, useDebounce, usePrevious (fix useRef)
│   ├── use-socket.ts           # Global socket connector
│   └── use-infinite-scroll.ts  # Generic (remove 500ms delay)
│   # DELETE: use-message-socket.ts (moved to features/chat)
│   # DELETE: use-conversation-list-realtime.ts (deprecated shim)
│   # DELETE: use-conversation-socket.ts (deprecated shim)
├── lib/
│   ├── axios.ts                # Fix: use API_ENDPOINTS for skip checks, baseURL on refresh
│   ├── query-client.ts
│   ├── socket.ts               # Fix: dependency injection instead of importing features/auth
│   └── utils.ts                # Fix: add tailwind-merge to cn()
├── pages/
│   ├── chat.tsx
│   ├── contacts.tsx            # Simplify: move layout logic to feature component
│   ├── login.tsx               # Fix: use route constants, fix phone regex
│   ├── register.tsx            # Fix: cleanup setTimeout, use route constants
│   ├── profile.tsx             # Fix: connect to real API via features/profile
│   ├── calls.tsx               # Fix: connect to real API or placeholder
│   └── admin/                  # Fix: connect to real APIs
├── services/
│   ├── media.service.ts        # Keep: cross-feature (split into constants + types + service)
│   # DELETE: conversation.service.ts (deprecated shim)
│   # DELETE: message.service.ts (moved to features/chat/api)
├── stores/
│   └── use-app-store.ts        # Fix: REMOVE user/isAuthenticated duplication
├── types/
│   ├── api/                    # ← Split 704-line monolith:
│   │   ├── auth.types.ts
│   │   ├── messaging.types.ts
│   │   ├── conversation.types.ts  # ← ConversationUI lives HERE (canonical)
│   │   ├── social.types.ts
│   │   ├── media.types.ts
│   │   ├── common.types.ts     # ApiResponse, pagination wrappers
│   │   └── index.ts            # Re-exports all
│   └── index.ts
└── utils/
    ├── date.ts                 # Fix: locale-aware formatting
    ├── interaction-error.ts    # Fix: decouple from antd, accept callback
    └── validation.ts           # Fix: deduplicate with media.service validation
```

### 6.2 Service Relocation Strategy

| Current | Action | Target | Notes |
|---------|--------|--------|-------|
| `src/services/conversation.service.ts` | **Delete** | — | Deprecated re-export; 0 unique code |
| `src/services/message.service.ts` | **Move** | `features/chat/api/message.api.ts` | 100% messaging domain |
| `src/services/media.service.ts` | **Split** | `src/services/media.constants.ts` + `src/services/media.types.ts` + `src/services/media.service.ts` | Keep global; extract 80 lines of constants/types |

### 6.3 Type Normalization Strategy

1. **Split `src/types/api.ts` (704 lines)** into domain-scoped files under `src/types/api/`:
   - `auth.types.ts` — User, LoginRequest, RegisterRequest, AuthResponse, SessionInfo
   - `messaging.types.ts` — MessageType, MessageListItem, MessageReceipt, ReceiptStatus
   - `conversation.types.ts` — ConversationType, Conversation, ConversationUI, MemberRole
   - `social.types.ts` — FriendshipStatus, Friendship, Block
   - `media.types.ts` — MediaType, MediaProcessingStatus, MediaAttachment
   - `common.types.ts` — ApiResponse, ErrorResponse, CursorPaginatedResponse, PagePaginatedResponse
   - `index.ts` — barrel re-export of all

2. **Eliminate duplicate types in features:**
   - Delete `CursorPaginatedResponse` from `features/contacts/types/`
   - Delete `FriendshipStatus` union from `features/contacts/types/`
   - Delete `ChatConversation` alias from `features/chat/types/`
   - Delete `ContactSearchResult` from `features/conversation/types/` (keep search's version or unify)
   - Delete passthrough `User` re-exports from auth/contacts/profile types

3. **Move `ConversationUI`** from `features/conversation/types/conversation.ts` to `src/types/api/conversation.types.ts` — breaks circular dependency.

### 6.4 Hook Colocation Plan

| Hook | Current | Target | Reason |
|------|---------|--------|--------|
| `use-message-socket.ts` | `src/hooks/` | `features/chat/hooks/` | 100% messaging domain |
| `use-conversation-list-realtime.ts` | `src/hooks/` | **DELETE** | Deprecated shim |
| `use-conversation-socket.ts` | `src/hooks/` | **DELETE** | Deprecated shim |
| `use-chat-conversation-realtime.ts` | `features/chat/hooks/` | Import from `features/conversation` barrel | Uses conversation hooks, should use barrel import |
| `use-friend-search.ts` | `features/conversation/hooks/` | `features/contacts/hooks/` or shared | Depends entirely on contacts API |
| `useMobileView`, `useDebounce`, `usePrevious` | `src/hooks/index.ts` | **Keep** (generic) | Fix `usePrevious` to use `useRef` |
| `use-socket.ts` | `src/hooks/` | **Keep** (generic) | Global socket connection |
| `use-infinite-scroll.ts` | `src/hooks/` | **Keep** (generic) | Remove 500ms artificial delay |

---

## 7. Migration Strategy

### Phase 0: Quick Wins (1-2 days, no breaking changes)

1. **Delete dead code:**
   - `src/config/paths.ts` (entirely commented out)
   - `src/hooks/use-conversation-list-realtime.ts` (deprecated shim — verify no consumers)
   - `src/hooks/use-conversation-socket.ts` (deprecated shim — verify no consumers)
   - `src/services/conversation.service.ts` (deprecated shim — verify no consumers)

2. **Fix `cn()` utility:**
   ```typescript
   // src/lib/utils.ts
   import { clsx, type ClassValue } from 'clsx';
   import { twMerge } from 'tailwind-merge'; // already in package.json
   export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
   ```

3. **Fix `usePrevious` hook** — replace `useState + useEffect` with `useRef`.

4. **Fix env validation** — throw in production, warn in dev.

5. **Create `src/config/routes.ts`** with centralized route constants:
   ```typescript
   export const ROUTES = { HOME: '/chat', LOGIN: '/login', REGISTER: '/register', ... } as const;
   ```

6. **Create `src/constants/storage-keys.ts`:**
   ```typescript
   export const STORAGE_KEYS = { ACCESS_TOKEN: 'accessToken', EXPIRES_IN: 'expiresIn', ... } as const;
   ```

7. **Remove `user`/`isAuthenticated` from `useAppStore`.**

8. **Remove sonner `Toaster` from providers** (unused) OR migrate all notifications to sonner.

### Phase 1: Type Normalization (2-3 days)

1. Split `src/types/api.ts` into domain-scoped files under `src/types/api/`.
2. Move `ConversationUI` to `src/types/api/conversation.types.ts`.
3. Delete duplicate types from feature-level `types/` files.
4. Delete `ChatConversation` alias — find-replace all usages with `ConversationUI`.
5. Run TypeScript compiler to verify no breakage.

### Phase 2: Service & Hook Relocation (2-3 days)

1. Move `src/services/message.service.ts` → `features/chat/api/message.api.ts`.
2. Move `src/hooks/use-message-socket.ts` → `features/chat/hooks/use-message-socket.ts`.
3. Extract pure cache helpers from use-message-socket into `features/chat/utils/message-cache-helpers.ts`.
4. Update all imports. Run TypeScript + ESLint.
5. Refactor `lib/socket.ts` to use dependency injection instead of importing from `features/auth`.

### Phase 3: Chat Decomposition (5-7 days) ⚠️ Highest risk

1. Create `features/chat/stores/chat.store.ts`:
   ```typescript
   interface ChatState {
     selectedConversationId: string | null;
     sidebarMode: 'default' | 'search' | 'info';
     typingUsers: Map<string, string[]>;
     // actions...
   }
   ```

2. Extract from `chat/index.tsx`:
   - `useChatSelection()` — selectedId, URL param sync, sessionStorage
   - `useSendMessage()` — optimistic update, socket/REST send, retry
   - `useMarkAsSeen()` — seen tracking & socket emission
   - `useTypingIndicator()` — typing state management
   - `useConversationListMutations()` — prepend/update/remove from query cache

3. Reduce `chat/index.tsx` to <200 lines: pure layout shell composing sub-components.

4. Refactor `use-chat-messages.ts` (576 lines) into:
   - `useMessageQuery()` — owns `useInfiniteQuery` + dedup
   - `useScrollManager()` — isAtBottom, scrollToBottom, preserveScroll
   - `useJumpToMessage()` — context fetch + highlight + 3-case logic

5. **Testing checkpoint:** Verify all chat flows (send message, receive message, load older, jump-to-message, media upload, typing indicator, mark-as-seen).

### Phase 4: Error Handling Standardization (2-3 days)

1. Create a single `ApiError` class normalizing Axios errors:
   ```typescript
   export class ApiError extends Error {
     status: number;
     code: string;
     constructor(axiosError: AxiosError<ErrorResponse>) { ... }
   }
   ```

2. Wrap all API calls through a `handleApiError()` utility that returns `ApiError`.

3. Standardize notification strategy: antd notification 

4. Wrap ALL page-level feature components in `<ErrorBoundary>` consistently.

5. Add Suspense boundaries for React.lazy loaded routes (future).

### Phase 5: Admin Module Implementation (3-5 days)

1. Create `features/admin/` with proper api/hooks/store layer.
2. Replace all hardcoded mock data with API calls.
3. Implement functional search, pagination, and actions.

### Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Phase 3 (chat decomposition) breaks existing flows | Write integration tests BEFORE decomposition. Use a feature flag to toggle between old/new implementation. |
| Import path changes break consumers | Use VSCode's "Move Symbol" refactoring OR `sed`/find-replace with full compile check. |
| Phase 1 type changes cause cascade | Do in a single PR. Run `tsc --noEmit` before and after. |
| Removing deprecated shims breaks unknown consumers | `grep -r` for import paths before deleting. |

### Backward Compatibility Notes

- Barrel `index.ts` files should maintain the same public API during migration.
- Deprecated `conversationService` name should be kept as an alias for 1 release if any external consumer uses it.
- Route constant migration can be done gradually — add constants first, then replace hardcoded strings one file at a time.

---

## 8. Long-Term Architecture Recommendation

### 8.1 Recommended Architecture Pattern

**Feature-Sliced Design (FSD)** adapted for React SPA:

```
src/
├── app/          # App initialization, providers, global styles
├── pages/        # Route-level components (thin wrappers)
├── features/     # Self-contained business domains
│   └── {name}/
│       ├── api/         # API calls + React Query hooks
│       ├── components/  # Feature-specific UI
│       ├── hooks/       # Feature-specific hooks
│       ├── stores/      # Feature-specific Zustand stores
│       ├── types/       # Feature-specific types (not shared re-exports)
│       ├── utils/       # Feature-specific utilities
│       └── index.ts     # Public API (named exports ONLY)
├── shared/       # Cross-cutting infrastructure
│   ├── api/      # Axios instance, API error handling
│   ├── config/   # Env, route constants, storage keys
│   ├── constants/# API endpoints, socket events
│   ├── hooks/    # Generic hooks (useDebounce, useMobileView, useSocket)
│   ├── lib/      # Third-party wrappers (query-client, socket manager)
│   ├── types/    # Shared domain types (API contracts)
│   ├── ui/       # Generic UI components (if beyond Ant Design)
│   └── utils/    # Date formatting, validation, error handling
└── components/   # Layout components, error boundaries
```

### 8.2 Dependency Rule

```
pages → features → shared
  ↓        ↓         ↓
  └────────┴─────────┘
  
Features NEVER import from other features directly.
Cross-feature communication via:
  1. Shared types (from shared/types)
  2. Event bus / Zustand pub-sub
  3. Render props / children composition (parent page composes features)
```

### 8.3 Naming Conventions

| Entity | Convention | Example |
|--------|-----------|---------|
| Feature directories | `kebab-case` | `features/chat/`, `features/user-profile/` |
| Components | `PascalCase` file + export | `ChatInput.tsx` → `export function ChatInput()` |
| Hooks | `use-` prefix, `kebab-case` file | `use-send-message.ts` → `export function useSendMessage()` |
| Stores | `{domain}.store.ts` | `chat.store.ts` → `export const useChatStore = create(...)` |
| API files | `{domain}.api.ts` | `message.api.ts` → `export const messageApi = { ... }` |
| Types | `{domain}.types.ts` | `messaging.types.ts` |
| Utils | `{domain}.util.ts` or `{concern}.ts` | `date.util.ts`, `validation.ts` |
| Constants | `SCREAMING_SNAKE_CASE` values | `API_ENDPOINTS`, `SOCKET_EVENTS`, `STORAGE_KEYS` |
| Route constants | `SCREAMING_SNAKE_CASE` | `ROUTES.HOME`, `ROUTES.LOGIN` |

### 8.4 Folder Conventions

1. **Every feature MUST have:**
   - `index.ts` with **named exports only** (no `export *`)
   - At minimum: `types/` (even if empty, to signal intent)

2. **Feature `index.ts` is the ONLY entry point.** No deep imports allowed:
   ```typescript
   // ✅ Allowed
   import { useAuth, useAuthStore } from '@/features/auth';
   
   // ❌ Forbidden
   import { useAuthStore } from '@/features/auth/stores/auth.store';
   ```

3. **ESLint rule to enforce boundaries:**
   ```javascript
   // eslint-plugin-boundaries or eslint-plugin-import/no-restricted-paths
   rules: {
     'import/no-restricted-paths': ['error', {
       zones: [
         { target: './src/features/*', from: './src/features/!(${self})/**' },
         { target: './src/lib', from: './src/features/**' },
         { target: './src/shared', from: './src/features/**' },
       ]
     }]
   }
   ```

4. **Max file lengths:**
   - Components: 300 lines (split if larger)
   - Hooks: 200 lines (split if larger)
   - Stores: 200 lines
   - Type files: 300 lines (split by sub-domain)

### 8.5 Scaling Guidelines

1. **Adding a new feature (e.g., `features/stories/`):**
   - Scaffold: `api/`, `components/`, `hooks/`, `stores/`, `types/`, `index.ts`
   - Types: feature-specific only. Shared types go to `src/types/`
   - No imports from other features. If you need data from contacts, lift the dependency to the page level via props/composition.

2. **Cross-feature communication patterns:**
   - **Shared state:** Use Zustand store in `shared/` that multiple features subscribe to
   - **Events:** Use a lightweight event emitter (`mitt`) for fire-and-forget notifications
   - **Composition:** Parent page renders features side-by-side, passing props:
     ```tsx
     <ChatPage>
       <ConversationSidebar onSelect={setConversationId} />
       <MessagePanel conversationId={conversationId} />
       <SearchPanel onNavigate={setConversationId} />
     </ChatPage>
     ```

3. **When to create a new feature vs. extend existing:**
   - New feature: different domain entity, different API namespace, different team could own it
   - Extend existing: same entity, same API namespace, tightly coupled UI

4. **Performance at scale:**
   - Use `React.lazy()` + `Suspense` for route-level code splitting per feature
   - Use `@tanstack/react-virtual` (already installed) for long lists
   - Prefer Zustand selectors with `useShallow()` to minimize re-renders
   - Avoid barrel file `export *` — use named exports for tree-shaking

---

## Appendix A: Dependency Inventory

| Package | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `react` | 19.2.0 | UI framework | React 19 — can use `use()` instead of `useContext()` |
| `antd` | 6.2.3 | Component library | Good — but also have `sonner` (unused) |
| `@tanstack/react-query` | 5.51.23 | Server state | Good — but also have manual `useInfiniteScroll` hook |
| `zustand` | 5.0.11 | Client state | Good — but underutilized (chat has no store) |
| `react-router-dom` | 7.0.0 | Routing | Good |
| `socket.io-client` | 4.8.3 | Realtime | Good |
| `axios` | 1.7.7 | HTTP client | Good |
| `zod` | 4.3.6 | Validation | Good — but underutilized (only `utils/validation.ts`) |
| `date-fns` | 4.1.0 | Date formatting | Good — but also have `dayjs` installed (unused?) |
| `dayjs` | 1.11.12 | Date formatting | **Redundant** — `date-fns` is the active library |
| `tailwind-merge` | 3.4.0 | Class merging | **Installed but NOT used** — `cn()` only uses `clsx` |
| `react-hook-form` | 7.52.1 | Form management | **Installed but NOT used** — all forms use Ant Design's `Form` |
| `sonner` | 2.0.7 | Toast notifications | **Installed, mounted, but NOT called** |
| `framer-motion` | 12.33.0 | Animation | Check if actually used |
| `peerjs` | 1.5.4 | WebRTC | For call feature (not yet implemented) |
| `@paralleldrive/cuid2` | 3.3.0 | ID generation | Used in message optimistic updates |

**Unused packages to audit:** `dayjs`, `react-hook-form`, `sonner` (mounted but uncalled), `tailwind-merge` (installed but not imported).

## Appendix B: Files to Delete

| File | Reason |
|------|--------|
| `src/config/paths.ts` | Entirely commented out — dead code |
| `src/hooks/use-conversation-list-realtime.ts` | Deprecated re-export shim (5 lines) |
| `src/hooks/use-conversation-socket.ts` | Deprecated re-export shim (4 lines) |
| `src/services/conversation.service.ts` | Deprecated re-export shim (13 lines) |

## Appendix C: Bug Inventory

| Bug | File | Severity |
|-----|------|----------|
| Phone validation regex in register: `[3\|5\|7\|8\|9]` includes `\|` as literal char | `pages/register.tsx` | LOW |
| Phone validation rule in login: `pattern` commented out but `message` still present | `pages/login.tsx` | LOW |
| `isTokenExpired()` always returns `false` (stub) | `features/auth/api/auth.service.ts` | MEDIUM |
| Axios refresh call uses bare URL without `baseURL` | `lib/axios.ts` | HIGH |
| `setTimeout(() => navigate('/login'), 1500)` — no cleanup | `pages/register.tsx` | LOW |
| Admin messages: `text.substring(0, 50) + '...'` on short text | `pages/admin/messages.tsx` | LOW |
| `retryFile` captures stale `pendingFiles` | `features/chat/hooks/use-media-upload.ts` | MEDIUM |
| Dark mode `algorithm` is `undefined` for both themes | `app/providers.tsx` | LOW |
| `conversations` array in ChatFeature recreated every render (no useMemo) | `features/chat/index.tsx` | MEDIUM |
