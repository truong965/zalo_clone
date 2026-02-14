# Database Optimization Review - Schema + Search Engine Impact

Ngay danh gia: 2026-02-12

## Muc tieu
Danh gia cac nhan dinh trong 02-DATABASE-OPTIMIZATION.md: phan nao dung/co the ap dung, phan nao can dieu chinh/loai bo. Dong thoi chi ra tac dong den module search_engine neu schema thay doi.

## Danh gia tong quan

### Dung va co the ap dung
- Uoc luong dung luong (order-of-magnitude) hop ly de dinh hinh quy mo. Con so chi mang tinh dinh huong, khong dung lam cam ket dung luong thuc te.
- Canh bao ve quy mo bang message_receipts: dung ve xu huong tang nhanh khi co group. Day la diem nghen tiem nang neu khong kiem soat.
- Cursor-based pagination thay cho offset: phu hop va dang duoc ap dung trong search_engine (da co PaginationUtil).
- Full-text search + trigram: dung va phu hop voi search_engine (dang su dung search_vector + ILIKE/unaccent + %).
- Data cleanup (soft delete cleanup, archive cu): hop ly ve operational, nhung can co chinh sach ro rang ve retention va tac dong nghiep vu.
- Slow query logging va index usage audit: dung va can thuc hien tren moi truong that.

### Dung nhung can dieu chinh/can rang buoc
- MessageReceipts JSONB (gop trang thai theo message):
  - Dung ve muc tieu giam so dong, nhung doi lai chi phi update JSONB lon va kho index theo tung user.
  - Can rang buoc ro: dung cho group; 1v1 co the giu schema cu hoac su dung aggregate row rieng.
  - Can them chien luoc update (upsert theo user) va co cot dem da tinh (seen_count/delivered_count) de phuc vu query nhanh.
- Partitioning Messages:
  - Dung ve thoi diem “sau khi lon”, nhung can ke hoach hoan chinh (migration, routing, maintenance, backup).
  - Hien tai cac query trong search_engine khong loc theo khoang thoi gian, nen partition pruning se it hieu qua truoc khi bo sung dieu kien range.
- GIN covering index (INCLUDE):
  - Co the dung tren Postgres 11+; can xac nhan version va tao qua migration raw SQL.
  - Prisma schema khong sinh duoc INCLUDE index, nen can migration thu cong.
- Partial index cho search_vector (recent 30 days):
  - Dung neu co query co dieu kien created_at > now() - interval; hien tai search_engine khong loc theo “recent”, nen index se khong duoc dung.
- Chi phi index: can audit bang pg_stat_user_indexes, khong nen “xoa theo cam tinh”.

### Sai hoac can loai bo
- TOAST phan MediaAttachment metadata: schema hien tai khong co cot metadata, nen khuyen nghi nay khong ap dung.
- TOAST phan DomainEvent.payload: Postgres mac dinh da dung STORAGE EXTENDED cho JSONB, nen ALTER COLUMN payload SET STORAGE EXTENDED khong mang lai loi ich.
- Prisma datasource config (connectionLimit/poolTimeout/statementTimeout) trong schema:
  - Prisma khong ho tro cac field nay trong datasource schema.
  - connection_limit/statement_timeout nen dat trong DATABASE_URL hoac qua Postgres/pgbouncer config.
- Index “messages(conversation_id)” duoc de xoa: trong schema hien tai khong co index don le nay, nen doan nay khong phu hop voi thuc te.

## Tac dong den search_engine neu thay doi schema

### 1) Doi MessageReceipts sang JSONB
Anh huong truc tiep den query dem seen_count va ranking:
- message-search.repository.ts dang dung:
  - “SELECT COUNT(*) FROM message_receipts WHERE message_id = m.id AND status = 'SEEN'”
  - Neu MessageReceipts doi schema, can thay logic lay seen_count (vi du: dung cot seen_count denormalized trong bang message_receipts, hoac bang message)
- search-raw-result.interface.ts co field seen_count (RawMessageSearchResult).
- ranking.util.ts su dung hasSeenReceipts de tinh interactionScore.

File can thay doi (neu doi schema receipts):
- [backend/zalo_backend/src/modules/search_engine/repositories/message-search.repository.ts](backend/zalo_backend/src/modules/search_engine/repositories/message-search.repository.ts)
- [backend/zalo_backend/src/modules/search_engine/interfaces/search-raw-result.interface.ts](backend/zalo_backend/src/modules/search_engine/interfaces/search-raw-result.interface.ts)
- [backend/zalo_backend/src/modules/search_engine/utils/ranking.util.ts](backend/zalo_backend/src/modules/search_engine/utils/ranking.util.ts)

### 2) Them search_vector_weighted / thay doi full-text index
Neu them cot search_vector_weighted va muon dung ts_rank voi weight:
- Can cap nhat query full-text trong MessageSearchRepository de dung cot moi.
- Can cap nhat migration/trigger (ngoai module) de duy tri gia tri.

File can xem xet:
- [backend/zalo_backend/src/modules/search_engine/repositories/message-search.repository.ts](backend/zalo_backend/src/modules/search_engine/repositories/message-search.repository.ts)
- [backend/zalo_backend/src/modules/search_engine/listeners/search-event.listener.ts](backend/zalo_backend/src/modules/search_engine/listeners/search-event.listener.ts)

### 3) Partial index “recent messages”
Neu muon dung partial index 30 ngay, can them dieu kien created_at trong query search (chi ap dung cho use case “recent search”). Hien tai module khong loc theo khoang thoi gian.

File can xem xet:
- [backend/zalo_backend/src/modules/search_engine/repositories/message-search.repository.ts](backend/zalo_backend/src/modules/search_engine/repositories/message-search.repository.ts)

## Kien nghi cu the tu 02-DATABASE-OPTIMIZATION.md

### De giu lai (ap dung duoc)
- Cursor pagination cho search (da co).
- Nhom quy tac query optimization (include sender/media trong 1 query).
- Slow query logging + pg_stat_statements.
- Cleanup soft delete + archive (co chinh sach ro).

### De dieu chinh
- MessageReceipts JSONB: chi nen lam neu co thiet ke ro cho group receipts va chot cach tinh seen_count/delivered_count nhanh.
- Partitioning: de sau khi co so lieu thuc te va co range filters.
- Full-text weighted/partial index: chi lam khi co query tuong ung.

### De loai bo
- TOAST “media_attachments.metadata” (khong ton tai).
- ALTER payload STORAGE EXTENDED (khong can thiet).
- Prisma datasource config (connectionLimit/poolTimeout/statementTimeout) trong schema (khong ho tro).

## Cac file trong search_engine lien quan nhat
- [backend/zalo_backend/src/modules/search_engine/repositories/message-search.repository.ts](backend/zalo_backend/src/modules/search_engine/repositories/message-search.repository.ts)
- [backend/zalo_backend/src/modules/search_engine/interfaces/search-raw-result.interface.ts](backend/zalo_backend/src/modules/search_engine/interfaces/search-raw-result.interface.ts)
- [backend/zalo_backend/src/modules/search_engine/utils/ranking.util.ts](backend/zalo_backend/src/modules/search_engine/utils/ranking.util.ts)
- [backend/zalo_backend/src/modules/search_engine/listeners/search-event.listener.ts](backend/zalo_backend/src/modules/search_engine/listeners/search-event.listener.ts)

## 1) Duyet diem gate receipts theo DIRECT (khong code)
Muc tieu: MessageReceipts chi ap dung cho chat 1 vs 1 (Conversation.type = DIRECT), tranh ghi receipts cho group.

### Cac diem can gate
- Gate truoc khi ghi receipts DELIVERED/SEEN (socket + realtime):
  - message.gateway: khi xu ly ack DELIVERED.
  - message-realtime.service: deliverMessageToRecipients(), syncOfflineMessages(), markAsSeen().
- Gate trong ReceiptService (lop an toan cuoi): chi cho phep ghi receipts neu message thuoc DIRECT.

### Rule cu the de gate
- Neu conversation.type != DIRECT thi:
  - Khong ghi dong vao message_receipts.
  - Khong phat receipt update ve sender (tranh UI group nhan "seen" theo tung user).
- Neu conversation.type == DIRECT thi:
  - Giu nguyen luong ghi receipts nhu hien tai.
- Uu tien gate o 2 lop:
  - Lop 1: ngay tai realtime/gateway de tranh tao tai DB khong can thiet.
  - Lop 2: ReceiptService kiem tra lai de chan sai sot do goi sai.

### Tac dong den search_engine neu gate receipts cho group
- seen_count trong search result se luon = 0 cho GROUP (do khong ghi receipts).
- Neu muon giu ranking cho group, can dieu chinh ranking: bo qua hasSeenReceipts cho GROUP hoac thay bang chi so khac (vd. reply_count).

## 2) De xuat index bo sung cho media search (theo query thuc te)
Query thuc te trong media-search.repository.ts:
- WHERE ma.deleted_at IS NULL
- AND m.deleted_at IS NULL
- AND m.conversation_id = ANY($2)
- AND (LOWER(unaccent(ma.original_name)) LIKE ... OR ma.original_name % $1)
- ORDER BY ma.created_at DESC, ma.id DESC

### Index de can nhac bo sung
- Media name + deletion filter (da co):
  - idx_media_attachments_original_name_trgm (GIN) dung cho ILIKE + trigram.
- Bo sung index de toi uu ORDER BY + filter deleted:
  - B-tree tren media_attachments: (deleted_at, created_at DESC, id DESC)
  - Neu muon loc theo media_type nhieu: (deleted_at, media_type, created_at DESC, id DESC)
- Bo sung index de toi uu join tu messages:
  - B-tree tren messages: (conversation_id, id) hoac (conversation_id, deleted_at, id)

### Ghi chu
- Chi them index neu pg_stat_statements cho thay query media search cham va pg_stat_user_indexes cho thay index duoc su dung.
- Neu chua co du lieu that, uu tien tung index quan trong nhat (ORDER BY + deleted_at) de tranh chi phi write.

## Ghi chu can xac minh
- Postgres version de quyet dinh GIN INCLUDE index.
- Thong ke thuc te tu pg_stat_user_indexes va pg_stat_statements truoc khi xoa/tao index.
- Danh gia tac dong den cac module khac neu thay doi receipts schema (khong chi search_engine).
