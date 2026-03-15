# Module: Search Engine

> **Cập nhật lần cuối:** 14/03/2026
> **Nguồn sự thật:** `backend/zalo_backend/src/modules/search_engine/`
> **Swagger:** `/api/docs` → tag `Search`

---

## 1. Tổng quan

### Chức năng chính

Search Engine là module tìm kiếm đa thực thể, gồm:

- Tìm kiếm tin nhắn theo hội thoại (full-text + filter + cursor pagination)
- Tìm kiếm global (contacts, groups, media, grouped messages)
- Tìm kiếm contact cho flow tạo nhóm (REST + WebSocket)
- Real-time search subscription qua Socket.IO
- Search analytics (trending, performance, history, suggestions, click tracking)
- Cache/invalidation theo event-driven architecture

### Use Case chính

| # | Use Case |
|---|---|
| UC-1 | User tìm tin nhắn trong 1 conversation (theo keyword + messageType + sender + date + hasMedia) |
| UC-2 | User subscribe search real-time và nhận kết quả mới khi có message phù hợp |
| UC-3 | User load-more kết quả tìm kiếm bằng cursor |
| UC-4 | User tìm contact để tạo nhóm, có áp privacy/block/friendship |
| UC-5 | User thực hiện global search (messages grouped + contacts + groups + media) |
| UC-6 | Hệ thống ghi nhận analytics khi user click kết quả |

### Phụ thuộc module khác

| Module | Vai trò |
|---|---|
| `DatabaseModule` (Prisma) | Query full-text/trigram và truy cập model SearchQuery |
| `RedisModule` / `RedisService` | Cache search results + Pub/Sub đồng bộ subscription scope đa instance |
| `AuthorizationModule` | Cấp `InteractionAuthorizationService` cho canView/canMessage |
| `BlockModule` | Cấp `IBlockChecker` cho block check có cache |
| `PrivacyModule` | Cấp `PrivacyService` để đọc privacy settings theo batch |
| `SharedModule` | `DisplayNameResolver` để resolve alias theo viewer khi emit real-time |
| `EventEmitterModule` | Lắng nghe domain events để invalidate cache và push realtime updates |

---

## 2. API / Socket Events

> Xem chi tiết Request/Response DTO tại Swagger UI: `/api/docs`.

### 2.1 REST Endpoints

| Method | Endpoint | Mô tả | Auth |
|---|---|---|---|
| `GET` | `/search/contacts` | Tìm contact (phục vụ create-group modal), có privacy/block/friendship context | `JwtAuthGuard` (global + class guard) |
| `GET` | `/search/analytics/trending` | Top keyword trong 7 ngày | `JwtAuthGuard` |
| `GET` | `/search/analytics/performance` | Metrics hiệu năng search | `JwtAuthGuard` |
| `GET` | `/search/analytics/history` | Search history của current user | `JwtAuthGuard` |
| `GET` | `/search/analytics/suggestions` | Gợi ý keyword theo history của current user | `JwtAuthGuard` |
| `POST` | `/search/analytics/track-click` | Ghi nhận click vào kết quả search | `JwtAuthGuard` |

### 2.2 WebSocket Events (namespace `/socket.io`)

Client → Server:

| Event | Payload chính | Mô tả |
|---|---|---|
| `search:subscribe` | `keyword`, `searchType`, `conversationId`, `filters` | Subscribe query và nhận initial results |
| `search:unsubscribe` | none | Huỷ subscription hiện tại trên socket |
| `search:updateQuery` | `keyword`, `conversationId` | Đổi keyword (client nên debounce) |
| `search:loadMore` | `searchType`, `keyword`, `cursor`, `limit`, filters | Lấy trang kế tiếp theo cursor |

Server → Client:

| Event | Payload chính | Mô tả |
|---|---|---|
| `search:results` | `SearchResultsPayload` | Initial results sau khi subscribe/updateQuery |
| `search:moreResults` | `SearchMoreResultsPayload` | Kết quả load-more |
| `search:newMatch` | `SearchNewMatchPayload` | Message mới khớp query đang subscribe |
| `search:resultRemoved` | `messageId`, `conversationId` | Loại bỏ result khi message bị xóa |
| `search:error` | `error`, `code` | Báo lỗi runtime/validation |

---

## 3. Activity Diagram — Realtime Search End-to-End

```mermaid
---
id: 2c078df0-fa9e-48bc-a0da-477c2d06bfa0
---
flowchart TD
		A([Client emit search:subscribe]) --> B{socket có userId?}
		B -- Không --> E1[emit search:error UNAUTHORIZED]
		B -- Có --> C[RealTimeSearchService.subscribe]
		C --> D{keyword hợp lệ?}
		D -- Không --> E2[throw validation error]
		D -- Có --> F[Load allowedConversationIds]
		F --> G[Đăng ký subscription in-memory + keyword index]
		G --> H[Thực thi initial search theo searchType]

		H --> H1{GLOBAL?}
		H1 -- Có --> I1[GlobalSearchService
messages grouped + contacts + groups + media]
		H1 -- Không --> H2{CONVERSATION?}
		H2 -- Có --> I2[MessageSearchService.searchInConversation]
		H2 -- Không --> H3{CONTACT/MEDIA?}
		H3 -- CONTACT --> I3[ContactSearchService.searchContacts]
		H3 -- MEDIA --> I4[MediaSearchService.searchMedia]

		I1 --> J[emit search:results]
		I2 --> J
		I3 --> J
		I4 --> J

		J --> K[[Trong runtime có event message.sent]]
		K --> L[SearchEventListener.handleMessageSent]
		L --> M{Có active subscriptions?}
		M -- Không --> N[Chỉ invalidate cache, kết thúc]
		M -- Có --> O[findMatchingSubscriptions + queueBatchNotification]
		O --> P[emit search.internal.newMatch]
		P --> Q[SearchGateway emit search:newMatch đến socket phù hợp]

		N --> Z([Done])
		Q --> Z
		E1 --> Z
		E2 --> Z
```

---

## 4. Sequence Diagram

### 4.1 `search:subscribe` (Happy path + critical errors)

```mermaid
sequenceDiagram
		actor Client
		participant SG as SearchGateway
		participant RTS as RealTimeSearchService
		participant SV as SearchValidationService
		participant SVC as Search Services
		participant Repo as Search Repositories
		participant DB as PostgreSQL
		participant Redis

		Client->>SG: search:subscribe {keyword, searchType, ...}
		SG->>SG: đọc client.userId

		alt Chưa authenticate
				SG-->>Client: search:error {code: UNAUTHORIZED}
		else Auth OK
				SG->>RTS: subscribe(userId, socketId, payload)
				RTS->>SV: validateKeyword(payload.keyword)

				alt keyword rỗng/too short/too long
						SV-->>RTS: throw validation error
						RTS-->>SG: throw
						SG-->>Client: search:error {code: SERVER_ERROR}
				else hợp lệ
						RTS->>SV: getActiveConversationIds(userId)
						SV->>DB: conversation_members WHERE status='ACTIVE'
						DB-->>SV: conversationIds[]
						SV-->>RTS: conversationIds[]

						RTS->>RTS: add subscription + keyword index + cleanup timer
						RTS->>SVC: executeInitialSearch(searchType)
						SVC->>Repo: raw query (FTS/trigram/cursor)
						Repo->>DB: SQL (tsquery / ILIKE / pg_trgm)
						DB-->>Repo: rows
						Repo-->>SVC: mapped DTOs

						SVC->>Redis: get/set cache (nếu enabled)
						SVC-->>RTS: initialResults
						RTS-->>SG: SearchResultsPayload
						SG-->>Client: search:results
				end
		end
```

### 4.2 Real-time update khi có `message.sent`

```mermaid
sequenceDiagram
		participant MessageModule
		participant SEL as SearchEventListener
		participant Cache as SearchCacheService
		participant RTS as RealTimeSearchService
		participant DB as PostgreSQL
		participant Evt as EventEmitter2
		participant SG as SearchGateway
		actor Client

		MessageModule->>SEL: emit message.sent {messageId, conversationId}
		SEL->>Cache: invalidateConversationCache(conversationId)
		SEL->>RTS: hasActiveSubscriptions()

		alt Không có subscriber
				SEL-->>SEL: skip DB fetch (early exit)
		else Có subscriber
				SEL->>DB: find message + sender + conversation + mediaAttachments
				DB-->>SEL: message payload
				SEL->>RTS: findMatchingSubscriptions(message)
				RTS-->>SEL: matches[]

				alt Có match
						SEL->>RTS: queueBatchNotification(message, matches)
						RTS->>Evt: emit search.internal.newMatch
						Evt->>SG: handleInternalNewMatch
						SG-->>Client: search:newMatch
				else Không match
						SEL-->>SEL: no-op
				end
		end
```

### 4.3 `search:loadMore` (cursor pagination)

```mermaid
sequenceDiagram
		actor Client
		participant SG as SearchGateway
		participant RTS as RealTimeSearchService
		participant SVC as Typed Search Service
		participant Repo as Repository
		participant DB as PostgreSQL

		Client->>SG: search:loadMore {searchType, keyword, cursor, limit}
		SG->>RTS: handleLoadMore(userId, payload)
		RTS->>SVC: dispatch theo searchType
		SVC->>Repo: query limit+1 với cursor
		Repo->>DB: SQL ORDER BY + cursor condition
		DB-->>Repo: rows
		Repo-->>SVC: data + nextCursor + hasNextPage
		SVC-->>RTS: paginated result
		RTS-->>SG: SearchMoreResultsPayload
		SG-->>Client: search:moreResults
```

---

## 5. Dữ liệu & Cơ chế kỹ thuật quan trọng

### 5.1 Liên kết với schema Prisma

- `messages.searchVector` (`tsvector`) được dùng cho full-text query (`phraseto_tsquery('simple', unaccent(keyword))`).
- `messages.directReceipts`, `deliveredCount`, `seenCount` không trực tiếp phục vụ ranking hiện tại, nhưng có thể mở rộng tín hiệu ranking trong tương lai.
- `search_queries` là bảng analytics chính:
	- `keyword`, `searchType`, `resultCount`, `executionTimeMs`
	- `clickedResultId`, `clickedAt` cho click-tracking.
- `conversation_members` quyết định search scope theo membership `ACTIVE`.
- `user_contacts` cung cấp alias resolution theo viewer (`COALESCE(alias, phoneBookName, displayName)`).

### 5.2 Chiến lược tìm kiếm

- Message search:
	- Full-text bằng `search_vector @@ phraseto_tsquery(...)`
	- Fallback substring: `ILIKE` accent-insensitive với `unaccent`.
	- Highlight snippet dùng placeholder `[[HL]]...[[/HL]]` để tránh double-marking ở frontend.
- Contact search:
	- Ưu tiên alias/phone-book/friendship theo `relevance_score`.
	- Tách nhánh phone search và name search, chặn kết quả khi có block.
- Group search:
	- Scope vào group user là member `ACTIVE`.
	- Matching: `ILIKE` + trigram `%`.
- Media search:
	- Search theo `media_attachments.original_name`, scope conversation membership.

### 5.3 Caching & invalidation

- `SearchCacheService` dùng Redis (`setex`, `deletePattern`) với TTL theo category.
- Invalidation chạy theo event listener:
	- `message.sent`, `message.deleted`, `message.updated|edited`
	- `conversation.member.added|left`, `conversation.updated`
	- `user.blocked|unblocked`, `friendship.accepted|unfriended`
	- `privacy.updated`, `media.uploaded|deleted`, `user.profile.updated`, `contact.alias.updated`
- `RealTimeSearchService` có Redis Pub/Sub channel `search:events` để sync scope update đa instance.

### 5.4 Guardrails hiệu năng

- Subscription limit: max 100/user, max 1000/instance.
- Auto-cleanup subscription sau 5 phút inactivity.
- Batch notify cửa sổ 100ms để giảm socket fanout.
- Early-exit khi không có active subscribers để tránh DB query không cần thiết.

---

## 6. Vấn đề phát hiện khi phân tích code
---

## 7. Gợi ý kiểm thử tối thiểu cho module này

- REST:
	- `GET /search/contacts`: check privacy, block, pending request, existingConversationId.
	- `GET /search/analytics/*`: xác thực phân quyền đúng role.
- Socket:
	- subscribe/unsubscribe/updateQuery/loadMore với keyword hợp lệ và invalid.
	- real-time new-match khi gửi message text, group name match, media filename match.
	- resultRemoved khi soft-delete message.
- Cache:
	- verify invalidation theo `message.sent`, `contact.alias.updated`, `privacy.updated`.
	- verify cache key có tách bạch filter/cursor.
