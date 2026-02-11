# Search Engine — Phân Tích & Đề Xuất Giải Pháp

> **Ngày tạo:** 2026-02-11
> **Phạm vi:** `src/modules/search_engine/**`
> **Schema:** `prisma/schema.prisma` (User, UserContact, Friendship, Block, Message, MediaAttachment, Conversation, ConversationMember, PrivacySettings)

---

## Mục Lục

1. [Yêu Cầu 1: Security — Contact/User Search](#1-yêu-cầu-1-security--contactuser-search)
2. [Yêu Cầu 2: Minimum Keyword Length](#2-yêu-cầu-2-minimum-keyword-length)
3. [Yêu Cầu 3: Limit & Hiệu Năng](#3-yêu-cầu-3-limit--hiệu-năng)
4. [Yêu Cầu 4: Pagination Chi Tiết](#4-yêu-cầu-4-pagination-chi-tiết)
5. [Yêu Cầu 5: Media Attachment Grouped by Conversation](#5-yêu-cầu-5-media-attachment-grouped-by-conversation)
6. [Phân Tích Bổ Sung](#6-phân-tích-bổ-sung)
7. [Tổng Kết Ưu Tiên](#7-tổng-kết-ưu-tiên)

---

## 1. Yêu Cầu 1: Security — Contact/User Search

### Yêu cầu

- Ưu tiên tìm kiếm: **Contacts → Friends → Người lạ**
- Block/Blocked → **không trả kết quả**
- Search theo **name**: chỉ áp dụng cho **friends** và **contacts**, KHÔNG áp dụng cho người lạ
- Ưu tiên **alias name** (từ `UserContact`) trước, sau đó mới tới **displayName** (từ `User`)
- Search theo **số điện thoại**: chỉ khi nhập đủ **10 số** (chuẩn VN: `0xxxxxxxxx`) hoặc **+84 + 9 số** → match trên `phoneNumberNormalized`

### Đánh giá hiện tại

| Tiêu chí | Trạng thái | Chi tiết |
|---|---|---|
| Block filter | ✅ **Đã thực hiện tốt** | `contact-search.repository.ts:105-109` — `NOT EXISTS (SELECT 1 FROM blocks ...)` bidirectional check trong SQL. Service layer cũng filter thêm qua `getBatchPrivacyContexts()` |
| Ưu tiên Contacts → Friends → Người lạ | ✅ **Đã thực hiện** | `relevance_score` CASE: alias=1, friend=2, request=3, none=4. `ORDER BY relevance_score ASC` |
| Alias name ưu tiên | ✅ **Đã thực hiện** | `COALESCE(uc.alias_name, u.display_name) as display_name_final` + keyword matching trên `COALESCE(uc.alias_name, u.display_name)` |
| Name search chỉ cho friends/contacts | ✅ **Đã thực hiện** | Branch B: `(f.status = 'ACCEPTED' OR uc.alias_name IS NOT NULL)` — chỉ match name khi là friend hoặc có alias (contact) |
| Phone search 10 số | ⚠️ **Thực hiện một phần** | Branch A kiểm tra `length(regexp_replace(...)) = 10` nhưng **chưa hỗ trợ format +84** |

### Vấn đề cần fix

#### 1.1 Phone search chưa hỗ trợ `+84xxxxxxxxx`

**Hiện tại** (`contact-search.repository.ts:117-124`):
```sql
-- Branch A: Chỉ check 10 digits
length(regexp_replace($2::text, '[^0-9]', '', 'g')) = 10
AND regexp_replace($2::text, '[^0-9]', '', 'g') ~ '^\d{10}$'
AND (
  u.phone_number = regexp_replace($2::text, '[^0-9]', '', 'g')
  OR u.phone_number_normalized = regexp_replace($2::text, '[^0-9]', '', 'g')
)
```

**Vấn đề:**
- Khi user nhập `+84901234567` → `regexp_replace` strip `+` → `84901234567` = **11 digits** → Branch A **không match** (vì check `= 10`)
- Khi user nhập `0901234567` → 10 digits → match ✅ nhưng chỉ so sánh raw digits, không normalize `+84` prefix

**Giải pháp đề xuất:**

Branch A cần xử lý 2 format:
1. **10 digits** bắt đầu bằng `0`: `0901234567` → match trực tiếp trên `phone_number` hoặc `phone_number_normalized`
2. **`+84` + 9 digits**: `+84901234567` → normalize bỏ `+84` thêm `0` → `0901234567` → match

Logic SQL mới:
```
-- Branch A: Phone search
(
  -- Case 1: Exactly 10 digits starting with 0
  (
    length(regexp_replace($2::text, '[^0-9]', '', 'g')) = 10
    AND regexp_replace($2::text, '[^0-9]', '', 'g') ~ '^0\d{9}$'
    AND (
      u.phone_number = regexp_replace($2::text, '[^0-9]', '', 'g')
      OR u.phone_number_normalized = regexp_replace($2::text, '[^0-9]', '', 'g')
    )
  )
  -- Case 2: +84 prefix + 9 digits (total 11 digits after stripping +)
  OR (
    $2::text ~ '^\+84\d{9}$'
    AND (
      u.phone_number_normalized = $2::text
      OR u.phone_number = '0' || substring($2::text from 4)
    )
  )
)
```

#### 1.2 Name search cho "người lạ" có contact nhưng không phải friend

**Hiện tại:** Branch B check `f.status = 'ACCEPTED' OR uc.alias_name IS NOT NULL`.

**Vấn đề nhỏ:** Nếu user A lưu contact user B (có alias) nhưng B không phải friend → B vẫn được tìm thấy qua alias ✅. Tuy nhiên, nếu A lưu contact B **không có alias** (chỉ có `UserContact` record nhưng `aliasName = NULL`) → B sẽ **không** được tìm thấy qua name search.

**Giải pháp:** Thay `uc.alias_name IS NOT NULL` bằng `uc.id IS NOT NULL` (tức là chỉ cần có record trong `user_contacts`, không cần có alias):
```sql
(f.status = 'ACCEPTED' OR uc.id IS NOT NULL)
```

#### 1.3 Người lạ vẫn xuất hiện trong kết quả (relevance_score = 4)

**Hiện tại:** Người lạ (không phải friend, không phải contact) **vẫn có thể xuất hiện** nếu match Branch A (phone search). Đây là hành vi đúng theo yêu cầu.

Tuy nhiên, cần xác nhận: **Người lạ KHÔNG BAO GIỜ xuất hiện qua name search** — hiện tại Branch B đã đảm bảo điều này ✅.

---

## 2. Yêu Cầu 2: Minimum Keyword Length

### Yêu cầu

- Chỉ khi có **3 ký tự trở lên** mới bắt đầu search
- `"a"` hoặc `"ab"` → không search

### Đánh giá hiện tại

| Vị trí | Trạng thái | Chi tiết |
|---|---|---|
| Frontend (`use-search.ts`) | ✅ **Đã thực hiện** | `MIN_KEYWORD_LENGTH = 2` — hiện tại là **2 ký tự**, cần đổi thành **3** |
| Backend `validateKeyword()` | ❌ **Chưa thực hiện** | `search-validation.service.ts:208-218` chỉ check empty và max length, **không check min length** |
| Backend Gateway | ❌ **Chưa thực hiện** | `search.gateway.ts` gọi `subscribe()` → `validateKeyword()` nhưng không check min length |

### Giải pháp đề xuất

**Frontend:**
- `use-search.ts:30`: Đổi `MIN_KEYWORD_LENGTH = 2` → `MIN_KEYWORD_LENGTH = 3`

**Backend (defense in depth):**
- `search-validation.service.ts` — `validateKeyword()`:
  ```typescript
  validateKeyword(keyword: string, minLength = 3, maxLength = 255): boolean {
    const trimmed = keyword.trim();
    if (!trimmed || trimmed.length < minLength) {
      throw new Error(`Search keyword must be at least ${minLength} characters`);
    }
    if (trimmed.length > maxLength) {
      throw new Error(`Search keyword exceeds ${maxLength} characters`);
    }
    return true;
  }
  ```

**Ngoại lệ cho phone search:**
- Phone search cần **10 ký tự** (hoặc 12 cho `+84...`), nên min=3 không ảnh hưởng
- Tuy nhiên, cần đảm bảo `validateKeyword()` chạy **trước** Branch A/B logic trong SQL, để reject sớm

---

## 3. Yêu Cầu 3: Limit & Hiệu Năng

### Yêu cầu

- Số lượng kết quả trả về **không giới hạn** nhưng cần cơ chế tối ưu hiệu năng
- `limit=20` hiện tại quá thấp

### Đánh giá hiện tại

| Search Type | Default Limit | Max Limit | Pagination | Vấn đề |
|---|---|---|---|---|
| **CONVERSATION message** | 50 | 100 | ✅ Cursor | OK, có pagination |
| **GLOBAL message (grouped)** | 10 | 30 | ❌ Không | `normalizeLimit(limit, 30)` — chỉ trả tối đa 30 conversations |
| **GLOBAL message (flat)** | 20 | 50 | ❌ `hasNextPage: false` | Hardcoded không có pagination |
| **Contact search** | 50 | 100 | ❌ `hasNextPage: false` | Không pagination |
| **Group search** | 20 | 100 | ❌ Không | Không pagination |
| **Media search** | 30 | 100 | ❌ Không | Không pagination |
| **WebSocket initial** | 20 | 20 | ❌ Hardcoded | `real-time-search.service.ts:563,583,604,634` — tất cả hardcode `limit: 20` |

### Vấn đề chính

1. **WebSocket initial search luôn trả 20 kết quả** — bất kể search type. Đây là bottleneck chính.
2. **Global search grouped** max 30 conversations — có thể thiếu nếu user có nhiều conversations match.
3. **Contact search** không có pagination — nếu user có 500 contacts match, chỉ trả 50.

### Giải pháp đề xuất

**Chiến lược "Initial Load + Load More":**

1. **Initial load (WebSocket):** Trả về batch đầu tiên với limit hợp lý:
   - CONVERSATION messages: **50** (có cursor pagination sẵn)
   - GLOBAL grouped: **50** conversations
   - Contacts: **100**
   - Groups: **50**
   - Media: **50**

2. **Load more (WebSocket hoặc REST):** Thêm event `search:loadMore` hoặc REST endpoint:
   - Client gửi `{ searchType, cursor, limit }` → server trả batch tiếp theo
   - Sử dụng cursor pagination cho tất cả search types

3. **Config-driven limits:**
   ```typescript
   // search.config.ts
   pagination: {
     initialLoad: {
       conversation: 50,
       globalGrouped: 50,
       contacts: 100,
       groups: 50,
       media: 50,
     },
     loadMore: {
       default: 50,
       max: 200,
     },
   }
   ```

4. **Performance safeguards:**
   - **Query timeout** (đã có: 5s per query) ✅
   - **Statement timeout** trong PostgreSQL: `SET statement_timeout = '5s'`
   - **Result cap** tuyệt đối: 1000 kết quả tổng cộng per search session
   - **Progressive loading**: Trả kết quả theo batch, không load tất cả cùng lúc

---

## 4. Yêu Cầu 4: Pagination Chi Tiết

### Yêu cầu

- Không giới hạn tổng số kết quả nhưng cần **pagination** khi user muốn xem chi tiết

### Đánh giá hiện tại

| Search Type | Cursor Pagination | Vấn đề |
|---|---|---|
| CONVERSATION message | ✅ Có | `searchInConversation()` dùng `PaginationUtil.trimAndGetNextCursor()` |
| GLOBAL message | ❌ Không | `searchGlobal()` trả `hasNextPage: false` |
| GLOBAL grouped | ❌ Không | `searchGlobalGroupedByConversation()` không có cursor |
| Contact | ❌ Không | `searchContacts()` trả `hasNextPage: false` |
| Group | ❌ Không | `searchGroups()` trả flat array |
| Media | ❌ Không | `searchMedia()` trả flat array |

### Giải pháp đề xuất

**Thêm cursor pagination cho tất cả search types:**

#### 4.1 Contact Search Pagination

Thêm cursor dựa trên `(relevance_score, sort_name, id)`:
```sql
-- Cursor condition (sau page đầu tiên):
AND (
  relevance_score > $CURSOR_SCORE
  OR (relevance_score = $CURSOR_SCORE AND sort_name > $CURSOR_NAME)
  OR (relevance_score = $CURSOR_SCORE AND sort_name = $CURSOR_NAME AND u.id > $CURSOR_ID)
)
```

#### 4.2 Global Grouped Pagination

Thêm cursor dựa trên `(match_count DESC, latest_created_at DESC, conversation_id)`:
- Page 1: Top 50 conversations by match count
- Page 2+: Cursor = `{ matchCount, latestCreatedAt, conversationId }` của item cuối

#### 4.3 Group Search Pagination

Thêm cursor dựa trên `(prefix_match, last_message_at DESC, id)`.

#### 4.4 Media Search Pagination

Thêm cursor dựa trên `(created_at DESC, id)` — tương tự message search.

#### 4.5 WebSocket Protocol

Thêm event mới:
```typescript
// Client → Server
SEARCH_LOAD_MORE = 'search:loadMore'

interface SearchLoadMorePayload {
  searchType: 'CONVERSATION' | 'GLOBAL' | 'CONTACT' | 'GROUP' | 'MEDIA';
  cursor: string;
  limit?: number;
}

// Server → Client
SEARCH_MORE_RESULTS = 'search:moreResults'

interface SearchMoreResultsPayload {
  searchType: string;
  data: any[];
  nextCursor?: string;
  hasNextPage: boolean;
}
```

---

## 5. Yêu Cầu 5: Media Attachment Grouped by Conversation

### Yêu cầu

- Media search phải trả kết quả **grouped by conversation** (giống message search)
- Không tách riêng từng file mà trả về theo conversation + total count

### Đánh giá hiện tại

| Tiêu chí | Trạng thái | Chi tiết |
|---|---|---|
| Media search hiện tại | ❌ **Flat list** | `media-search.repository.ts` trả về flat `MediaSearchResultDto[]` — mỗi item là 1 file riêng lẻ |
| Message search grouped | ✅ **Đã có mẫu** | `searchGlobalGroupedByConversation()` dùng CTE để group by conversation |

### Giải pháp đề xuất

**Tạo `MediaGroupedByConversationDto` tương tự `ConversationGroupedMessageDto`:**

```typescript
class MediaGroupedByConversationDto {
  conversationId: string;
  conversationName: string;
  conversationType: 'DIRECT' | 'GROUP';
  conversationAvatar?: string;
  matchCount: number;          // Tổng số media match trong conversation này
  latestMatch: {
    id: string;
    originalName: string;
    mediaType: MediaType;
    mimeType: string;
    size: number;
    thumbnailUrl?: string;
    cdnUrl?: string;
    uploadedByName: string;
    createdAt: Date;
  };
}
```

**SQL CTE approach (tương tự message grouped):**
```sql
WITH matched_media AS (
  SELECT
    ma.id, ma.original_name, ma.media_type, ma.mime_type,
    ma.size, ma.thumbnail_url, ma.cdn_url, ma.created_at,
    m.conversation_id,
    COALESCE(u.display_name, 'Unknown') AS uploaded_by_name
  FROM media_attachments ma
  JOIN messages m ON m.id = ma.message_id
  LEFT JOIN users u ON u.id = ma.uploaded_by
  WHERE ma.deleted_at IS NULL AND m.deleted_at IS NULL
    AND m.conversation_id = ANY($2::uuid[])
    AND (
      LOWER(unaccent(ma.original_name)) LIKE LOWER(unaccent(concat('%', $1::text, '%')))
      OR ma.original_name % $1::text
    )
),
conversation_stats AS (
  SELECT conversation_id, COUNT(*)::int as match_count, MAX(created_at) as latest_at
  FROM matched_media
  GROUP BY conversation_id
)
SELECT DISTINCT ON (cs.conversation_id)
  cs.conversation_id,
  -- conversation name/avatar resolution (same as message grouped)
  cs.match_count,
  mm.id, mm.original_name, mm.media_type, mm.mime_type,
  mm.size, mm.thumbnail_url, mm.cdn_url, mm.uploaded_by_name, mm.created_at
FROM conversation_stats cs
JOIN conversations c ON cs.conversation_id = c.id
JOIN matched_media mm ON mm.conversation_id = cs.conversation_id
  AND mm.created_at = cs.latest_at
ORDER BY cs.conversation_id, mm.created_at DESC
LIMIT $3::int
```

**Thay đổi cần thiết:**
1. Thêm `MediaGroupedByConversationDto` vào `search.dto.ts`
2. Thêm `searchMediaGroupedByConversation()` vào `media-search.repository.ts`
3. Thêm `searchMediaGrouped()` vào `media-search.service.ts`
4. Cập nhật `GlobalSearchResultsDto` để dùng grouped media thay vì flat
5. Cập nhật `global-search.service.ts` và `real-time-search.service.ts`

---

## 6. Phân Tích Bổ Sung

Ngoài 5 yêu cầu chính, tôi phát hiện thêm các vấn đề sau:

### 6.2 WebSocket Hardcoded Limits

**Vấn đề:** `real-time-search.service.ts` hardcode `limit: 20` cho tất cả search types trong `executeInitialSearch()`:
- Line 563: `limitPerType: 20` (GLOBAL)
- Line 583: `limit: 20` (CONTACT)
- Line 604: `20` (MEDIA)
- Line 634: `limit: 20` (CONVERSATION)

**Giải pháp:** Inject `SearchEngineConfig` và dùng config values thay vì hardcode.

### 6.3 Cache Key không bao gồm tất cả filter parameters

**Vấn đề:** `global-search.service.ts:60`:
```typescript
const cacheKey = `search:global:${userId}:${request.keyword}`;
```
Cache key **không bao gồm** `limitPerType` → nếu user search cùng keyword với limit khác nhau, sẽ nhận kết quả cached sai.

**Giải pháp:** Bao gồm tất cả parameters trong cache key:
```typescript
const cacheKey = `search:global:${userId}:${request.keyword}:${request.limit}:${request.limitPerType}`;
```

### 6.4 Contact Search: `hasNextPage` luôn `false`

**Vấn đề:** `contact-search.service.ts:103`:
```typescript
meta: {
  limit: request.limit || 50,
  hasNextPage: false, // Contact search doesn't paginate
  total: results.length,
}
```

Client không biết có thêm kết quả hay không → UX kém khi có nhiều contacts match.

### 6.5 Race Condition: Cache + Real-time Updates

**Vấn đề:** Kết quả được cache 1-5 phút, nhưng real-time search cũng gửi `newMatch` events. Nếu user search lại cùng keyword trong thời gian cache còn sống, họ nhận kết quả cũ (cached) + real-time matches mới → có thể bị duplicate hoặc thiếu.

**Giải pháp:** Invalidate cache key khi có `newMatch` event cho cùng keyword + userId. Hoặc giảm cache TTL cho search results xuống 15-30 giây.

### 6.7 `searchGlobalGroupedByConversation` — DISTINCT ON + ORDER BY conflict

**Vấn đề tiềm ẩn:** PostgreSQL `DISTINCT ON` yêu cầu `ORDER BY` phải bắt đầu bằng cùng columns trong `DISTINCT ON`. Hiện tại:
```sql
SELECT DISTINCT ON (cs.conversation_id)
...
ORDER BY cs.conversation_id, mm.rank_score DESC, mm.created_at DESC
```
Điều này đúng cú pháp nhưng kết quả **không được sort theo match_count** ở level SQL — sorting theo `matchCount` được thực hiện ở service layer (`results.sort(...)`) → OK nhưng có thể tối ưu bằng cách wrap thêm 1 outer query.

---

## 7. Tổng Kết Ưu Tiên

| # | Vấn đề | Mức độ | Effort | Ưu tiên |
|---|---|---|---|---|
| 1.1 | Phone search +84 format | 🔴 Bug | Thấp | **P0** |
| 1.2 | Contact without alias không tìm được qua name | 🟡 Thiếu sót | Thấp | **P1** |
| 2 | Min keyword length = 3 (FE + BE) | 🟢 Enhancement | Thấp | **P0** |
| 3 | Tăng initial load limits, config-driven | 🟡 UX | Trung bình | **P1** |
| 4 | Cursor pagination cho tất cả search types | 🔴 Thiếu feature | Cao | **P1** |
| 5 | Media grouped by conversation | 🔴 Thiếu feature | Trung bình | **P1** |
| 6.2 | WebSocket hardcoded limits | 🟡 Tech debt | Thấp | **P1** |
| 6.3 | Cache key thiếu parameters | 🟡 Bug tiềm ẩn | Thấp | **P1** |
| 6.4 | Contact hasNextPage luôn false | 🟡 UX | Thấp | **P1** (cùng #4) |
| 6.5 | Cache + real-time race condition | 🟡 Edge case | Trung bình | **P2** |
| 6.7 | Grouped query sort optimization | 🟢 Optimization | Thấp | **P3** |

### Thứ tự thực hiện đề xuất

**Phase 1 (Quick wins — 1-2 ngày):**
- Fix phone search +84 format (1.1)
- Fix min keyword length = 3 (2)
- Fix contact without alias (1.2)
- Fix WebSocket hardcoded limits (6.2)
- Fix cache key (6.3)

**Phase 2 (Core features — 3-5 ngày):**
- Cursor pagination cho contact, group, media search (4)
- Media grouped by conversation (5)
- Tăng initial load limits + config-driven (3)
- WebSocket `search:loadMore` event

**Phase 3 (Optimization — 2-3 ngày):**
- Cache invalidation strategy (6.5)
- Query optimization (6.7)


file đã thay đổi:
- contact-search.repository.ts
- search-validation.service.ts
- real-time-search.service.ts
- global-search.service.ts
- contact-search.service.ts
- media-search.service.ts
- group-search.service.ts
- message-search.service.ts
