# Ke hoach trien khai cac tinh nang tin nhan nang cao

Cap nhat: 07/04/2026  
Pham vi: backend/zalo_backend + frontend/zalo_clone_web + frontend/zalo_mobile_app

## 1) Muc tieu
Trien khai day du 6 tinh nang:

1. Reply tin nhan cu the
2. Chuyen tiep tin nhan
3. Mention trong group
4. Xoa tin nhan phia minh (delete for me)
5. Thu hoi tin nhan trong 24h (delete for everyone)
6. Chinh sua tin nhan

## 2) Danh gia hien trang codebase

## 2.1 Backend (NestJS)

- Message module da co nen tang tot cho luong gui/realtime/receipt:
  - src/modules/message/services/message.service.ts
  - src/modules/message/services/message-realtime.service.ts
  - src/modules/message/message.gateway.ts
  - src/common/constants/socket-events.constant.ts
- Reply da co san o tang DTO + Service:
  - dto.sendMessage.replyTo
  - validateReplyToMessage(...)
  - parentMessage duoc tra ve trong getMessages/getMessagesContext/send
- Thu hoi hien tai da co nhung gioi han 15 phut:
  - deleteMessage(..., deleteForEveryone=true)
  - Rule hien tai: sender only, <= 15 phut
- Delete for me chua support:
  - message.service.ts dang throw "Delete for me not yet supported"
- Chua co API/service cho:
  - forward
  - mention
  - edit
- Internal event name da co san cho MESSAGE_EDITED/MESSAGE_UPDATED:
  - src/common/contracts/events/event-names.ts
  - Nhung chua thay implementation hoan chinh trong MessageService/Controller/Gateway.

## 2.2 Prisma schema

- Message model hien co:
  - replyToId
  - deletedAt/deletedById
  - deliveredCount/seenCount/totalRecipients
  - directReceipts JSONB
- Chua co cot/ban ghi rieng cho:
  - editedAt/editVersion
  - per-user hide (delete for me)
  - mention metadata chuan hoa (hien co the dung metadata JSONB, nhung chua co quy uoc)

## 2.3 Frontend Web

- Da co luong hien thi reply quote + set reply target:
  - src/features/chat/components/message-list.tsx
  - src/features/chat/stores/chat.store.ts
  - src/features/chat/hooks/use-send-message.ts
- Context menu message hien tai chua co edit/delete/forward:
  - Chu yeu co: reply, dich, pin/unpin, AI summary
- message api hien tai chua expose method edit/delete/forward:
  - src/features/chat/api/message.api.ts
  - Du API_ENDPOINTS co khai bao EDIT/DELETE, nhung message.api chua goi.

## 2.4 Frontend Mobile

- Da co reply trong UI va send payload replyTo:
  - app/chat/[id].tsx
  - features/chats/components/chat-input.tsx
  - features/chats/hooks/use-chat-hooks.ts
- Action sheet message hien tai:
  - Co Reply, Pin/Unpin
  - "Thu hoi" dang disabled (chua dau noi)
  - Chua co edit/delete-for-me/forward.
- mobileApi chua co method edit/delete/forward message:
  - frontend/zalo_mobile_app/services/api.ts

## 3) De xuat thiet ke tong quan

Nguyen tac: giu dung architecture module/event-driven hien co.

- MessageModule tiep tuc la owner nghiep vu message lifecycle.
- Realtime tiep tuc di qua MessageGateway + MessageRealtimeService.
- Cross-module tiep tuc dung event:
  - message.sent, message.deleted, message.edited, message.forwarded (them moi)
- Khong goi truc tiep logic business module khac; chi dung EventPublisher/listener.

## 4) Huong trien khai theo tung tinh nang

## 4.1 Reply tin nhan cu the

Trang thai: da co 70-80%.

Viec can bo sung:

1. Chuan hoa payload reply preview de frontend khong vo UI khi parent bi thu hoi/chinh sua.
2. Bo sung test:
   - reply toi message khac conversation -> fail
   - reply toi message da bi deletedAt -> fail
   - render parentMessage + media preview dung
3. Cho phep hien thi placeholder khi parent da thu hoi:
   - VD: "Tin nhan goc da duoc thu hoi".

File backend chinh:
- src/modules/message/services/message.service.ts
- src/modules/message/dto/send-message.dto.ts

File frontend chinh:
- web: src/features/chat/components/reply-quote.tsx
- mobile: features/chats/components/message-item/* + chat-input.tsx

## 4.2 Chuyen tiep tin nhan

Trang thai: chua co.

De xuat API:

- POST /api/v1/messages/forward
- DTO:
  - sourceMessageId: string
  - targetConversationIds: string[]
  - clientRequestId: uuid (idempotency level request)
  - optional: includeCaption?: boolean

Rule nghiep vu:

1. User phai la member ACTIVE o moi target conversation.
2. Khong forward SYSTEM message (phase 1).
3. Mac dinh support TEXT + IMAGE + VIDEO + FILE + AUDIO + VOICE.
4. Tao message moi (new message id), khong tai su dung receipt cua message goc.
5. metadata danh dau:
   - metadata.forward = {
     sourceMessageId,
     sourceConversationId,
     originalSenderId,
     forwardedBy,
     forwardedAt
   }

Xu ly media forward:

- Giai phap khuyen nghi phase 1:
  - Clone media attachment metadata sang row moi gan vao message moi.
  - Dung chung URL da xu ly (cdnUrl/thumbnailUrl/optimizedUrl), khong re-upload.
  - Khi clone can xu ly cac cot unique (s3Key/uploadId) theo huong an toan (null/new value).

Realtime:

- Co the tai su dung message:new cho recipient.
- Them ack cho sender: message:forwarded (tuy chon) de UI hien "Da chuyen tiep" nhanh hon.

Can bo sung event:

- MESSAGE_FORWARDED (internal) de analytics/search/notification co the phan biet luong.

## 4.3 Mention trong group

Trang thai: chua co.

De xuat data contract:

- Truyen mention trong metadata:
  - metadata.mentions = [{ userId, display, start, length }]
- Backend validate:
  - conversation type phai la GROUP
  - user duoc mention phai la member ACTIVE
  - Khong cho mention user ngoai nhom

Backend flow:

1. Trong sendMessage, parse + validate metadata.mentions.
2. Luu metadata mention vao message.
3. Emit event MESSAGE_MENTIONED (hoac tai su dung MESSAGE_SENT + metadata) cho Notifications module.
4. Push notification uu tien cao hon khi user bi mention.

Frontend:

- Input @de goi member picker.
- Luu mention offsets khi gui.
- Message bubble highlight mention cua current user.

KPI UX:

- Mention phai nhan duoc noti ngay ca khi user khong mo dung conversation.

## 4.4 Xoa tin nhan phia minh (delete for me)

Trang thai: chua co.

Van de hien tai:

- Message hien dang soft delete global (deletedAt) nen khong bieu dien duoc delete rieng tung user.

De xuat schema moi:

- Them model MessageUserVisibility (hoac MessageHidden):
  - id
  - messageId (BigInt)
  - userId (UUID)
  - hiddenAt
  - unique(messageId, userId)
  - index(userId, hiddenAt)

Backend thay doi:

1. message.service.deleteMessage(..., deleteForEveryone=false):
   - upsert MessageUserVisibility thay vi throw error
2. getMessages/getMessagesContext/getRecentMedia:
   - exclude cac message co ban ghi hidden voi current user
3. Socket:
   - emit message:deletedForMe de remove khoi UI ngay lap tuc

Frontend:

- Them action "Xoa phia minh" vao menu.
- Optimistic remove khoi cache.

## 4.5 Thu hoi tin nhan trong 24h

Trang thai: da co, nhung dang 15 phut.

Backend thay doi toi thieu:

- Doi rule time-window:
  - tu 15 * 60 * 1000
  - thanh 24 * 60 * 60 * 1000

Kien nghi them:

1. Khi thu hoi, set metadata.recalled = true + recalledAt de UI render ro rang.
2. Broadcast event message:recalled (hoac message:updated) de 2 phia update ngay, tranh doi reload.
3. Voi message da thu hoi, UI hien placeholder thong nhat:
   - "Ban da thu hoi mot tin nhan"
   - "Tin nhan da duoc thu hoi"

## 4.6 Chinh sua tin nhan

Trang thai: chua co API/service hoan chinh.

De xuat pham vi phase 1:

- Chi cho phep edit TEXT message cua chinh sender.
- Khong cho edit SYSTEM/VOICE/FILE media-rich o phase dau.

Schema de xuat:

- Them cot Message:
  - editedAt DateTime?
  - editVersion Int @default(0)
  - (optional) previousContent Json? hoac tach bang MessageEditHistory

API:

- PATCH /api/v1/messages/:messageId
- Body: { content: string }

Rule:

1. sender only
2. message chua bi recalled/deletedAt
3. content moi khac content cu
4. length <= gioi han text hien co

Event + realtime:

- Publish MESSAGE_EDITED
- Broadcast socket message:edited (payload: messageId, conversationId, content, editedAt, editVersion)

Frontend:

- Them action "Chinh sua" cho message cua minh.
- Inline edit UI + optimistic update + rollback neu fail.
- Hien badge "(da chinh sua)".

## 5) Thu tu uu tien de trien khai (roadmap)

## Phase 1 (quick win, impact cao)

1. Thu hoi 24h (nang tu 15 phut)
2. Chinh sua TEXT message
3. Delete for me (schema + query filter)

## Phase 2

1. Forward message (text + media)
2. Frontend action menus day du (web + mobile)

## Phase 3

1. Mention group (picker + metadata + notification)
2. Mention highlighting + tracking analytics

## 6) Checklist file can cham toi

Backend:

- src/modules/message/message.controller.ts
- src/modules/message/message.gateway.ts
- src/modules/message/services/message.service.ts
- src/modules/message/services/message-realtime.service.ts
- src/modules/message/dto/* (them dto moi)
- src/modules/message/events/message.events.ts
- src/common/constants/socket-events.constant.ts
- prisma/schema.prisma
- prisma/migrations/*

Cross-module (neu can):

- src/modules/notifications/listeners/message-notification.listener.ts
- src/modules/search_engine/listeners/search-event.listener.ts

Frontend web:

- src/features/chat/api/message.api.ts
- src/features/chat/components/message-list.tsx
- src/features/chat/hooks/use-message-socket.ts
- src/features/chat/utils/message-cache-helpers.ts
- src/features/chat/components/chat-input.tsx (mention picker)

Frontend mobile:

- features/chats/components/message-action-sheet.tsx
- features/chats/hooks/use-chat-hooks.ts
- app/chat/[id].tsx
- services/api.ts
- constants/socket-events.ts

## 7) Test plan bat buoc

Unit test (backend):

1. delete for me filter dung theo user
2. recall 24h boundary (23h59m pass, 24h01m fail)
3. edit message rule sender/type/content
4. forward permission + idempotency
5. mention validate member ACTIVE

Integration/E2E:

1. A edit -> B thay doi realtime
2. A recall -> B nhan placeholder realtime
3. A delete for me -> B van thay message
4. Forward vao nhieu conversation, ket qua doc lap
5. Mention trong group -> user duoc mention nhan push/socket

Frontend test:

1. Optimistic update cho edit/delete-for-me
2. Message cache consistency khi socket event toi trong luc user dang jump-to-message
3. Action menu permission theo sender/role

## 8) Rui ro va giam thieu

1. Rui ro query cham khi them delete-for-me filter:
   - Giai phap: index (userId, messageId), test explain analyze.
2. Rui ro duplicate event/socket:
   - Giai phap: idempotency key + cache helper upsert theo messageId.
3. Rui ro migration lon:
   - Giai phap: rollout additive schema truoc, bat feature bang flag sau.

## 9) Ket luan

Codebase hien tai da co nen realtime va message pipeline kha tot, nen co the trien khai 6 tinh nang tren theo huong mo rong MessageModule ma khong can pha vo kien truc tong the.

Thu tu khuyen nghi: Recall 24h + Edit + Delete for me truoc, sau do Forward, cuoi cung Mention group.