# Báo cáo Đánh giá Kiến trúc Backend (Zalo Clone)

Dựa trên việc kiểm tra cấu trúc mã nguồn tại `backend/zalo_backend`, dưới đây là phân tích chi tiết giải đáp các thắc mắc của bạn về kiến trúc hiện tại, cách các thành phần giao tiếp và tại sao một số phần lại trở nên lộn xộn.

---

## 1. Kiến trúc Event (Event Architecture) đang sử dụng

Hệ thống hiện tại đang sử dụng **kiến trúc lai (Hybrid Event-Driven Architecture)**, kết hợp giữa Local Event và Phân tán (Distributed Pub/Sub):

- **Local Events (Sử dụng `@nestjs/event-emitter`)**: 
  - Được khai báo tại `app.module.ts` (`EventEmitterModule.forRoot()`).
  - Được sử dụng rộng rãi để decouple (giảm sự phụ thuộc) giữa các module. 
  - **Ví dụ cơ chế:** Khi có một sự kiện (như gửi tin nhắn hoặc thêm bạn bè), domain module (VD: `MessagingModule`) sẽ phát ra một sự kiện (emit event). Các Listener (VD: `SocketNotificationListener`) sẽ lắng nghe sự kiện này và xử lý các side-effect như đẩy thông báo qua WebSocket.
  - Đây là lý do kiến trúc được gọi là "PHASE 2" trong code, thay thế cho dependency chéo (`forwardRef()`) trước đây giữa Socket và Messaging.

- **Distributed Events (Sử dụng Redis Pub/Sub)**:
  - Redis Pub/Sub (`RedisPubSubService`) được dùng dành riêng cho **giao tiếp liên server (cross-server communication)** của WebSocket gateway.
  - Được dùng để đồng bộ trạng thái *Presence* (Online/Offline) của user giữa các instance (khi chạy đa instance hoặc cluster).

## 2. Giao tiếp giữa các module (Inter-Module Communication) mà không Inject trực tiếp

Các module hiện tại giao tiếp qua hai cách chính để tránh "Circular Dependency" (Lỗi phụ thuộc vòng):

- **Cách 1: Giao tiếp gián tiếp qua Event Emitter (Side-effects)**: Thay vì module A gọi hàm của module B, Module A chỉ phát ra một Event. Module B đăng ký Listener để tự động chạy logic khi Event đó xảy ra. (Ví dụ: Module Contact cập nhật danh bạ -> Bắn event -> Socket Module nhận event và đẩy real-time cho User).
- **Cách 2: Shared Module**: Codebase có file `src/shared/shared.module.ts` chứa các dịch vụ dùng chung xuyên suốt (như `DisplayNameResolver`). Shared module đóng vai trò là "Leaf Node" (Nút lá) - nó không bao giờ import các module chức năng khác, chỉ export ra để module khác dùng.

## 3. Cách Redis đang được triển khai và Lý do nằm ở thư mục `shared`

- **Tổ chức:** Cơ chế kết nối và Service thực thi của Redis được tổ chức chuẩn trị ở `src/modules/redis`.
- **Tại sao lại có Redis trong `src/shared`?**
  - Thư mục `src/shared/redis` thực chất chứa class `RedisKeyBuilder` (`redis-key-builder.ts`).
  - Lớp này là một **thiết kế cực tốt (Best Practice)**. Nó đóng vai trò là "Từ điển tập trung" cho toàn bộ khóa bảo mật (Redis Keys) trong hệ thống, với định dạng chuẩn: `DOMAIN:ENTITY:ID` (VD: `FRIENDSHIP:PENDING_REQUESTS:userId`).
  - Bằng cách để `RedisKeyBuilder` ở `shared` (dưới dạng một class static thuần túy), bất kỳ module nào cũng có thể import để format đúng tên key của module đó mà không cần phải import cả `RedisModule` to tướng, ngăn chặn việc gõ sai chuỗi string rải rác.

## 4. Tại sao thư mục `src/socket` lại "cực kỳ lộn xộn"?

Gateway WebSocket (`socket.gateway.ts`) nhìn qua thì rất gọn (không có chứa logic xử lý từng message cụ thể như chat, call). Nó chỉ đóng vai trò phân luồng connection, auth, presence.

Tuy nhiên, **thư mục `src/socket` lại cực kỳ lộn xộn vì nó đang vi phạm ranh giới của Domain-Driven Design (DDD)**:

1. **Gánh quá nhiều nghiệp vụ:** Trong `socket/listeners/`, nó chứa các file như `friendship-notification.listener.ts`, `contact-notification.listener.ts`, `call-ended.listener.ts`, v.v.
2. **Import ngược:** Vì chứa các listener trên, `SocketModule` lại phải import ngược `FriendshipModule`, `PrivacyModule`, `AuthModule` (xem trong `socket.module.ts`) chỉ để lấy các Service phục vụ thông báo.
3. **Phình to:** Thay vì biến thành một "Transport Layer" (chỉ nhận danh sách socket id và nội dung để gửi đi), Socket Module đang cố gắng hiểu "bạn bè là gì", "cuộc gọi kết thúc ra sao". 

### Cách khắc phục tình trạng của Socket Module:
- Đẩy toàn bộ các `*listener.ts` về đúng module của nó. Tức là `friendship-notification.listener.ts` phải nằm trong `src/modules/friendship`.
- Domain Module tự nhận event, xử lý logic, sau đó gọi phương thức (chẳng hạn `EventPublisher.emit('socket.broadcast', data)`) và `SocketGateway` chỉ cần lắng nghe đúng một sự kiện `socket.broadcast` để đẩy xuống Client. Nhờ vậy `SocketModule` sẽ sạch sẽ hoàn toàn và không cần biết các domain khác tồn tại.

---
### Kết luận tổng quan:
Backend của bạn đã có nỗ lực rất lớn trong việc áp dụng các kiến trúc tốt (như Event-Driven để gỡ rối, RedisKeyBuilder để quản lý Cache an toàn, Graceful Shutdown cho Connection). Mã nguồn có ý đồ rõ ràng, nhưng thư mục Socket đang trở thành một "bãi rác" chứa các Integration Logic. Refactor lại Socket Listener về các Domain tương ứng sẽ giúp kiến trúc đạt đến chuẩn mực rất cao.
