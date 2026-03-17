# Ke hoach chi tiet Buoc 2.4 - Co lap Trai tim he thong Messaging

## 1) Muc tieu va rang buoc
- Muc tieu chinh: tach phu thuoc vat ly Messaging -> User (Identity) trong CSDL, giu nguyen quan he noi bo Messaging (Conversation <-> Message).
- Rang buoc bat buoc:
  - Khong chay test e2e trong buoc nay.
  - Message ID tiep tuc la BigInt.
  - Khong trien khai Snowflake trong phase nay.
  - Dinh huong neu scale phan tan trong tuong lai: can nhac UUID v7.
  - Code la nguon su that: moi quyet dinh dua tren schema + truy van thuc te trong service.

## 2) Code truth hien tai (snapshot)

### 2.1 Schema hien tai
- Message ID dang la BigInt va dang dung auto increment:
  - `prisma/schema.prisma` -> model Message: `id BigInt @id @default(autoincrement())`.
- Cac quan he Messaging -> User van ton tai va can tach:
  - `ConversationMember.user @relation(...)`
  - `GroupJoinRequest.user/reviewer/inviter @relation(...)`
  - `Message.sender/deletedBy @relation(...)`
- Quan he noi bo can giu:
  - `Conversation.messages`
  - `Message.conversation`
  - `Message.parentMessage/replies`

### 2.2 Query code hien tai dang phu thuoc relation User
- Message service van `include sender` o nhieu duong doc/ghi:
  - `src/modules/message/services/message.service.ts`
- Conversation service van `include members.user`, va co cho `select sender` khi lay pinned messages:
  - `src/modules/conversation/services/conversation.service.ts`
- Group service va GroupJoin service van `include user`:
  - `src/modules/conversation/services/group.service.ts`
  - `src/modules/conversation/services/group-join.service.ts`
- Search listener van query `message.findUnique(include: { sender, conversation })`:
  - `src/modules/search_engine/listeners/search-event.listener.ts`

### 2.3 Snowflake hien tai
- Da quet codebase + package dependencies, chua thay implementation Snowflake ro rang trong backend hien tai.
- Chua co dependency thu vien Snowflake trong `backend/zalo_backend/package.json`.

## 3) Pham vi Buoc 2.4

### Trong pham vi
- Tach relation vat ly Messaging -> User trong Prisma schema.
- Refactor truy van Prisma relation-based sang ID-based data composition trong service layer.
- Chuan hoa luong map profile nguoi dung (displayName/avatar) qua resolver/facade theo batch.
- Giu nguyen Message ID BigInt hien tai, khong trien khai Snowflake trong phase nay.

### Ngoai pham vi
- Khong tach quan he noi bo Conversation <-> Message.
- Khong doi API contract FE neu khong bat buoc.
- Khong chay test e2e.

## 4) Ke hoach trien khai chi tiet theo tung commit nho

## 4.0 Pre-flight (read-only, khong doi code)
1. Chot danh sach relation can xoa trong schema (Messaging -> User).
2. Chot danh sach query relation can refactor trong cac file:
   - `src/modules/message/services/message.service.ts`
   - `src/modules/conversation/services/conversation.service.ts`
   - `src/modules/conversation/services/group.service.ts`
   - `src/modules/conversation/services/group-join.service.ts`
   - `src/modules/search_engine/listeners/search-event.listener.ts`
3. Chot chien luoc profile composition:
   - Lay `userId` tu bang Messaging.
   - Batch resolve qua service trung gian (DisplayNameResolver + batched user fetch) de tranh N+1.

Acceptance:
- Co checklist ro truoc khi sua schema.

## 4.1 Schema decoupling Messaging -> User

### 4.1.1 Sua `prisma/schema.prisma`
- ConversationMember:
  - Giu: `userId`.
  - Xoa: relation field `user User @relation(...)`.
- GroupJoinRequest:
  - Giu: `userId`, `reviewedBy`, `inviterId`.
  - Xoa: relation fields `user`, `reviewer`, `inviter`.
- Message:
  - Giu: `senderId`, `deletedById`.
  - Xoa: relation fields `sender`, `deletedBy`.
- User:
  - Xoa cac mang relation nguoc cua Messaging:
    - `conversations`
    - `joinRequests`
    - `groupInvitesSent`
    - `reviewedJoinRequests`
    - `messagesSent`
    - `messagesDeleted`

### 4.1.2 Prisma lifecycle
- Chay: generate client.
- Tao migration decoupling.
- Dam bao migration khong dong vao du lieu ID (chi FK/relation metadata).

Acceptance:
- Prisma generate thanh cong.
- Build co the fail tam thoi do code relation chua refactor (du kien).

## 4.2 Refactor Message domain (uu tien cao nhat)

### 4.2.1 Message read/write payload composition
Tai `src/modules/message/services/message.service.ts`:
- Thay `include.sender` trong:
  - sendMessage return path
  - duplicate-idempotency fallback path
  - getMessages
  - getMessagesContext
- Chien luoc moi:
  - Query message core fields + senderId (khong include sender relation).
  - Gom tap senderId (ca parentMessage.senderId).
  - Batch lay profile theo IDs.
  - Gan sender object vao response DTO o service layer.

### 4.2.2 Reply preview
- `PARENT_MESSAGE_PREVIEW_SELECT` bo nested sender relation, giu senderId.
- Parent sender profile duoc compose giong message chinh.

### 4.2.3 Dinh dang ID
- Tiep tuc parse/serialize BigInt ve string cho API output nhu hien tai.

Acceptance:
- MessageService compile xanh khong con truy cap relation `sender` cua Prisma Message.

## 4.3 Refactor Conversation + Group + Join Request

### 4.3.1 ConversationService
Tai `src/modules/conversation/services/conversation.service.ts`:
- Bo `members.include.user` va `sender` relation trong pinned messages.
- Pattern thay the:
  - Truy van members chi lay `userId`, role, status...
  - Batch fetch profile theo danh sach `userId`.
  - Compose `member.user` va sender display fields trong DTO.

### 4.3.2 GroupService
Tai `src/modules/conversation/services/group.service.ts`:
- `getGroupMembers` bo `include.user`, thay bang 2-buoc:
  - Lay member rows.
  - Batch fetch profiles theo `userId`.

### 4.3.3 GroupJoinService
Tai `src/modules/conversation/services/group-join.service.ts`:
- `getPendingRequests` bo `include.user`.
- Lay request rows + batch profile theo `userId`.
- Compose lai `user` payload de giu contract API.

Acceptance:
- Conversation/Group/GroupJoin compile xanh.
- Khong con where/include dua vao relation user da xoa.

## 4.4 Cross-module impact trong Search
Tai `src/modules/search_engine/listeners/search-event.listener.ts`:
- Bo `include.sender` khi doc message cho realtime search.
- Giu `include.conversation` (quan he noi bo Messaging, khong tach).
- Batch/compose sender profile qua profile resolver.

Acceptance:
- Search listener compile xanh, luong realtime search khong vo sender metadata.

## 4.5 Message ID Scope (cap nhat)

- Khong trien khai Snowflake trong phase 2.4.
- Message ID tiep tuc su dung BigInt nhu hien tai.
- Neu scale phan tan trong tuong lai, can nhac UUID v7 theo migration rieng.

Acceptance:
- Khong thay doi co che tao Message ID trong phase 2.4.
- Khong phat sinh cast error BigInt trong API/Socket/Event payload.

## 4.6 Validation sau moi phase (khong e2e)

Sau moi commit nho:
1. Chay build: `npm run build`.
Moc gate:
- Gate A: xong 4.1 + build do relation errors la du kien.
- Gate B: xong 4.2 + build xanh Message layer.
- Gate C: xong 4.3 + build xanh Conversation/Group.
- Gate D: xong 4.4 + build xanh toan bo.
- Gate E: xong 4.5 (khong doi ID strategy) + build xanh + smoke pass.

## 5) RUI RO va giai phap
- Rui ro N+1 khi bo relation include.
  - Giai phap: luon gom IDs va batch fetch profile.
- Rui ro vo contract response (thieu sender/user object).
  - Giai phap: tao helper map profile -> DTO thong nhat.
- Rui ro BigInt serialization trong API/socket payload.
  - Giai phap: giu quy tac toString cho message id va validate cac response payload quan trong.

## 6) Definition of Done cho Buoc 2.4
- Schema Messaging da xoa quan he vat ly toi User theo dung pham vi.
- Message ID van la BigInt va khong doi strategy tao ID trong phase 2.4.
- `npm run build` xanh.
- Cac luong quan trong hoat dong qua smoke test thu cong, khong chay e2e:
  - send/get message
  - get message context
  - pinned messages
  - group member
  - pending join requests
  - realtime search message event

## 7) Thu tu commit de nghi
1. `chore(prisma): remove messaging-user relations in schema`
2. `refactor(message): compose sender profiles without prisma relations`
3. `refactor(conversation): compose member/sender profiles in service layer`
4. `refactor(group-join): remove include user relation and compose payload`
5. `refactor(search): decouple sender relation in search event listener`
6. `chore(validation): build green + smoke checklist`

---
Ghi chu: Ke hoach nay uu tien migration an toan, commit nho, rollback de, va dam bao Code la nguon su that cho tung buoc.
