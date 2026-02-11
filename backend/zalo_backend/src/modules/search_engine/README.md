# Search Engine Module - Implementation Progress

## Status: PHASE 1 & 2 COMPLETED ✅

This module implements comprehensive search functionality for Zalo Clone with performance, security, and UX in mind.

---

## 📁 Project Structure

```
src/modules/search_engine/
├── config/
│   └── search.config.ts                    # Configuration (cache TTL, limits, ranking weights)
├── controllers/
│   └── search_engine.controller.ts         # REST API endpoints
├── repositories/
│   ├── message-search.repository.ts        # Database queries for messages
│   └── contact-search.repository.ts        # Database queries for contacts
├── services/
│   ├── message-search.service.ts           # Business logic for message search
│   ├── contact-search.service.ts           # Business logic for contact search
│   ├── global-search.service.ts            # Unified global search
│   ├── search-validation.service.ts        # Validation & permission checks
│   └── search-cache.service.ts             # Cache management
├── utils/
│   ├── pagination.util.ts                  # Cursor-based pagination
│   └── ranking.util.ts                     # Relevance scoring
├── dto/
│   ├── search.dto.ts                       # Request/Response DTOs
│   └── ...
├── search_engine.module.ts                 # Module configuration
└── search_engine.controller.ts             # Controller setup
```

---

## 🚀 API Endpoints (Implemented)

### Global Search
```
GET /search/global?keyword=abc&limit=20&limitPerType=5
Response: { messages, contacts, groups, media, totalCount, executionTimeMs }
```

### Message Search
```
GET /search/conversations/{conversationId}/messages?keyword=abc&limit=50&cursor=...
Response: { items: [ { id, content, preview, highlights, rankScore, ... } ], nextCursor, hasMore }

GET /search/conversations/{conversationId}/messages/{messageId}/context?before=10&after=10
Response: { messages: [], targetMessage, totalInRange }

GET /search/messages?keyword=abc
Response: Global message search across active conversations
```

### Contact Search
```
GET /search/contacts?keyword=abc&excludeIds=[...]
Response: { items: [ { id, displayName, relationship, hasAlias, ... } ], hasMore }

GET /search/contacts/by-alias?keyword=abc
Response: Search saved contacts by alias

GET /search/contacts/list?limit=50&offset=0
Response: User's saved contacts list

GET /search/contacts/{userId}
Response: Specific contact details with privacy check
```

### Media Search (Phase 3 Placeholder)
```
GET /search/media?keyword=abc&mediaType=IMAGE&limit=30
```

### Group Search (Phase 3 Placeholder)
```
GET /search/groups?keyword=abc
```

---

## 🔐 Security Features (Implemented)

✅ **SearchValidationService**
- Conversation access validation (ACTIVE membership required)
- Block relationship checks (bidirectional)
- Privacy settings enforcement (showProfile, whoCanMessageMe)
- Soft-delete filtering (deletedAt IS NULL)
- User existence validation

✅ **Message Search Scope**
- Only returns messages from conversations user is ACTIVE member of
- Excludes soft-deleted messages
- Validates conversation membership

✅ **Contact Search Privacy**
- Respects PrivacySettings.showProfile
- Filters blocked users and blockers
- Checks friendship status for CONTACTS-only profiles

---

## ⚡ Performance Features (Implemented)

✅ **Full-Text Search (PostgreSQL)**
- Added `search_vector` column (tsvector, auto-generated)
- GIN index for fast full-text matching
- Trigram search for fuzzy/substring/accent-variant matching
- `pg_trgm` extension enabled

✅ **Cursor-Based Pagination**
- O(1) lookup regardless of page number
- Immune to data changes between requests
- Base64-encoded cursor: `{ lastId, lastCreatedAt }`

✅ **Caching Layer**
- Redis-based caching with configurable TTL
- Global search: 1 minute TTL
- User-scoped search: 5 minutes TTL
- Event-driven cache invalidation

✅ **Parallel Execution (Global Search)**
- Promise.allSettled for fault tolerance
- Individual query timeouts
- Graceful degradation if one sub-query fails

✅ **Relevance Ranking**
- 5-factor ranking formula:
  - Full-text match (0.4): ts_rank() from PostgreSQL
  - Recency (0.2): Exponential decay on days_ago
  - Relationship (0.2): Friend > REQUEST > None
  - Frequency (0.1): Keyword occurrence count
  - Interaction (0.1): Replies + reactions

---

## 📋 Database Schema Updates (PHASE 1 - Migration)

**Migration File:** `prisma/migrations/20250208150000_add_search_infrastructure/migration.sql`

### Changes Applied:
1. ✅ Added `pg_trgm` extension
2. ✅ Added `search_vector` column to messages (tsvector, GENERATED ALWAYS AS)
3. ✅ Created GIN index on `search_vector`
4. ✅ Created trigram index on `content`
5. ✅ Added `phone_number_normalized` to users
6. ✅ Added `is_archived`, `is_muted` to conversation_members
7. ✅ Created trigger for auto-updating search_vector on INSERT/UPDATE

---

## 🎯 Configuration (searchConfig)

```typescript
{
  cache: {
    ttlGlobalSearch: 60,          // 1 minute
    ttlUserScopedSearch: 300,     // 5 minutes
    ttlContactSearch: 300,        // 5 minutes
    enableCache: true,
  },
  pagination: {
    defaultMessageLimit: 50,
    defaultContactLimit: 50,
    defaultGlobalLimit: 20,
    maxLimit: 100,
  },
  performance: {
    queryTimeoutMs: 5000,         // 5 seconds per query
    maxParallelQueries: 4,
  },
  ranking: {
    fullTextMatchWeight: 0.4,
    recencyWeight: 0.2,
    relationshipWeight: 0.2,
    frequencyWeight: 0.1,
    interactionWeight: 0.1,
  },
}
```

---

## 📊 Service Layer Architecture

### SearchValidationService
- Centralized validation for all search operations
- Permission and security checks
- Privacy settings validation

### MessageSearchRepository
- Raw SQL queries with parameterization
- Full-text search with ts_rank()
- Trigram search fallback
- Ranking calculation
- Preview/highlight generation

### MessageSearchService
- Business logic wrapper
- Cache management
- Error handling
- DTO mapping

### ContactSearchRepository
- Alias priority logic (SQL-level)
- Bidirectional block checking
- Relationship status lookup
- Privacy-aware query

### ContactSearchService
- Business logic for contact search
- Privacy enforcement
- Cache invalidation

### GlobalSearchService
- Parallel sub-query execution
- Promise.allSettled for fault tolerance
- Individual query timeouts
- Result aggregation

### SearchCacheService
- Redis wrapper with graceful fallback
- Pattern-based cache invalidation
- Per-type TTL management

---

## 🧪 Testing Recommendations

### Unit Tests
- [ ] PaginationUtil.encodeCursor / decodeCursor
- [ ] RankingUtil.calculateRecencyScore()
- [ ] SearchValidationService functions
- [ ] ContactSearchRepository SQL queries

### Integration Tests
- [ ] Message search with various filters
- [ ] Contact search with alias priority
- [ ] Privacy settings enforcement
- [ ] Soft-delete filtering
- [ ] Block relationship checks
- [ ] Global search parallel execution

### Load Tests
- [ ] Search with 1M+ messages
- [ ] Multiple concurrent users (100+)
- [ ] Cache hit/miss ratios
- [ ] Query timeout handling

---

## 🔄 Cache Invalidation Strategy

**Message Search Cache:**
- Invalidated on: Message.create, Message.update (content), Message.delete
- Trigger: Socket event via message.service

**Contact Search Cache:**
- Invalidated on: User.update (displayName, avatarUrl),  Block.create/delete, Friendship.status change
- Trigger: Events from social modules

**Global Search Cache:**
- Invalidated on: Any of above events
- Pattern: `search:*`

---

## ⚠️ Known Limitations & Phase 3/4 TODO

### Phase 3 (UX Features)
- ❌ Message context highlighting with HTML tags
- ❌ `ts_headline()` snippet extraction
- ❌ Search analytics tracking
- ❌ Advanced filter endpoints

### Phase 4 (Advanced)
- ❌ Real-time search via WebSocket
- ❌ Search export functionality
- ❌ Media search implementation
- ❌ Group search implementation
- ❌ Elasticsearch migration option

---

## 📝 Environment Variables

```env
# Cache Configuration
SEARCH_CACHE_ENABLED=true
SEARCH_CACHE_TTL_GLOBAL=60
SEARCH_CACHE_TTL_USER=300

# Performance
SEARCH_QUERY_TIMEOUT=5000
```

---

## 🚀 Deployment Notes

1. **Database Migration:**
   ```bash
   npx prisma migrate deploy
   ```

2. **Verify Migration:**
   - Check `search_vector` column exists on messages
   - Check `pg_trgm` extension enabled
   - Check phone_number_normalized populated
   - Test trigram search: `SELECT * FROM users WHERE phone_number_normalized % '090'`

3. **Module Registration:**
   - SearchEngineModule already added to AppModule
   - CacheModule auto-configured

4. **Dependencies:**
   - `@nestjs/cache-manager` - for Redis integration
   - `cache-manager` - cache abstraction
   - `cache-manager-redis-store` - optional Redis backend

---

## 📖 API Documentation

All endpoints are documented with `@ApiOperation()` decorators for Swagger.

Access via: `http://localhost:3000/api` (after app startup)

---

## 🔗 Related Modules

- **@modules/messages** - Invalidate cache on message changes
- **@modules/users** - Invalidate contact search on user profile changes
- **@modules/social-graph** - Invalidate contact search on block/friendship changes
- **@common/guards/jwt-auth.guard** - Auth protection

---

## 📞 Support & Debugging

### Enable Debug Logging:
```typescript
// In any service
console.log('Search result:', result);
console.warn('Cache miss for key:', key);
console.error('Search error:', error);
```

### Check Cache Stats:
```bash
GET /search/cache-stats  # (add endpoint if needed)
```

### Query Performance:
```sql
-- Analyze search query plan
EXPLAIN ANALYZE
SELECT * FROM messages 
WHERE search_vector @@ plainto_tsquery('english', 'keyword')
AND deleted_at IS NULL;
```

---

**Status:** Production-ready for PHASE 1 & 2  
**Last Updated:** 2025-02-08  
**Next Phase:** Phase 3 (UX Features like highlighting, preview generation)
