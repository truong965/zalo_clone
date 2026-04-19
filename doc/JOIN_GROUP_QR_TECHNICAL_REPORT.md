# Bao cao ky thuat: Chuc nang Join Group bang QR Code

Ngay cap nhat: 2026-04-20

## 1. Tong quan chuc nang

### 1.1 Muc tieu
Chuc nang Join Group bang QR Code cho phep thanh vien moi tham gia nhom nhanh thong qua viec quet ma QR, khong can tim kiem thu cong ten nhom hay copy/paste ID nhom.

### 1.2 Loi ich
- Giam so buoc tham gia nhom, tang conversion khi moi thanh vien moi.
- Ho tro ca 2 kieu nhom:
  - Nhom mo (khong can duyet): vao nhom ngay.
  - Nhom can duyet: tao yeu cau de admin phe duyet.
- Dong nhat trai nghiem giua Web va Mobile: web/mobile deu tao QR, mobile quet va xu ly join.
- Tach bach ro rang giua:
  - Tang hien thi QR (frontend)
  - Tang xu ly business va quyen (backend)

## 2. Kien truc he thong (Backend - Web - Mobile)

## 2.1 Backend
- Module chinh: `conversation`.
- Thanh phan business core:
  - `GroupJoinService`: xu ly preview, request join, review request.
  - `ConversationController`: expose REST API join/preview.
  - `ConversationGateway` + `ConversationRealtimeService`: xu ly socket event cho luong join request/review theo thoi gian thuc.
- Persistence:
  - `Conversation.requireApproval`: xac dinh co can admin duyet hay khong.
  - `GroupJoinRequest`: luu trang thai yeu cau tham gia (`PENDING/APPROVED/REJECTED`).

## 2.2 Frontend Web
- Vi tri UI: Group info sidebar.
- Web tao payload QR o client side bang JSON va render bang `QRCodeCanvas`.
- Nguoi dung mo modal "Moi vao nhom bang ma QR" de cho nguoi khac quet.

## 2.3 Frontend Mobile
- Co 2 vai tro:
  - Hien thi QR nhom de moi nguoi khac (`GroupQrModal`).
  - Quet QR va xu ly join (`QrScannerScreen`).
- Sau khi quet, mobile goi backend de lay preview va gui request join.

## 3. Luong hoat dong chi tiet cua QR Code

## 3.1 Tao QR
Co 2 diem tao QR hien tai:
- Web: tao JSON payload truc tiep tu thong tin conversation.
- Mobile: tao JSON payload thong qua helper `buildGroupJoinQrPayload`.

Payload dang dung:

```json
{
  "type": "GROUP_JOIN",
  "conversationId": "<uuid>",
  "name": "Ten nhom",
  "memberCount": 123
}
```

Luu y:
- `conversationId` la field bat buoc de join.
- `name`, `memberCount` la metadata de hien thi UI/fallback.

## 3.2 Quet QR
- Mobile dung `expo-camera` de scan QR.
- He thong parser uu tien nhan dien payload `GROUP_JOIN`.
- Sau khi parse duoc `conversationId`, app goi API preview:
  - `GET /api/v1/conversations/:id/join-preview`
- Mobile hien thi thong tin nhom + trang thai:
  - da la thanh vien
  - nhom can duyet
  - nhom mo

## 3.3 Join group
Nguoi dung nhan nut tham gia tren mobile:
- Goi API:
  - `POST /api/v1/conversations/:id/join`
- Backend xu ly theo `requireApproval`:
  - `false`: auto approve, them thanh vien ngay (`APPROVED`).
  - `true`: tao/refresh `GroupJoinRequest` o trang thai `PENDING`.

## 3.4 Admin review (neu nhom can duyet)
- Admin xem danh sach yeu cau tham gia (socket-driven UI tren web).
- Admin approve/reject qua socket event.
- Khi approve:
  - user duoc add vao `conversation_members`
  - phat su kien cap nhat cho cac thanh vien lien quan.

## 4. Thiet ke Backend

## 4.1 Data model lien quan

### Conversation
- `requireApproval: Boolean` (default `false`)
  - `false`: cho phep vao ngay.
  - `true`: can tao request de admin duyet.

### GroupJoinRequest
- Cac cot chinh:
  - `id`
  - `conversationId`
  - `userId`
  - `status`: `PENDING | APPROVED | REJECTED`
  - `inviterId` (nullable)
  - `requestedAt`, `reviewedAt`, `reviewedBy`, `message`
- Rang buoc:
  - unique `(conversationId, userId)` de tranh duplicate request cung nguoi/nhom.

## 4.2 API lien quan

### REST API (JWT bat buoc)

1. `GET /api/v1/conversations/:id/join-preview`
- Muc dich: lay thong tin nhom truoc khi join.
- Response mau:

```json
{
  "conversationId": "uuid",
  "name": "Nhom A",
  "avatarUrl": "https://...",
  "memberCount": 10,
  "requireApproval": true,
  "isMember": false
}
```

2. `POST /api/v1/conversations/:id/join`
- Body:

```json
{
  "message": "Xin vao nhom"
}
```

- Response:

```json
{
  "status": "PENDING",
  "message": "Join request sent. Waiting for admin approval."
}
```

hoac

```json
{
  "status": "APPROVED",
  "message": "You have joined the group"
}
```

### Socket events lien quan (join request workflow)
- Request join: `group:requestJoin`
- Review join: `group:reviewJoinRequest`
- Lay pending requests: `group:getPendingRequests`
- Notify:
  - `group:joinRequestReceived`
  - `group:joinRequestReviewed`
  - `group:memberJoined`

## 4.3 Payload QR Code

Payload hien tai la JSON plain text, duoc tao o frontend:

```json
{
  "type": "GROUP_JOIN",
  "conversationId": "<uuid>",
  "name": "<groupName>",
  "memberCount": 123
}
```

Dac diem:
- Don gian, de debug.
- Khong co chu ky (signature), khong co `exp`, khong co nonce.
- Backend khong verify tinh toan ven payload QR theo token; backend chi dung `conversationId` + auth cua user dang join.

## 4.4 Co che xac thuc khi join group

### Lop xac thuc
- REST route duoc bao ve boi `JwtAuthGuard`.
- User phai dang nhap hop le moi goi duoc preview/join.

### Lop phan quyen/business validation
Khi join:
- Kiem tra group ton tai, chua bi xoa.
- Kiem tra conversation phai la `GROUP`.
- Kiem tra user da la member ACTIVE chua.
- Kiem tra request pending trung lap.
- Neu group khong can duyet: upsert member ACTIVE ngay.
- Neu group can duyet: upsert request PENDING.

Khi admin review:
- Bat buoc admin ACTIVE cua nhom.
- Kiem tra stale request (nguoi dung da vao nhom).
- Kiem tra quan he block truoc khi approve.
- Giao dich transaction khi cap nhat request + cap nhat membership.

## 5. Frontend Website

## 5.1 Cach tao va hien thi QR code nhom
- Vi tri: `group-info-content` trong sidebar thong tin nhom.
- Logic tao payload:
  - Dung `useMemo` de `JSON.stringify({ type: 'GROUP_JOIN', conversationId, name, memberCount })`.
- Render QR:
  - Dung `qrcode.react` (`QRCodeCanvas`) trong modal.

## 5.2 Cach nguoi dung chia se QR
Hien trang:
- User mo modal "Moi tham gia nhom qua QR" trong Group Info.
- He thong hien QR tren man hinh de nguoi khac quet truc tiep.

Chua co san trong modal:
- Nut download QR.
- Nut copy payload/link.
- Native Web Share API.

Do do, cach chia se chu yeu hien tai la:
- Cho quet truc tiep tren man hinh.
- Chia se qua screenshot theo thao tac thu cong cua nguoi dung.

## 6. Mobile App

## 6.1 Chuc nang quet QR
- Man hinh: `QrScannerScreen`.
- Cong nghe scan: `expo-camera`.
- Parser ho tro:
  - `GROUP_JOIN` payload (uu tien)
  - fallback parse JSON co `conversationId` hop le UUID

Xu ly sau scan:
1. Parse payload.
2. Goi `getJoinGroupPreview(conversationId)`.
3. Hien thi thong tin nhom trong panel xac nhan.

## 6.2 Xu ly join group tu QR
- Nguoi dung bam nut tham gia.
- Goi `requestJoinGroup(conversationId, accessToken, message?)`.
- Neu `APPROVED`: dieu huong vao man hinh chat nhom.
- Neu `PENDING`: thong bao gui yeu cau thanh cong, cho admin duyet.

## 6.3 UI hien thi QR nhom (co)
Da co bo sung UI hien thi QR nhom tren mobile:
- Component: `GroupQrModal`.
- Vi tri mo: Group Settings (`group-settings.tsx`).
- Render QR bang `react-native-qrcode-svg`.
- Du lieu QR tao qua helper `buildGroupJoinQrPayload`.

## 7. Cac cong nghe su dung

## 7.1 Backend
- NestJS (Controller, Guard, Gateway, Service)
- Prisma ORM
- PostgreSQL
- Socket.IO
- class-validator
- Event-driven module boundaries

## 7.2 Web
- React + Vite
- Ant Design (Modal, UI)
- qrcode.react (`QRCodeCanvas`)
- Socket.IO client (join request realtime)

## 7.3 Mobile
- React Native + Expo
- expo-camera (scan QR)
- react-native-qrcode-svg (render QR)
- react-native-paper (modal/button)
- expo-router (navigation)

## 8. Danh gia ky thuat va de xuat cai tien

## 8.1 Diem manh hien tai
- Luong join qua QR da thong suot tu UI den backend business.
- Ho tro linh hoat ca 2 mode open-group va approval-group.
- Co co che tranh duplicate request va check vai tro admin khi duyet.

## 8.2 Han che hien tai
- QR group payload dang la plain JSON, khong co token ky so/het han.
- Chua co co che revoke QR rieng cho tung dot chia se.
- Web/mobile tao payload tren client, backend khong cap invite token.

## 8.3 De xuat nang cap (khuyen nghi)
1. Chuyen sang QR payload do backend cap, dang JWT/JWE hoac signed token:
   - co `conversationId`, `issuer`, `exp`, `jti`, `scope=GROUP_JOIN`.
2. Them co che revoke token theo `jti` hoac rotate invite key theo nhom.
3. Them API tao QR invite co cau hinh:
   - thoi gian song,
   - so lan su dung,
   - chi cho phep vai tro tao invite nhat dinh.
4. Them nut chia se/download/copy tren web va mobile de tang kha nang lan truyen.

## 9. Tom tat
Chuc nang Join Group bang QR Code da duoc trien khai day du tren ca Web, Mobile va Backend voi luong nghiep vu ro rang:
- Tao QR tai man hinh thong tin nhom.
- Mobile quet QR, preview thong tin va gui join request.
- Backend quyet dinh auto-join hoac tao pending request tuy theo `requireApproval`.

He thong da dat muc tieu ve tinh tien dung va kha nang mo rong, dong thoi con du dia nang cap bao mat payload QR theo huong token ky so va co che revoke invite.
