# PHASE 3.5: SOCIAL GRAPH - COMPLETE PLANNING

## 🗓️ PHASE 3.5 IMPLEMENTATION PLAN (5 DAYS)

### **DAY 1: Database Foundation (8 hours)**

#### **Morning (4 hours): Schema Definition & Migration**

**Task 1.1: Define Missing Models (2h)**
- Create Prisma schema definitions for 5 models
- Add enums: CallStatus (if not exists)
- Update existing models (GroupJoinRequest, ConversationMember, User)
- Validate constraints and indexes
- Run `prisma format` and `prisma validate`

**Task 1.2: Generate Migrations (1h)**
- Run `prisma migrate dev --create-only --name add_social_graph`
- Review generated SQL migrations
- Manually adjust for:
  - Partial unique indexes (where clauses)
  - Check constraints
  - Function-based indexes if needed
- Test migration on local DB

**Task 1.3: Seed Data Preparation (1h)**
- Create seed script for:
  - Default PrivacySettings for existing users
  - Sample Friendship records (various statuses)
  - Sample Block records
  - Sample UserContact records
- Validate referential integrity

#### **Afternoon (4 hours): Database Testing & Optimization**

**Task 1.4: Migration Execution & Verification (1h)**
- Run migration on dev database
- Verify all tables created correctly
- Test constraints (try inserting invalid data)
- Verify indexes created (EXPLAIN ANALYZE queries)

**Task 1.5: Query Performance Testing (2h)**
- Write test queries for hot paths:
  - `areFriends(userId1, userId2)` - Target < 10ms
  - `isBlocked(userId1, userId2)` - Target < 5ms
  - `getFriendsList(userId, limit, offset)` - Target < 50ms
  - `getPrivacySettings(userId)` - Target < 5ms
  - `resolveDisplayName(ownerId, targetUserId)` - Target < 10ms
- Use EXPLAIN ANALYZE to verify index usage
- Adjust indexes if needed

**Task 1.6: Backup & Rollback Strategy (1h)**
- Document rollback migration
- Test rollback on staging DB
- Document data migration strategy for production
- Create DB snapshot before deployment

**Deliverables:**
- ✅ All 5 models defined in schema.prisma
- ✅ Migration files generated and tested
- ✅ Seed data ready
- ✅ Query performance benchmarks documented
- ✅ Rollback plan documented

---

### **DAY 2: Core Services & Business Logic (8 hours)**

#### **Morning (4 hours): Service Layer Architecture**

**Task 2.1: FriendshipService Design (2h)**
- Design service interface:
  - `sendFriendRequest(requesterId, targetId)` → Friendship
  - `acceptFriendRequest(friendshipId, userId)` → Friendship
  - `declineFriendRequest(friendshipId, userId)` → void
  - `cancelFriendRequest(friendshipId, requesterId)` → void
  - `unfriend(userId1, userId2)` → void
  - `areFriends(userId1, userId2)` → boolean
  - `getFriendsList(userId, cursor?, limit?)` → PaginatedFriends
  - `getPendingRequests(userId)` → Friendship[]
  - `getSentRequests(userId)` → Friendship[]
  - `getMutualFriends(userId, otherUserId)` → User[]

- Design validation logic:
  - Check Block before any operation
  - Check Privacy settings
  - Check rate limits (24h after decline, 30 days after unblock)
  - Validate canonical ordering (user1_id < user2_id)
  - Check duplicate requests
  - Validate expiration

- Design error handling:
  - BlockedException
  - PrivacyViolationException
  - DuplicateRequestException
  - RateLimitException
  - NotFoundException

**Task 2.2: BlockService Design (1h)**
- Design service interface:
  - `blockUser(blockerId, blockedId, reason?)` → Block
  - `unblockUser(blockerId, blockedId)` → void
  - `isBlocked(userId1, userId2)` → boolean
  - `getBlockedUsers(userId, page, limit)` → PaginatedBlocks
  - `getBlockedByUsers(userId)` → User[] (reverse lookup)

- Design cascade operations:
  - Delete all Friendship records (transaction)
  - Delete pending GroupJoinRequest records
  - Invalidate cache keys
  - Publish block event (Redis Pub/Sub)

- Design cache strategy:
  - Redis key: `block:{user1}:{user2}`
  - TTL: 60 seconds
  - Write-through pattern
  - Double-check DB on critical operations

**Task 2.3: PrivacyService Design (1h)**
- Design service interface:
  - `getSettings(userId)` → PrivacySettings
  - `updateSettings(userId, settings)` → PrivacySettings
  - `canUserSeeProfile(requesterId, targetId)` → boolean
  - `canUserMessageMe(requesterId, targetId)` → boolean
  - `canUserCallMe(requesterId, targetId)` → boolean

- Design permission matrix:
  - EVERYONE: Allow all (except blocked)
  - CONTACTS: Check Friendship + Block

- Design cache strategy:
  - Redis key: `privacy:{userId}`
  - TTL: 3600 seconds
  - Write-through on update

#### **Afternoon (4 hours): Extended Services**

**Task 2.4: ContactService Design (1.5h)**
- Design service interface:
  - `syncContacts(userId, hashedPhones[])` → MatchedUsers[]
  - `addContact(userId, contactUserId, aliasName?)` → UserContact
  - `updateAlias(userId, contactUserId, aliasName)` → UserContact
  - `removeContact(userId, contactUserId)` → void
  - `getContacts(userId, cursor?, limit?)` → PaginatedContacts
  - `resolveDisplayName(ownerId, targetUserId)` → string

- Design contact sync flow:
  - Client hashes phone numbers (SHA-256)
  - Server matches against user.phone_number_hash
  - Filter by Privacy (who can find me)
  - Filter already friends
  - Return matched users with limited info
  - Batch size limit: 500 per request
  - Rate limit: 3 requests/day

- Design name resolution priority:
  - Level 1: UserContact.alias_name
  - Level 2: User.display_name

**Task 2.5: CallHistoryService Design (1.5h)**
- Design service interface:
  - `logCallEnded(callerId, calleeId, duration, status)` → CallHistory
  - `getCallHistory(userId, limit?)` → CallHistory[]
  - `getMissedCalls(userId)` → CallHistory[]
  - `markCallAsViewed(callHistoryId)` → void

- Design Redis active call tracking:
  - Key: `call:session:{uuid}`
  - Value: { callerId, calleeId, startedAt, status }
  - TTL: 60 seconds (refresh on heartbeat)
  - Write to DB only on ENDED event

**Task 2.6: Integration Planning (1h)**
- Design inter-service communication:
  - Redis Pub/Sub channels:
    - `user:blocked` → Notify MessagingService, CallService
    - `friendship:changed` → Notify NotificationService
    - `privacy:updated` → Invalidate permission cache
  
- Design guard/middleware:
  - `@FriendsOnly()` decorator
  - `@NotBlocked()` decorator
  - `@CheckPrivacy('message')` decorator
  - `@CheckPrivacy('call')` decorator

- Design cache invalidation events:
  - Block/Unblock → Invalidate friend, block, permission cache
  - Friend/Unfriend → Invalidate friend list cache
  - Privacy update → Invalidate privacy cache

**Deliverables:**
- ✅ 5 service interfaces designed
- ✅ Validation logic documented
- ✅ Error handling strategy defined
- ✅ Cache strategy documented
- ✅ Integration points mapped
- ✅ Pub/Sub event schema defined

---

### **DAY 3: Authorization & Guards (8 hours)**

#### **Morning (4 hours): Permission System**

**Task 3.1: Authorization Middleware Design (2h)**
- Design guard hierarchy:
  - Level 1: Authentication (JWT validation)
  - Level 2: Block check (highest priority)
  - Level 3: Privacy check (EVERYONE vs CONTACTS)
  - Level 4: Friendship check (if CONTACTS required)
  - Level 5: Group context (if applicable)

- Design guard implementations:
  - `AuthGuard` → Validate JWT, extract userId
  - `NotBlockedGuard` → Check Block table
  - `CanMessageGuard` → Check Privacy + Friendship
  - `CanCallGuard` → Check Privacy + Friendship + Online status
  - `FriendsOnlyGuard` → Verify ACCEPTED friendship
  - `GroupMemberGuard` → Verify ConversationMember ACTIVE

- Design guard composition:
  - Messaging API: Auth → NotBlocked → CanMessage
  - Call API: Auth → NotBlocked → CanCall
  - Profile API: Auth → NotBlocked → CanSeeProfile
  - Group Message API: Auth → NotBlocked → GroupMember

**Task 3.2: Permission Cache Strategy (1h)**
- Design cache keys:
  - `perm:message:{user1}:{user2}` → boolean
  - `perm:call:{user1}:{user2}` → boolean
  - `perm:profile:{requester}:{target}` → boolean

- Design cache TTL:
  - Short TTL: 60 seconds (balance freshness vs performance)
  - Aggressive invalidation on state change

- Design cache warming:
  - Pre-cache friend list permissions on login
  - Lazy-load stranger permissions

**Task 3.3: Rate Limiting Design (1h)**
- Design rate limit rules:
  - Friend requests: 20 per day, 100 per week
  - Contact sync: 3 per day, 500 contacts per request
  - Search by phone: 10 per minute
  - Profile views: 1000 per hour

- Design rate limit storage:
  - Redis counters with TTL
  - Key: `ratelimit:{userId}:{action}:{window}`
  - Window: hourly, daily, weekly

- Design rate limit enforcement:
  - Check before operation
  - Increment after success
  - Reset on window expiration

#### **Afternoon (4 hours): Integration with Existing Modules**

**Task 3.4: Messaging Module Integration (2h)**
- Design changes to MessageController:
  - Add `@NotBlocked()` guard to POST /messages
  - Add `@CanMessageGuard()` to POST /conversations/:id/messages
  - Validate permissions before creating conversation

- Design changes to MessageService:
  - Check permissions before saving message
  - Filter conversation list by block status
  - Adjust unread count based on privacy

- Design real-time updates:
  - Socket: Check block before emitting `message:new`
  - Socket: Check privacy before emitting typing indicator
  - Socket: Kick user from room on block event

**Task 3.5: Group Module Integration (1h)**
- Design changes to ConversationController:
  - Add privacy check to POST /conversations/:id/members
  - Validate GroupJoinRequest against block status
  - Check admin privileges for member management

- Design admin leave cascade:
  - Detect admin leaving/being kicked
  - Trigger group deletion transaction
  - Notify all members via socket
  - Archive messages (soft delete)

**Task 3.6: Socket Gateway Integration (1h)**
- Design socket events for Social Graph:
  - `friendship:request` → Notify target user
  - `friendship:accepted` → Notify requester
  - `friendship:declined` → Notify requester
  - `user:blocked` → Disconnect socket, terminate calls
  - `user:unblocked` → No action (user must search again)

- Design socket room management:
  - On friend: Join room `user:{userId}:friends`
  - On unfriend: Leave room
  - On block: Force disconnect from all shared rooms

**Deliverables:**
- ✅ 6 guards designed and documented
- ✅ Permission cache strategy defined
- ✅ Rate limiting system designed
- ✅ Integration points with Messaging mapped
- ✅ Integration points with Groups mapped
- ✅ Socket event schema defined

---

### **DAY 4: Advanced Features & Contact Sync (8 hours)**

#### **Morning (4 hours): Contact Sync Implementation Plan**

**Task 4.1: Client-Side Hashing Strategy (1h)**
- Design phone number normalization:
  - Format: E.164 (+84xxxxxxxxx)
  - Strip spaces, dashes, parentheses
  - Validate country code

- Design hashing algorithm:
  - SHA-256 with server-provided salt
  - Salt rotation strategy (monthly)
  - Client caches salt for session

- Design batch upload:
  - Max 500 contacts per request
  - Chunk large contact books
  - Progress indicator on client

**Task 4.2: Server-Side Matching (2h)**
- Design matching algorithm:
  - Query: `WHERE phone_number_hash IN (hashes) AND status = 'ACTIVE'`
  - Filter by Privacy (who_can_find_me)
  - Exclude already friends
  - Exclude blocked users
  - Return limited profile info

- Design response payload:
  ```
  {
    matched: [
      { id, displayName, avatarUrl, mutualFriends: count }
    ],
    total: number
  }
  ```

- Design privacy protection:
  - Never reveal who is NOT on platform
  - Return same response time regardless of matches (anti-enumeration)
  - Log sync attempts for abuse detection

**Task 4.3: Name Resolution System (1h)**
- Design query optimization:
  - Avoid N+1 queries in conversation list
  - Use DataLoader pattern for batch loading
  - Pre-join UserContact in message queries

- Design cache strategy:
  - Redis hash: `names:{userId}` → { targetId: aliasName }
  - TTL: 1 hour
  - Invalidate on alias update

- Design fallback logic:
  - Try cache first
  - If miss, query DB with LEFT JOIN
  - Cache result
  - Return alias_name ?? display_name

#### **Afternoon (4 hours): Friend Suggestions & Discovery**

**Task 4.4: Mutual Friends Algorithm (2h)**
- Design efficient query:
  - Find friends of friends (2nd degree)
  - Exclude direct friends
  - Exclude blocked users
  - Order by mutual friend count DESC
  - Limit to top 20

- Design query optimization:
  - Use CTE (Common Table Expression)
  - Materialize friend graph in Redis for hot users
  - Cache results for 24 hours

- Design API response:
  ```
  {
    suggestions: [
      { 
        id, displayName, avatarUrl,
        mutualFriends: [{ id, displayName }],
        mutualFriendCount: number
      }
    ]
  }
  ```

**Task 4.5: Friend Request Notifications (1h)**
- Design notification types:
  - `FRIEND_REQUEST_RECEIVED` → "X sent you a friend request"
  - `FRIEND_REQUEST_ACCEPTED` → "X accepted your friend request"
  - `FRIEND_REQUEST_DECLINED` → Silent (no notification)
  - `FRIEND_REQUEST_EXPIRED` → "Your request to X expired"

- Design delivery channels:
  - Real-time: Socket event
  - Push: FCM notification
  - In-app: Notification badge
  - Email: Daily digest (optional)

**Task 4.6: Search & Discovery (1h)**
- Design search by phone API:
  - Input: Phone number (normalized)
  - Check: Privacy settings (who_can_find_me)
  - Check: Block status
  - Return: Limited profile or "User not found"

- Design rate limiting:
  - 10 searches per minute
  - 100 searches per day
  - Block on abuse pattern (sequential numbers)

- Design QR code friend add:
  - Generate QR: user_id + signature + expiry
  - Scan QR: Validate signature + expiry
  - Auto-send friend request on scan

**Deliverables:**
- ✅ Contact sync flow documented
- ✅ Hashing strategy defined
- ✅ Name resolution system designed
- ✅ Mutual friends algorithm optimized
- ✅ Notification system integrated
- ✅ Search & discovery features planned

---

### **DAY 5: Testing & Optimization (8 hours)**

#### **Morning (4 hours): Comprehensive Testing**

**Task 5.1: Unit Tests Planning (2h)**
- FriendshipService tests:
  - `sendFriendRequest` success scenarios
  - `sendFriendRequest` failure scenarios (blocked, duplicate, privacy)
  - `acceptFriendRequest` updates status correctly
  - `declineFriendRequest` sets last_action_at for rate limiting
  - `unfriend` removes relationship
  - `areFriends` returns correct result (canonical ordering)
  - Rate limiting: 24h after decline, 30 days after unblock
  - Expiration: Requests expire after 90 days

- BlockService tests:
  - `blockUser` creates record and cascades deletes
  - `blockUser` invalidates cache
  - `isBlocked` checks both directions
  - `unblockUser` removes record and clears rate limit

- PrivacyService tests:
  - `canUserMessageMe` respects EVERYONE vs CONTACTS
  - `canUserCallMe` checks friendship for CONTACTS
  - Cache invalidation on settings update

- ContactService tests:
  - `syncContacts` matches hashed phones correctly
  - `syncContacts` filters by privacy
  - `resolveDisplayName` returns alias over display name

**Task 5.2: Integration Tests Planning (2h)**
- End-to-end flows:
  - Complete friend request lifecycle (send → accept → unfriend)
  - Block flow (block → cascade delete → cache invalidate)
  - Privacy flow (change setting → permission update → UI reflects)
  - Contact sync flow (upload → match → display suggestions)
  - Group admin leave (admin leaves → group dissolves)

- Edge cases:
  - Concurrent friend requests (A→B, B→A simultaneously)
  - Block during active call (call terminates immediately)
  - Unfriend during message sending (message fails with privacy error)
  - Admin role transfer before leave (promote new admin first)

- Performance tests:
  - Friend list load with 5000 friends (< 100ms)
  - Block check with 1000 concurrent requests (< 10ms p95)
  - Contact sync with 500 contacts (< 2 seconds)
  - Mutual friends with 1000 friends each (< 500ms)

#### **Afternoon (4 hours): Optimization & Documentation**

**Task 5.3: Query Optimization (1.5h)**
- Profile slow queries:
  - Use PostgreSQL `pg_stat_statements`
  - Identify queries > 100ms
  - Add missing indexes
  - Rewrite inefficient queries

- Optimize hot paths:
  - `areFriends` query: Add covering index
  - `getFriendsList` query: Use cursor-based pagination
  - `resolveDisplayName` query: Denormalize in cache
  - `getMutualFriends` query: Materialize in Redis

- Implement query result caching:
  - Friend list: Cache for 5 minutes
  - Block status: Cache for 60 seconds
  - Privacy settings: Cache for 1 hour

**Task 5.4: Cache Warming Strategy (1h)**
- Design cache pre-loading:
  - On user login: Load friend list into cache
  - On user login: Load privacy settings into cache
  - On conversation open: Load member permissions into cache

- Design cache expiration:
  - LRU eviction for memory management
  - TTL-based for data freshness
  - Event-based invalidation for consistency

- Design cache monitoring:
  - Hit rate metrics (target > 80%)
  - Miss rate alerts (if > 20%)
  - Eviction rate monitoring

**Task 5.5: Documentation (1.5h)**
- API Documentation:
  - Friendship endpoints (send, accept, decline, unfriend, list)
  - Block endpoints (block, unblock, list)
  - Privacy endpoints (get, update)
  - Contact endpoints (sync, list, update alias)
  - Search endpoints (by phone, QR code)

- Architecture Documentation:
  - Service layer architecture diagram
  - Cache strategy and invalidation rules
  - Permission matrix (who can do what)
  - Event flow diagrams (block cascade, admin leave)

- Database Documentation:
  - ER diagram with new models
  - Index strategy and rationale
  - Migration guide for production
  - Rollback procedures

**Deliverables:**
- ✅ Unit test suite planned (100+ test cases)
- ✅ Integration test scenarios defined (20+ flows)
- ✅ Performance benchmarks documented
- ✅ Query optimization completed
- ✅ Cache strategy implemented
- ✅ Complete API documentation
- ✅ Architecture documentation
- ✅ Database migration guide

---

## 🚀 READINESS FOR PHASE 4 (WebRTC)

### **Prerequisites Completed**
1. ✅ Authorization system in place (guards)
2. ✅ Block detection (< 5ms via cache)
3. ✅ Privacy enforcement (CONTACTS vs EVERYONE)
4. ✅ Friendship validation (areFriends check)
5. ✅ Call history model ready

### **Integration Points for WebRTC**
```
Call Initiation Flow:
1. User A clicks "Call" on User B profile
2. Frontend checks: canCallUser(B) → API call
3. Backend flow:
   a. AuthGuard: Validate JWT
   b. NotBlockedGuard: Check Block table (cache)
   c. CanCallGuard: Check Privacy + Friendship
   d. CallService: Create Redis session
   e. Socket: Emit "call:incoming" to B
4. B accepts/rejects
5. WebRTC: Establish P2P connection
6. On end: Write CallHistory to DB
```

### **Security Guarantees**
- ✅ Cannot call blocked user (enforced at API layer)
- ✅ Cannot call stranger if privacy = CONTACTS (enforced by guard)
- ✅ Cannot bypass via direct socket connection (socket validates permissions)
- ✅ Call history preserved for audit (DB record)

---

## 📈 SUCCESS METRICS

### **Performance Targets**
- Friend request: < 200ms p95
- Block check: < 10ms p95 (cached)
- Friend list (50 friends): < 100ms p95
- Contact sync (500 contacts): < 2000ms
- Mutual friends calculation: < 500ms

### **Scale Targets (MVP)**
- Support 100K users
- Support 300 contacts/user avg = 30M UserContact rows
- Support 50 friends/user avg = 2.5M Friendship rows
- Handle 1K concurrent friend requests
- Handle 10K/sec permission checks (cached)

### **Quality Targets**
- Zero friendship duplication (enforced by unique constraint)
- Zero race conditions (transactions + locks)
- < 60s cache staleness window (short TTL)
- 100% authorization coverage (all endpoints guarded)
- 100% test coverage for business logic

---

## ⚠️ RISK MITIGATION

### **Risk 1: Cache Inconsistency**
**Mitigation:**
- Short TTL (60s)
- Aggressive invalidation
- Double-check DB on writes

### **Risk 2: Race Conditions**
**Mitigation:**
- Distributed locks for admin promotion
- Database constraints (unique indexes)
- Optimistic locking where needed

### **Risk 3: Performance Degradation**
**Mitigation:**
- Index all foreign keys
- Use EXPLAIN ANALYZE on all queries
- Monitor slow query log
- Redis caching for hot data

### **Risk 4: Data Migration**
**Mitigation:**
- Test migrations on staging first
- Backup production DB before migration
- Rollback script ready
- Migrate during low-traffic window
