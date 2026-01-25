1. Giai đoạn Gửi Tin Nhắn (Sending Flow)
Đây là luồng xảy ra khi User A gửi tin nhắn cho User B.

Bước 1: Gatekeeping (Bảo vệ đầu vào)
Trước khi tin nhắn chạm vào Logic chính, nó phải qua 2 lớp bảo vệ:

Rate Limiting (WsThrottleGuard):

Hệ thống kiểm tra xem socketId này có spam không (dựa trên Redis).

🔴 Lỗi (Rate Limit Exceeded): Nếu vượt quá giới hạn (VD: >100 event/10s), server sẽ:

Gửi event error với code RATE_LIMIT_EXCEEDED về client.

Ngắt xử lý ngay lập tức (không lưu DB).

Validation (WsValidationPipe):

Kiểm tra cấu trúc dữ liệu (SendMessageDto) xem có đúng UUID không, content có quá dài không.

🔴 Lỗi (Validation Error): Ném ngoại lệ WsException, client nhận được thông báo lỗi chi tiết về trường bị sai.

Bước 2: Idempotency & Persistence (Xử lý Logic)
Sau khi qua cửa bảo vệ, MessagingGateway gọi MessageService.

Kiểm tra Trùng lặp (Idempotency Check):

Server kiểm tra Redis key msg:dedup:{clientMessageId}.

Trường hợp Retry: Nếu key tồn tại (tức là tin nhắn này đã từng gửi rồi nhưng client chưa nhận được ACK nên gửi lại), server trả về ngay tin nhắn cũ từ cache mà không tạo mới trong DB.

Kiểm tra Quyền (Permission):

Kiểm tra người gửi có phải thành viên của cuộc hội thoại không (isMember).

🔴 Lỗi (Forbidden): Nếu không phải thành viên -> Ném lỗi ForbiddenException.

Lưu Database (Transaction):

Mở Transaction Prisma:

Insert tin nhắn vào bảng Message.

Update lastMessageAt của bảng Conversation.

Lưu kết quả vào Redis Cache (TTL 5 phút) để phục vụ Idempotency.

Bước 3: Phản hồi người gửi (Ack)
Ngay khi lưu DB thành công, Gateway gửi event message:sent ngược lại cho User A để xác nhận: "Server đã nhận tin nhắn" (Server ACK).

2. Giai đoạn Phân phối (Delivery Flow)
Sau khi lưu tin nhắn, hệ thống cần gửi nó đến những người nhận (Recipients).

Bước 1: Broadcasting (Phát tán liên server)
Vì hệ thống có thể chạy nhiều Server Instance (Scaling), người nhận có thể đang kết nối ở server khác.

Gateway gọi MessageBroadcasterService để Publish tin nhắn vào Redis Pub/Sub (chat:msg:{conversationId}).

Tất cả các Server Instance đều lắng nghe kênh này.

Bước 2: Local Delivery (Phân phối tại chỗ)
Mỗi Server Instance nhận được tin từ Redis Pub/Sub sẽ lọc xem: "Trong danh sách người nhận, có ai đang kết nối với TÔI không?".

Trường hợp 1: Người nhận ONLINE (isOnline = true)

Gửi tin nhắn qua Socket (message:new).

Đánh dấu DELIVERED ngay lập tức vào DB (ReceiptService).

Tăng biến đếm tin nhắn chưa đọc (unreadCount).

Notify Sender: Báo ngược lại cho người gửi biết là User B đã nhận được (message:receipt status DELIVERED).

Trường hợp 2: Người nhận OFFLINE (isOnline = false)

Không gửi được qua Socket.

Đẩy tin nhắn vào Offline Queue trong Redis (Sorted Set, xếp theo thời gian).

(Optional/Future): Trigger Push Notification (FCM/APNS) tại bước này.

3. Giai đoạn Đồng bộ (Sync/Offline Flow)
Luồng này xảy ra khi User B vừa mở mạng lên và kết nối lại (handleUserConnected).

Kiểm tra Queue: Server chọc vào Redis xem User B có tin nhắn chờ không (getOfflineMessages).

Gửi Batch: Nếu có, Server gửi toàn bộ danh sách tin nhắn qua event messages:sync.

Lưu ý: Code hiện tại đang dùng emit thường, nên sửa thành emitWithAck để đảm bảo an toàn.

Cập nhật trạng thái:

Đánh dấu tất cả tin nhắn đó là DELIVERED trong DB (Bulk Update).

Gửi event báo cho những người gửi (User A, C...) biết là User B đã nhận được tin rồi.

Dọn dẹp: Xóa tin nhắn khỏi Redis Queue.
4. Các trường hợp Lỗi & Edge Cases (Summary)

Messaging – Error Handling & Resilience Scenarios

Scenario: Spam tin nhắn

System Behavior: Block ngay tại Guard, trả lỗi RATE_LIMIT_EXCEEDED

Handled By: ws-throttle.guard.ts

Scenario: Gửi tin rác / sai format

System Behavior: Validate tại Pipe, trả lỗi VALIDATION_ERROR

Handled By: ws-validation.pipe.ts

Scenario: Mạng chập chờn (client gửi trùng request)

System Behavior: Idempotency chặn duplicate, trả về kết quả cũ, không tạo tin nhắn mới

Handled By: message.service.ts

Scenario: User offline

System Behavior: Message được lưu vào Redis Queue và sync lại khi user online

Handled By: message-queue.service.ts

Scenario: Server crash trong lúc gửi → client không nhận ACK → client retry

System Behavior: Retry từ client, idempotency đảm bảo không tạo message trùng

Handled By: message.service.ts

Scenario: BigInt serialization crash

System Behavior: Lỗi hiện tại – TypeError khi serialize BigInt

Required Fix: Sử dụng helper safeJSON để handle BigInt

Handled By: messaging.gateway.ts