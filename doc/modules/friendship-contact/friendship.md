# Module: Friendship

> **Cập nhật lần cuối:** 13/03/2026
> **Nguồn sự thật:** `backend/zalo_backend/src/modules/friendship/` (16 files)
> **Swagger:** `/api/docs` (tags: `friend-requests`, `Social - Friendships`)

---

## 1. Tổng quan

### 1.1 Phạm vi sở hữu

Friendship module quản lý **vòng đời quan hệ bạn bè** giữa 2 users:

- **Friend request lifecycle**: gửi → chấp nhận / từ chối / hủy
- **Friendship management**: unfriend (soft delete), kiểm tra status, mutual friends
- **Rate limiting**: giới hạn số lượng friend request theo ngày/tuần (Redis counters)
- **Cooldown enforcement**: không gửi lại request đã bị từ chối trong 24h
- **Distributed locking**: ngăn race condition trên các state mutations đồng thời
- **Cache invalidation**: event-driven invalidation qua 14+ Redis keys
- **Block cascade**: lắng nghe `user.blocked` / `user.unblocked` → soft delete / restore friendship
- **Expiry**: request tự hết hạn sau 90 ngày (field `expiresAt`)

**Không** sở hữu:
- Socket notifications → `SocketModule` (`FriendshipNotificationListener`)
- Push notifications → `NotificationsModule`
- Search index → `SearchEngineModule`
- Privacy settings → `PrivacyModule`
- Conversation creation khi accept → `ConversationModule`

### 1.2 Use cases

| Mã | Use case | Endpoint / Flow |
|---|---|---|
| UC-FR-01 | Gửi friend request | `POST /friend-requests` |
| UC-FR-02 | Chấp nhận friend request | `PUT /friend-requests/:requestId/accept` |
| UC-FR-03 | Từ chối friend request | `PUT /friend-requests/:requestId/decline` |
| UC-FR-04 | Hủy friend request (requester) | `DELETE /friend-requests/:requestId` |
| UC-FR-05 | Unfriend | `DELETE /friendships/:targetUserId` |
| UC-FR-06 | Xem danh sách bạn bè | `GET /friendships` (cursor pagination + search) |
| UC-FR-07 | Xem friend request đã nhận | `GET /friend-requests/received` |
| UC-FR-08 | Xem friend request đã gửi | `GET /friend-requests/sent` |
| UC-FR-09 | Đếm số bạn bè | `GET /friendships/count` |
| UC-FR-10 | Xem mutual friends | `GET /friendships/mutual/:targetUserId` |
| UC-FR-11 | Check friendship status | `GET /friendships/check/:targetUserId` |
| UC-FR-12 | Block cascade | `user.blocked` event → soft delete friendship |
| UC-FR-13 | Unblock restore | `user.unblocked` event → restore friendship |

---

## 2. Phụ thuộc module

### 2.1 Module imports

| Module | Vai trò |
|---|---|
| `RedisModule` | Caching, rate limit counters, distributed lock |
| `EventsModule` | `EventPublisher` — domain event persistence + emit |
| `IdempotencyModule` | `IdempotencyService` — duplicate event prevention |
| `BlockModule` | `IBlockChecker` — kiểm tra block status trước mutations |
| `PrivacyModule` | Imported nhưng **chưa tích hợp** (TODO R12) |
| `SharedModule` | `DisplayNameResolver` — resolve alias per viewer |

### 2.2 Providers

| Provider | Vai trò | Export? |
|---|---|---|
| `FriendshipService` | Core business logic: request lifecycle, queries, cache | ✅ |
| `DistributedLockService` | Redis-based lock cho state mutations | ❌ |
| `FriendRequestSentListener` | Cache invalidation khi gửi request | ❌ |
| `FriendshipAcceptedListener` | Cache invalidation khi accept | ❌ |
| `FriendRequestDeclinedListener` | Cache invalidation khi decline | ❌ |
| `FriendRequestRemovedListener` | Cache invalidation khi cancel | ❌ |
| `UnfriendedListener` | Cache + call history invalidation khi unfriend | ❌ |
| `FriendshipBlockListener` | Soft delete/restore friendship khi block/unblock | ❌ |

### 2.3 Domain Events phát ra

| Event | Trigger | Payload chính |
|---|---|---|
| `friendship.request.sent` | `sendFriendRequest` | `requestId`, `fromUserId`, `toUserId` |
| `friendship.accepted` | `acceptRequest` | `friendshipId`, `acceptedBy`, `requesterId`, `user1Id`, `user2Id` |
| `friendship.request.declined` | `declineRequest` | `requestId`, `fromUserId`, `toUserId` |
| `friendship.request.cancelled` | `cancelRequest` | `friendshipId`, `cancelledBy`, `targetUserId` |
| `friendship.unfriended` | `removeFriendship` | `friendshipId`, `initiatedBy`, `user1Id`, `user2Id` |

### 2.4 Cross-module event consumers

| Event | Module / Listener | Hành vi |
|---|---|---|
| `friendship.request.sent` | Socket / `FriendshipNotificationListener` | Real-time notify recipient |
| `friendship.request.sent` | Notifications / `FriendshipNotificationListener` | FCM push notification |
| `friendship.accepted` | Socket / `FriendshipNotificationListener` | Real-time notify cả 2 |
| `friendship.accepted` | Notifications / `FriendshipNotificationListener` | FCM push notification |
| `friendship.accepted` | Conversation / `FriendshipConversationListener` | **Tạo DIRECT conversation** |
| `friendship.accepted` | Search / `SearchEventListener` | Invalidate search cache |
| `friendship.accepted` | Privacy / `PrivacyFriendshipListener` | Update permission cache |
| `friendship.request.cancelled` | Socket / `FriendshipNotificationListener` | Real-time notify target |
| `friendship.request.declined` | Socket / `FriendshipNotificationListener` | Real-time notify requester |
| `friendship.unfriended` | Socket / `FriendshipNotificationListener` | Real-time notify cả 2 |
| `friendship.unfriended` | Search / `SearchEventListener` | Invalidate search cache |
| `friendship.unfriended` | Privacy / `PrivacyFriendshipListener` | Invalidate permission cache |
| *Tất cả 5 events* | Common / `DomainEventPersistenceListener` | Persist vào `DomainEvent` table |

### 2.5 Events mà Friendship lắng nghe (từ module khác)

| Event | Listener | Hành vi |
|---|---|---|
| `user.blocked` | `FriendshipBlockListener` | Soft delete friendship (`deletedAt`) |
| `user.unblocked` | `FriendshipBlockListener` | Restore friendship (`deletedAt = null`) |

---

## 3. API REST

> Xem chi tiết Request/Response tại Swagger UI: `/api/docs`

### FriendRequestController (`/friend-requests`)

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/friend-requests` | Gửi friend request (`targetUserId` in body) |
| GET | `/friend-requests/received` | Lấy danh sách lời mời đã nhận (PENDING) |
| GET | `/friend-requests/sent` | Lấy danh sách lời mời đã gửi (PENDING) |
| PUT | `/friend-requests/:requestId/accept` | Chấp nhận |
| PUT | `/friend-requests/:requestId/decline` | Từ chối |
| DELETE | `/friend-requests/:requestId` | Hủy lời mời (chỉ requester) |

### FriendshipsController (`/friendships`)

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/friendships` | Danh sách bạn bè (cursor pagination + search by name/phone) |
| GET | `/friendships/count` | Đếm số bạn bè |
| GET | `/friendships/mutual/:targetUserId` | Xem bạn chung |
| GET | `/friendships/check/:targetUserId` | Check status (`PENDING`/`ACCEPTED`/`DECLINED`/`null`) |
| DELETE | `/friendships/:targetUserId` | Unfriend |

### 3.1 Rule nghiệp vụ

1. **Self-action**: Không thể gửi request / unfriend chính mình → `SelfActionException` (400)
2. **Block check**: Mọi state mutation đều check block 2 chiều → `BlockedException` (403)
3. **Recipient-only**: Chỉ recipient mới accept/decline → `InvalidFriendshipStateException` (400)
4. **Requester-only**: Chỉ requester mới cancel request
5. **Status check**: Accept/decline yêu cầu status = `PENDING` | Unfriend yêu cầu `ACCEPTED`
6. **Rate limit**: Daily (20) + Weekly (100) friend requests (configurable, có toggle disable)
7. **Decline cooldown**: 24h sau khi bị từ chối mới gửi lại
8. **Expiry**: Request tự hết hạn sau 90 ngày (field `expiresAt`) — queries filter `expiresAt` để ẩn expired requests
9. **Idempotency**: Accept/decline/unfriend đều check trạng thái hiện tại — nếu đã ở target state thì return silently
10. **Canonical ordering**: `user1Id < user2Id` (sorted) — đảm bảo 1 friendship record duy nhất

---

## 4. Kiến trúc kỹ thuật

### 4.1 Distributed Lock pattern

Tất cả state mutations dùng `DistributedLockService.withLock()`:

```
Lock key: friendship:lock:{sortedId1}:{sortedId2} (hoặc :friendshipId:userId)
TTL: 30s | Max retries: 10
Flow: acquire lock → validate state → update DB → invalidate cache → emit event → release lock
```

### 4.2 Cache strategy

| Cache key pattern | TTL | Dùng cho |
|---|---|---|
| `socialFriendship(u1, u2)` | 60s | `areFriends()` check |
| `socialFriendCount(userId, status)` | 300s | `getFriendCount()` |
| `friendshipStatus(u1, u2)` | — | Block cascade invalidation |
| `friendshipFriendsList(userId)` | — | Invalidation only |
| `friendshipPendingRequests(userId)` | — | Invalidation only |
| `friendshipSentRequests(userId)` | — | Invalidation only |
| `socialPermission(type, u1, u2)` | 300s | Permission cache (message/call/profile) |
| `rateLimitFriendRequest(userId, period)` | 24h/7d | Rate limit counters |

### 4.3 Soft delete pattern

Friendship dùng soft delete (`deletedAt` field):
- **Unfriend**: set `deletedAt` + `lastActionBy`, status giữ `ACCEPTED`
- **Block cascade**: set `deletedAt`, giữ nguyên status
- **Re-send request**: nếu tìm thấy soft-deleted record → restore + reset fields
- **Unblock**: restore `deletedAt = null`, giữ nguyên status cũ

### 4.4 Config (social.config.ts)

| Config | Default | Env var |
|---|---|---|
| Rate limit daily | 20 | `SOCIAL_FRIEND_REQUEST_DAILY_LIMIT` |
| Rate limit weekly | 100 | `SOCIAL_FRIEND_REQUEST_WEEKLY_LIMIT` |
| Rate limit disabled | `true` | `SOCIAL_FRIEND_REQUEST_LIMIT_DISABLED` |
| Decline cooldown | 24h | hardcoded |
| Request expiry | 90 days | hardcoded |
| Friendship cache TTL | 60s | hardcoded |
| Friend list cache TTL | 300s | hardcoded |

---

## 5. Diagrams

### 5.1 Activity Diagram — Send Friend Request (UC-FR-01)

```mermaid
flowchart TD
    A[Client: POST /friend-requests] --> B{requesterId == targetUserId?}
    B -->|Yes| B_ERR[❌ 400 SelfActionException]
    B -->|No| C{Block check 2 chiều}
    C -->|Blocked| C_ERR[❌ 403 BlockedException]
    C -->|OK| D{Rate limit check}
    D -->|Daily >= 20| D_ERR[❌ 429 FriendRequestLimitException]
    D -->|Weekly >= 100| D_ERR
    D -->|OK| E{Decline cooldown check}
    E -->|Within 24h| E_ERR[❌ 403 DeclineCooldownException]
    E -->|OK| F[Acquire Distributed Lock]
    F --> G{Existing friendship?}

    G -->|ACCEPTED + not deleted| G_DUP1[❌ 409 Already friends]
    G -->|PENDING + not deleted| G_DUP2[❌ 409 Already pending]
    G -->|Soft-deleted / DECLINED| H[Restore: UPDATE → PENDING]
    G -->|Not found| I[CREATE new friendship]

    H --> J[Increment rate limit counters]
    I --> J
    J --> K["EventPublisher.publish(FriendRequestSentEvent)"]
    K --> L[Invalidate pending cache]
    L --> M[Release Lock → Return FriendshipResponseDto]
```

### 5.2 Sequence Diagram — Accept Friend Request (UC-FR-02)

```mermaid
sequenceDiagram
    participant C as Client
    participant CTR as FriendRequestController
    participant SVC as FriendshipService
    participant LOCK as DistributedLockService
    participant DB as PostgreSQL
    participant BLOCK as BlockChecker
    participant RD as Redis
    participant EP as EventPublisher

    C->>CTR: PUT /friend-requests/:requestId/accept
    CTR->>SVC: acceptRequest(userId, requestId)
    SVC->>LOCK: withLock(friendshipLock)
    LOCK->>RD: SETNX lock key (30s TTL)

    SVC->>DB: findUnique(friendshipId)
    alt Not found
        SVC-->>C: ❌ 404 FriendshipNotFoundException
    end

    alt Already ACCEPTED (idempotent)
        SVC-->>C: ✅ Return existing (skip)
    end

    alt Status != PENDING
        SVC-->>C: ❌ 400 InvalidFriendshipStateException
    end

    SVC->>SVC: Check isRecipient (not requester)
    alt Is requester
        SVC-->>C: ❌ 400 Only recipient can accept
    end

    SVC->>BLOCK: isBlocked(user1Id, user2Id)
    alt Blocked
        SVC-->>C: ❌ 403 BlockedException
    end

    SVC->>DB: UPDATE status=ACCEPTED, acceptedAt=now

    SVC->>RD: Invalidate 14+ cache keys (both users)

    SVC->>EP: publish(FriendRequestAcceptedEvent)

    Note over EP: Cross-module listeners fire:
    Note over EP: → ConversationModule: create DIRECT conversation
    Note over EP: → SocketModule: real-time notify both users
    Note over EP: → NotificationsModule: FCM push
    Note over EP: → SearchModule: invalidate cache
    Note over EP: → PrivacyModule: update permissions

    LOCK->>RD: DEL lock key
    SVC-->>C: ✅ FriendshipResponseDto
```

### 5.3 Activity Diagram — Unfriend (UC-FR-05)

```mermaid
flowchart TD
    A[Client: DELETE /friendships/:targetUserId] --> B{userId == targetUserId?}
    B -->|Yes| B_ERR[❌ 400 SelfActionException]
    B -->|No| C[findFriendship by sorted IDs]
    C --> D{Found?}
    D -->|No| D_ERR[❌ 404 FriendshipNotFoundException]
    D -->|Yes| E[Acquire Distributed Lock]
    E --> F[Re-check friendship status after lock]
    F --> G{Already soft-deleted?}
    G -->|Yes| G_SKIP[Return silently - idempotent]
    G -->|No| H{Status == ACCEPTED?}
    H -->|No| H_ERR[❌ 400 Only unfriend ACCEPTED friendship]
    H -->|Yes| I[Soft delete: set deletedAt + lastActionBy]
    I --> J[Invalidate caches for both users]
    J --> K["EventPublisher.publish(UnfriendedEvent)"]
    K --> L[Release Lock]
```

### 5.4 Sequence Diagram — Block Cascade (UC-FR-12/13)

```mermaid
sequenceDiagram
    participant BLK as BlockModule
    participant FBL as FriendshipBlockListener
    participant IDS as IdempotencyService
    participant DB as PostgreSQL
    participant RD as Redis

    Note over BLK: User A blocks User B

    BLK->>FBL: event: user.blocked {blockerId, blockedId, eventId}

    FBL->>IDS: isProcessed(eventId, handlerId)
    alt Already processed
        FBL-->>FBL: Skip (idempotent)
    end

    FBL->>FBL: Sort IDs: [user1Id, user2Id]
    FBL->>DB: findFirst(user1Id, user2Id, deletedAt=null)

    alt No active friendship
        FBL->>FBL: Log skip
    else Active friendship found
        FBL->>DB: updateMany SET deletedAt=now()
    end

    FBL->>RD: DEL 6 cache keys

    FBL->>IDS: recordProcessed(eventId, USER_BLOCKED)

    Note over BLK: User A unblocks User B

    BLK->>FBL: event: user.unblocked {blockerId, blockedId, eventId}

    FBL->>IDS: isProcessed(eventId, handlerId)
    FBL->>DB: updateMany SET deletedAt=null WHERE deletedAt IS NOT NULL
    FBL->>RD: DEL 5 cache keys
    FBL->>IDS: recordProcessed(eventId, USER_UNBLOCKED)
```

### 5.5 Sequence Diagram — Get Friends List with Search (UC-FR-06)

```mermaid
sequenceDiagram
    participant C as Client
    participant CTR as FriendshipsController
    participant SVC as FriendshipService
    participant DB as PostgreSQL

    C->>CTR: GET /friendships?search=Tuan&limit=20&cursor=xxx
    CTR->>SVC: getFriendsList(userId, query)

    SVC->>SVC: Build search condition (displayName/phone/aliasName/phoneBookName)
    SVC->>DB: findMany(where, include user1+user2, take limit+1, orderBy createdAt DESC)

    SVC->>DB: findMany UserContact (batch resolve aliases for friend IDs)

    SVC->>SVC: CursorPaginationHelper.buildResult (check hasNextPage via limit+1)

    SVC-->>C: { data: FriendWithUserDto[], meta: { cursor, hasNextPage } }
```

---

## 6. Lịch sử fix bugs

> Tất cả bugs dưới đây đã được fix vào 13/03/2026.

| Bug | Severity | Mô tả | Fix |
|---|---|---|---|
| FR-R1 | 🟡 MEDIUM | `cancelRequest` không dùng distributed lock → race condition với accept đồng thời | Wrap trong `withLock()` + thêm idempotency check |
| FR-R3 | ⚪ LOW | `getMutualFriends` dùng naive intersection: 2 full list queries + JS `filter` | Thay bằng single SQL query với `INNER JOIN` (subquery per user) |
| FR-R5 | ⚪ LOW | `getReceivedRequests` / `getSentRequests` không filter `expiresAt` → request hết hạn vẫn hiển thị | Thêm `OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]` vào Prisma where |

---

## 7. Ghi chú kỹ thuật

### 7.1 Listener architecture

Tất cả listeners (trừ `FriendshipBlockListener`) extend `IdempotentListener`:
- `withIdempotency(eventId, handler, listenerName)` → check `ProcessedEvent` table → execute → record
- `FriendshipBlockListener` dùng `IdempotencyService` trực tiếp (cùng pattern, khác implementation)

### 7.2 Cache invalidation scope

Mỗi friendship mutation invalidates **14+ Redis keys** qua `FriendshipCacheHelper.invalidateForUsers()`:
- Friendship status (2 directions)
- Friends list (2 users)
- Pending requests (2 users)
- Sent requests (2 users)
- Permission cache: message/call/profile × 2 directions = 6 keys
- Friend count patterns (wildcard delete)

### 7.3 Rate limit toggle

`SOCIAL_FRIEND_REQUEST_LIMIT_DISABLED` mặc định `true` (disabled) — development convenience. Cần set `false` trên production để enable rate limiting.

> ⚠️ Logic inverted: `disabled: process.env.SOCIAL_FRIEND_REQUEST_LIMIT_DISABLED !== 'false'` — mặc định disabled trừ khi env = `"false"` chính xác.
