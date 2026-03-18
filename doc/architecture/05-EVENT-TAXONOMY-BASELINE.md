# Event Taxonomy Baseline (Phase 0)

> Phạm vi: backend/zalo_backend (EventEmitter2 in-process)
>
> Ngày chốt baseline: 2026-03-17
>
> Nguồn đối chiếu:
> - doc/architecture/04-EVENT-CATALOG.md
> - backend/zalo_backend/src/common/contracts/events/event-names.ts
> - backend/zalo_backend/src/common/contracts/events/event-contracts.ts
> - backend/zalo_backend/src/common/constants/socket-events.constant.ts
> - backend/zalo_backend/src/common/constants/internal-events.constant.ts

## 1) Mục tiêu Phase 0

1. Có inventory event names đang chạy thực tế.
2. Gắn taxonomy rõ cho từng nhóm event: domain, internal technical, socket transport.
3. Chốt canonical source cho từng nhóm, làm nền cho cleanup ở các phase sau.

## 2) Taxonomy chuẩn đã chốt

## 2.1. Domain Events (nghiệp vụ)

Định nghĩa:
- Event phản ánh thay đổi nghiệp vụ cross-module.
- Có thể qua EventPublisher (ưu tiên) hoặc direct emit tạm thời.
- Listener chủ yếu là service/listener domain.

Canonical source:
- Tên event: backend/zalo_backend/src/common/contracts/events/event-names.ts (InternalEventNames)
- Payload type: backend/zalo_backend/src/common/contracts/events/event-contracts.ts
- Runtime catalog: doc/architecture/04-EVENT-CATALOG.md

Danh sách domain events baseline:
1. user.registered
2. user.profile.updated
3. user.logged_out
4. auth.security.revoked
5. friendship.request.sent
6. friendship.accepted
7. friendship.request.declined
8. friendship.request.cancelled
9. friendship.unfriended
10. user.blocked
11. user.unblocked
12. privacy.updated
13. cache.invalidate
14. contact.alias.updated
15. contact.removed
16. contacts.synced
17. message.sent
18. message.deleted
19. message.updated
20. message.edited
21. conversation.created
22. conversation.member.added
23. conversation.member.left
24. conversation.member.promoted
25. conversation.member.demoted
26. conversation.dissolved
27. conversation.muted
28. conversation.archived
29. conversation.updated
30. call.ended
31. call.push_notification_needed
32. media.uploaded
33. media.processed
34. media.failed
35. media.deleted
36. reminder.created
37. reminder.triggered
38. reminder.deleted

Ghi chú baseline:
- message.updated và message.edited đang ở trạng thái future-ready (listener có, emitter chưa active theo catalog).
- Một số event domain hiện vẫn được emit trực tiếp thay vì đi qua EventPublisher.

## 2.2. Internal Technical Events (hạ tầng nội bộ server)

Định nghĩa:
- Event phục vụ orchestration kỹ thuật trong backend, không phải hợp đồng client API.
- Không hiển thị trực tiếp ra protocol cho frontend.

Canonical source:
- Ưu tiên đặt trong event-names.ts nếu là internal bus dùng rộng.
- Với luồng chuyên biệt (như QR), tạm dùng internal-events.constant.ts.

Nhóm internal technical baseline:
1. socket.outbound
2. user.socket.connected
3. user.socket.disconnected
4. search.internal.newMatch
5. search.internal.resultRemoved
6. qr.internal.emit_to_socket
7. qr.internal.force_logout_devices

Vấn đề baseline cần xử lý ở phase sau:
- Một số internal technical events hiện nằm trong socket-events.constant.ts.
- Cần tách dần để SocketEvents chỉ còn contract client-server.

## 2.3. Socket Transport Events (client-server protocol)

Định nghĩa:
- Event name dùng cho SubscribeMessage hoặc server emit xuống client qua Socket.IO.
- Đây là hợp đồng transport, không phải domain business contract.

Canonical source:
- backend/zalo_backend/src/common/constants/socket-events.constant.ts

Nhóm socket transport chính:
1. Messaging transport: message:send, message:new, message:receipt, typing:*, conversation:read...
2. Group/conversation transport: group:*, conversation:* (pin/archive/mute sync payloads)
3. Search transport: search:subscribe, search:results, search:newMatch, ...
4. Call transport: call:initiate, call:incoming, call:ended, ...
5. QR transport: qr.scanned, qr.approved, qr.expired, qr.cancelled
6. Presence transport: friend:online, friend:offline, user:online, user:offline

Lưu ý:
- Socket transport names có thể ánh xạ từ domain/internal listener sang payload cho client.

## 3) Quy tắc canonical source (đã chốt)

1. Domain event name mới: thêm ở InternalEventNames.
2. Domain payload mới: thêm vào InternalEventPayloadMap.
3. Socket protocol name mới: chỉ thêm vào SocketEvents nếu thực sự là client-server contract.
4. Internal technical event mới: ưu tiên đặt ngoài SocketEvents.

## 4) Quy tắc phân loại khi thêm event mới

1. Nếu event mô tả thay đổi nghiệp vụ (block, friendship, conversation, call state): gắn Domain Event.
2. Nếu event chỉ để bridge module nội bộ server: gắn Internal Technical Event.
3. Nếu event là API realtime gửi/nhận giữa client và server: gắn Socket Transport Event.

## 5) Baseline checks cho Phase 0

1. Inventory đã có và phân loại đủ 3 nhóm.
2. Canonical source đã chốt cho từng nhóm.
3. Đã chỉ ra điểm chồng chéo cần cleanup ở phase sau.

Trạng thái:
- Hoàn tất kỹ thuật: Đạt
- Team sign-off taxonomy: Chờ

## 6) Handoff sang Phase 1+

1. Phase 1 dùng tài liệu này làm chuẩn migrate import contracts.
2. Phase 2/3 dùng danh sách domain events baseline để cleanup emit/listen.
3. Phase 5 dùng danh sách internal technical baseline để tách khỏi SocketEvents.
