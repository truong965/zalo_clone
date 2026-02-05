# Kế hoạch triển khai: Block, Privacy, Friendship Modules

**Version:** 1.0  
**Date:** 2026-02-04  
**Scope:** Refactor toàn diện 3 module theo Modular Monolith + Event-Driven Architecture

---

## 1. Tổng quan

### 1.1 Mục tiêu
- Thay thế hoàn toàn 3 module Block, Privacy, Friendship (deprecated)
- Đảm bảo loose coupling qua Event Bus
- Tuân thủ Clean Architecture / Hexagonal Architecture
- Thống nhất Redis keys, Event contracts, Authorization

### 1.2 Quy tắc đã xác nhận
| Quy tắc | Giá trị |
|---------|---------|
| Redis | Chỉ dùng `src/shared/redis/redis-key-builder.ts` |
| RedisCacheFacade | Loại bỏ, dùng RedisKeyBuilder |
| Event naming | `friendship.*` (friendship.accepted, friendship.unfriended) |
| Event contracts | BaseEvent + module-specific, primitives only, tránh circular dependency |
| Block check | Read-through via BlockRepository (không dùng Prisma trực tiếp) |
| Guard/Facade | AuthorizationModule với `canInteract(requesterId, targetId, action)` |
| Friend request check | Chỉ block (mọi người gửi được) |
| Unblock → Friendship | Restore soft-deleted Friendship |
| Cancel request | Soft delete (deletedAt), event FRIEND_REQUEST_CANCELLED |
| UserUnblockedEvent | Lấy blockId trước khi xóa, truyền vào event |
| Audit | DomainEventPersistenceListener ghi vào bảng DomainEvent |
| Cron 90 ngày | Phase sau |

---

## 2. Thứ tự thực hiện (Execution Order)

```
Phase 0: Foundation ✅
    ↓
Phase 1: Shared Infrastructure ✅
    ↓
Phase 2: AuthorizationModule ✅
    ↓
Phase 3: BlockModule ✅
    ↓
Phase 4: PrivacyModule ✅
    ↓
Phase 5: FriendshipModule ✅
    ↓
Phase 6: Domain Event Persistence & Integration ✅
```

---

## 3. Chi tiết từng Phase

### Phase 0: Foundation ✅ DONE
**Mục đích:** Chuẩn bị schema, loại bỏ deprecated

| Task | Mô tả | File/Location | Status |
|------|-------|---------------|--------|
| 0.1 | Thêm FRIEND_REQUEST_CANCELLED vào EventType enum | `prisma/schema.prisma` | ✅ |
| 0.2 | Migration + prisma generate | `prisma/migrations/20260204000000_*` | ✅ |
| 0.3 | Deprecate redis-keys.constant.ts | `src/common/constants/redis-keys.constant.ts` | ✅ |
| 0.4 | Deprecate RedisCacheFacade | `src/shared/facades/redis-cache.facade.ts` | ✅ |
| 0.5 | Xóa BlockSocialListener (dead code) | `src/modules/block/listeners/` | ✅ |

---

### Phase 1: Shared Infrastructure

#### 1.1 Event Contracts ✅ DONE
**Location:** `src/shared/events/contracts/`

| File | Nội dung | Status |
|------|----------|--------|
| `base-event.interface.ts` | `BaseEvent { eventId, timestamp, version, source, aggregateId, correlationId? }` | ✅ |
| `block-events.contract.ts` | `UserBlockedEventPayload`, `UserUnblockedEventPayload` | ✅ |
| `friendship-events.contract.ts` | `FriendshipRequestSentPayload`, `FriendshipAcceptedPayload`, `FriendshipRejectedPayload`, `FriendshipCancelledPayload`, `UnfriendedPayload` | ✅ |
| `privacy-events.contract.ts` | `PrivacySettingsUpdatedPayload` | ✅ |
| `index.ts` | Re-exports (export * from contracts in shared/events/index.ts) | ✅ |

**Quy tắc:** Không import Service/Entity từ bất kỳ module nào.

#### 1.2 Redis Migration ✅ DONE
**Location:** `src/shared/redis/redis-key-builder.ts`

| Task | Mô tả | Status |
|------|-------|--------|
| 1.2.1 | Đảm bảo RedisKeyBuilder có đủ keys cho Block, Privacy, Friendship | ✅ |
| 1.2.2 | Thêm `socialPrivacy(userId)`, `socialPermissionPatternsForUser()` | ✅ |
| 1.2.3 | Thêm `socialFriendCountPattern(userId)` | ✅ |
| 1.2.4 | Migrate Privacy, Friendship modules to shared RedisKeyBuilder | ✅ |
| 1.2.5 | Remove RedisCacheFacade, create FriendshipCacheHelper | ✅ |

#### 1.3 Block Repository ✅ DONE
**Location:** `src/modules/block/`

| File | Nội dung | Status |
|------|----------|--------|
| `repositories/block.repository.interface.ts` | `IBlockRepository { exists(), findByPair() }` | ✅ |
| `repositories/prisma-block.repository.ts` | Implementation dùng Prisma | ✅ |
| `repositories/index.ts` | Exports | ✅ |
| BlockModule | Provider + export BLOCK_REPOSITORY | ✅ |

**Mục đích:** AuthorizationModule và BlockService dùng interface, không truy cập Prisma trực tiếp từ guard.

---

### Phase 2: AuthorizationModule ✅ DONE

**Location:** `src/modules/authorization/` (module mới)

#### 2.1 Cấu trúc
```
authorization/
├── authorization.module.ts
├── services/
│   ├── interaction-authorization.service.ts  # canInteract()
│   └── block-checker.service.ts              # Read-through: Redis → DB via BlockRepository
├── guards/
│   └── interaction.guard.ts                  # Guard cho controller
└── dto/
    └── permission-action.enum.ts             # message | call | profile | friend_request
```

#### 2.2 Logic canInteract
```
canInteract(requesterId, targetId, action):
  if requesterId === targetId → true

  1. Check Block (blockCheckerService: Redis read-through via BlockRepository)
     if blocked → false

  2. Switch action:
     - friend_request → true (chỉ cần pass block)
     - message, call, profile:
        - Lấy PrivacySettings của targetId
        - Nếu EVERYONE → true
        - Nếu CONTACTS → check Friendship (areFriends via FriendshipRepository/Query)
        - return result
```

#### 2.3 Dependencies
- BlockModule (BlockRepository)
- PrivacyModule (PrivacySettingsRepository hoặc PrivacyService - read-only)
- FriendshipModule (FriendshipQueryService với areFriends)

**Lưu ý:** Tránh circular dependency. FriendshipModule không import AuthorizationModule cho validation nội bộ; Friendship dùng BlockChecker trực tiếp (từ BlockModule). Authorization chỉ dùng cho các action message/call/profile (Messaging, Call dùng sau).

Cho friend_request: FriendshipService inject IBlockChecker (từ BlockModule), không cần full Authorization.

---

### Phase 3: BlockModule ✅ DONE

**Location:** `src/modules/block/` (refactor toàn bộ)

#### 3.1 Cấu trúc mới
| Task | Status |
|------|--------|
| block-cache.listener.ts (đổi tên từ block-event.handler) | ✅ |
| block-social.listener - đã xóa (Phase 0) | ✅ |
| cache-invalidation.listener - giữ (lắng cache.invalidate) | ✅ |

```
block/
├── block.module.ts
├── block.controller.ts
├── block.service.ts
├── config/block.config.ts
├── dto/block.dto.ts
├── events/ (block.events.ts, versioned-events.ts, index.ts)
├── repositories/ (block.repository.interface.ts, prisma-block.repository.ts)
├── listeners/
│   ├── block-cache.listener.ts   # Cache invalidation ✅
│   └── cache-invalidation.listener.ts  # Global cache.invalidate
├── services/
│   ├── block-authorization.helper.ts
│   ├── block-checker.interface.ts
│   └── block-checker.service.ts
```

#### 3.2 BlockService - Thay đổi chính
| Thay đổi | Chi tiết | Status |
|----------|----------|--------|
| Unblock | Lấy block record TRƯỚC khi delete, truyền blockId vào UserUnblockedEvent | ✅ |
| Idempotency | Giữ nguyên (P2002 handling) | ✅ |
| Cache | Dùng RedisKeyBuilder, listener invalidate | ✅ |
| BlockRepository | Service dùng BlockRepository cho read (findByPair), Prisma cho write | ✅ |

#### 3.3 Events
- `user.blocked` → UserBlockedEvent(blockerId, blockedId, blockId, reason?) ✅
- `user.unblocked` → UserUnblockedEvent(blockerId, blockedId, blockId) ✅

#### 3.4 BlockRepository - Export
- IBlockRepository, PrismaBlockRepository ✅
- BlockCheckerService (BlockModule) dùng Repository với read-through cache ✅

---

### Phase 4: PrivacyModule ✅ DONE

**Location:** `src/modules/privacy/` (refactor toàn bộ)

#### 4.1 Cấu trúc
| File | Status |
|------|--------|
| privacy-cache.listener.ts (đổi tên từ privacy-event.handler) | ✅ |
| privacy-block.listener.ts | ✅ |
| privacy-friendship.listener.ts | ✅ |

```
privacy/
├── privacy.module.ts
├── privacy.controller.ts
├── services/privacy.service.ts
├── dto/privacy.dto.ts
├── events/versioned-privacy-events.ts
├── listeners/
│   ├── privacy-cache.listener.ts      # Lắng privacy.updated ✅
│   ├── privacy-block.listener.ts      # user.blocked, user.unblocked ✅
│   └── privacy-friendship.listener.ts # friendship.accepted, friendship.unfriended ✅
```

#### 4.2 Thay đổi chính
| Thay đổi | Chi tiết | Status |
|----------|----------|--------|
| Redis | Chỉ dùng RedisKeyBuilder từ shared | ✅ |
| Event names | PrivacyFriendshipListener lắng `friendship.accepted`, `friendship.unfriended` | ✅ |
| Payload | Dùng contract từ shared (user1Id, user2Id) | ✅ |
| recordProcessed | PrivacyBlockListener gọi idempotency.recordProcessed | ✅ |
| checkIfFriends | CONTACTS = Friendship (Prisma, deletedAt null) | ✅ |

#### 4.3 PrivacyFriendshipListener - Event mapping
| Friendship emit | Listener OnEvent | Status |
|-----------------|------------------|--------|
| friendship.accepted | friendship.accepted | ✅ |
| friendship.unfriended | friendship.unfriended | ✅ |

---

### Phase 5: FriendshipModule ✅ DONE

**Location:** `src/modules/friendship/` (refactor toàn bộ)

#### 5.1 Cấu trúc
| File | Status |
|------|--------|
| friendship-block.listener.ts | ✅ soft delete + restore |
| friend-request-removed.listener.ts | ✅ lắng friendship.request.cancelled |
| friendship-event.handler.ts | ✅ Đã xóa (dead code) |

#### 5.2 Thay đổi chính
| Thay đổi | Chi tiết | Status |
|----------|----------|--------|
| cancelRequest | Soft delete (update deletedAt) | ✅ |
| Unblock restore | handleUserUnblocked: update deletedAt=null | ✅ |
| Block check | IBlockChecker từ BlockModule | ✅ |
| Redis | RedisKeyBuilder (FriendshipCacheHelper) | ✅ |
| Event names | friendship.request.cancelled | ✅ |
| FriendshipBlockListener | handleUserBlocked: soft delete; handleUserUnblocked: restore | ✅ |
| recordProcessed | handleUserBlocked, handleUserUnblocked | ✅ |
| sendFriendRequest | findFriendshipIncludingSoftDeleted cho restore sau unblock | ✅ |

#### 5.3 FriendshipBlockListener - Restore logic ✅
```typescript
// handleUserUnblocked
const [user1Id, user2Id] = [blockerId, blockedId].sort();
await prisma.friendship.updateMany({
  where: { user1Id, user2Id, deletedAt: { not: null } },
  data: { deletedAt: null }
});
```

---

### Phase 6: Domain Event Persistence ✅ DONE

**Location:** `src/common/events/` (DomainEventPersistenceListener, EventPersistenceModule)

#### 6.1 DomainEventPersistenceListener
| Task | Chi tiết | Status |
|------|----------|--------|
| Event mapping | Map EventType từ các event được emit | ✅ |
| Events persist | USER_BLOCKED, USER_UNBLOCKED, FRIEND_REQUEST_SENT, FRIEND_REQUEST_ACCEPTED, FRIEND_REQUEST_REJECTED, FRIEND_REQUEST_CANCELLED, UNFRIENDED, PRIVACY_SETTINGS_UPDATED | ✅ |
| Idempotency | Dùng eventId làm unique, upsert với update: {} | ✅ |
| Handler | @OnEvent cho từng event name, persist vào domain_events | ✅ |

#### 6.2 Triển khai
- DomainEventPersistenceListener lắng trực tiếp: user.blocked, user.unblocked, friendship.request.sent, friendship.accepted, friendship.request.declined, friendship.request.cancelled, friendship.unfriended, privacy.updated
- EventPersistenceModule import DatabaseModule, provide listener
- AppModule import EventPersistenceModule

---

## 4. Event Contract Chi tiết

### 4.1 BaseEvent
```typescript
interface BaseEvent {
  eventId: string;
  timestamp: Date;
  version: number;
  source: string;
  aggregateId: string;
  correlationId?: string;
}
```

### 4.2 Block Events
```typescript
interface UserBlockedEventPayload extends BaseEvent {
  eventType: 'USER_BLOCKED';
  blockerId: string;
  blockedId: string;
  blockId: string;
  reason?: string;
}

interface UserUnblockedEventPayload extends BaseEvent {
  eventType: 'USER_UNBLOCKED';
  blockerId: string;
  blockedId: string;
  blockId: string;
}
```

### 4.3 Friendship Events
```typescript
interface FriendshipRequestSentPayload extends BaseEvent {
  eventType: 'FRIEND_REQUEST_SENT';
  requestId: string;
  fromUserId: string;
  toUserId: string;
}

interface FriendshipAcceptedPayload extends BaseEvent {
  eventType: 'FRIEND_REQUEST_ACCEPTED';
  friendshipId: string;
  acceptedBy: string;
  requesterId: string;
  user1Id: string;
  user2Id: string;
}

interface FriendshipRejectedPayload extends BaseEvent {
  eventType: 'FRIEND_REQUEST_REJECTED';
  requestId: string;
  fromUserId: string;
  toUserId: string;
}

interface FriendshipCancelledPayload extends BaseEvent {
  eventType: 'FRIEND_REQUEST_CANCELLED';
  friendshipId: string;
  cancelledBy: string;
  targetUserId: string;
}

interface UnfriendedPayload extends BaseEvent {
  eventType: 'UNFRIENDED';
  friendshipId: string;
  initiatedBy: string;
  user1Id: string;
  user2Id: string;
}
```

### 4.4 Privacy Events
```typescript
interface PrivacySettingsUpdatedPayload extends BaseEvent {
  eventType: 'PRIVACY_SETTINGS_UPDATED';
  userId: string;
  settings: Record<string, unknown>;
}
```

---

## 5. Redis Key Reference (redis-key-builder.ts)

| Key | Method | Format |
|-----|--------|--------|
| Block status | socialBlock(user1, user2) | SOCIAL:BLOCK:{id1}:{id2} |
| Friendship | socialFriendship(user1, user2) | SOCIAL:FRIENDSHIP:{id1}:{id2} |
| Friend count | socialFriendCount(userId, status?) | SOCIAL:FRIEND_COUNT:{userId}:{status} |
| Permission | socialPermission(type, u1, u2) | SOCIAL:PERMISSION:{type}:{id1}:{id2} |
| Privacy | socialPrivacy(userId) | (thêm nếu chưa có) SOCIAL:PRIVACY:{userId} |
| Friendship status | friendshipStatus(u1, u2) | FRIENDSHIP:STATUS:{id1}:{id2} |
| Friends list | friendshipFriendsList(userId) | FRIENDSHIP:FRIENDS:{userId} |
| Pending requests | friendshipPendingRequests(userId) | FRIENDSHIP:PENDING_REQUESTS:{userId} |

---

## 6. Schema Update (Đã thực hiện)

```prisma
// Thêm vào EventType enum
FRIEND_REQUEST_CANCELLED // Requester withdraws request
```

---

## 7. Migration Checklist

### 7.1 Các file cần xóa/deprecate
- [x] `src/common/constants/redis-keys.constant.ts` - Deprecate (2026-02-04)
- [x] `src/shared/facades/redis-cache.facade.ts` - Deprecate (2026-02-04)
- [x] `src/modules/block/listeners/block-social.listener.ts` - Xóa (dead code)

### 7.2 Các file cần tạo mới
- [x] `src/shared/events/contracts/*` (Phase 1.1 done)
- [x] `src/modules/authorization/*` (Phase 2 done)
- [x] `src/modules/block/repositories/*` (Phase 1.3 done)
- [x] `src/common/events/domain-event-persistence.listener.ts` (Phase 6) ✅

### 7.3 Các file cần refactor
- [x] `src/modules/block/*` - Phase 3 done
- [x] `src/modules/privacy/*` - Phase 4 done
- [x] `src/modules/friendship/*` - Phase 5 done (soft delete, restore, friendship.request.cancelled)
- [ ] `src/modules/friendship/*` - Phase 5
- [x] `src/shared/redis/redis-key-builder.ts` - Phase 1.2 done
- [x] `src/app.module.ts` - AuthorizationModule imported (Phase 2)

---

## 8. Testing Strategy

- Unit test: Service logic, Repository
- Integration test: Event flow (block → friendship soft delete → unblock → restore)
- E2E: API endpoints với guard

---

## 9. Rủi ro & Mitigation

| Rủi ro | Mitigation |
|--------|------------|
| Circular dependency | Interfaces trong shared, implementations trong modules; Friendship dùng BlockChecker, không dùng full Authorization |
| Cache inconsistency | Event-driven invalidation; read-through on miss |
| Event ordering | Block luôn ưu tiên; Kafka partition key (phase sau) |

---

*Kế hoạch này có thể được điều chỉnh trong quá trình triển khai.*
