# SYSTEM AUDIT REPORT: ZALO CLONE ARCHITECTURE (SOCKET & REDIS)

**Date:** 2026-01-29
**Auditor:** Senior Engineering Manager
**Scope:** Socket Gateway, Redis Layer, Authentication, Database Interaction.
**Status:** **MVP / Proof of Concept** (Chưa sẵn sàng cho Production tải cao).

---

## I. MỨC ĐỘ NGHIÊM TRỌNG: CRITICAL (Phải sửa ngay để Scale)

Các vấn đề dưới đây sẽ khiến hệ thống sập ngay lập tức (Crash/Downtime) khi có lượng user truy cập đồng thời tăng đột biến (Spike traffic).

### 1. "OOM Killer" - Lấy toàn bộ danh sách User Online
* **Mô tả:** Hàm `getOnlineUsers()` thực hiện lệnh `zrange 0 -1` để lấy toàn bộ user ID từ Redis về RAM của server Node.js.
* **Nguyên nhân gốc rễ:** Tư duy xử lý dữ liệu nhỏ (Small Dataset Mindset). Không lường trước việc danh sách này có thể lên tới hàng trăm nghìn/triệu record.
* **Ảnh hưởng:**
    * **Crash Server:** V8 Heap Memory của Node.js bị tràn (Out of Memory) ngay lập tức khi danh sách lớn.
    * **Block Event Loop:** Việc serialize/deserialize mảng lớn chặn luồng chính, làm treo toàn bộ request khác.
* **Giải pháp:**
    * **Cấm tuyệt đối** dùng `0 -1` cho `ZRANGE` với dữ liệu không giới hạn.
    * Chỉ cung cấp API đếm tổng (`ZCARD`) hoặc kiểm tra trạng thái từng người (`ZSCORE`).
    * Nếu cần lấy danh sách, bắt buộc dùng **Pagination** (`ZSCAN` hoặc `ZRANGE` có limit/offset).

### 2. Database Spamming (Thundering Herd Problem)
* **Mô tả:**
    * Mỗi khi socket kết nối (`handleConnection`), hệ thống gọi trực tiếp vào DB để xác thực user (`prisma.user.findUnique`).
    * Hệ thống ghi log kết nối trực tiếp vào DB (`prisma.socketConnection.create`).
* **Nguyên nhân gốc rễ:** Thiếu lớp Caching Layer cho dữ liệu đọc nhiều (Read-heavy) và thiếu cơ chế Batching cho dữ liệu ghi nhiều (Write-heavy).
* **Ảnh hưởng:**
    * **DB Timeou/Crash:** Khi server socket restart, hàng nghìn client reconnect cùng lúc -> Hàng nghìn query bắn vào DB -> DB quá tải -> Toàn bộ hệ thống (cả API REST) bị sập.
* **Giải pháp:**
    * **Auth:** Áp dụng **Cache-Aside Pattern**. Lưu thông tin user profile tối giản (ID, status, passwordVersion) vào Redis. Đọc từ Redis trước, nếu miss mới gọi DB.
    * **Logger:** Sử dụng **Write-Behind Pattern** (Batch Processing). Đẩy log vào Redis List/Queue, dùng Worker gom 100 log rồi `insertMany` vào DB một lần.

### 3. Missing Redis Adapter (Siloed Servers)
* **Mô tả:** Dòng code khởi tạo Redis Adapter đang bị comment out.
* **Nguyên nhân gốc rễ:** Có thể do quên uncomment hoặc chưa config xong `RedisIoAdapter`.
* **Ảnh hưởng:**
    * **Mất kết nối người dùng:** Nếu triển khai > 1 instance server, User A (Server 1) nhắn tin cho User B (Server 2) sẽ không nhận được. Hệ thống bị phân mảnh (Siloed).
* **Giải pháp:** Uncomment và kích hoạt `RedisIoAdapter` ngay lập tức. Đảm bảo Adapter hoạt động trong `main.ts`.

---

## II. MỨC ĐỘ CAO: MAJOR (Ảnh hưởng kiến trúc & Data)

Các vấn đề này gây sai lệch dữ liệu, khó bảo trì và cản trở việc mở rộng hệ thống sang Redis Cluster.

### 4. Data Loss Risk với Pub/Sub thuần
* **Mô tả:** Sử dụng Redis Pub/Sub cơ bản (Fire-and-Forget) để trao đổi tin nhắn giữa các server.
* **Nguyên nhân gốc rễ:** Chọn sai công nghệ cho bài toán cần độ tin cậy cao (Reliability). Redis Pub/Sub không lưu lại tin nhắn nếu subscriber offline/crash.
* **Ảnh hưởng:**
    * **Mất tin nhắn:** Nếu Node.js Server bị restart hoặc crash đúng lúc có tin nhắn đến từ server khác -> Tin nhắn bay màu vĩnh viễn, user không nhận được.
* **Giải pháp:** Chuyển sang **Redis Streams** (`XADD`, `XREADGROUP`). Hỗ trợ Consumer Groups và cơ chế Acknowledge (ACK) để đảm bảo "At-least-once delivery".

### 5. Redis Cluster Incompatibility (Key Design)
* **Mô tả:** Các key Redis thiết kế dạng `user:{id}:sockets` và `user:{id}:status` nằm rời rạc.
* **Nguyên nhân gốc rễ:** Thiếu hiểu biết về **Hash Tags** trong Redis Cluster Sharding.
* **Ảnh hưởng:**
    * **Không thể Scale Redis:** Khi chuyển sang Redis Cluster (nhiều master node), các key của cùng 1 user sẽ nằm rải rác ở các node khác nhau. Các lệnh `Lua Script` hoặc `Pipeline` thao tác trên nhiều key của user đó sẽ bị lỗi `CROSSSLOT`.
* **Giải pháp:** Sử dụng **Hash Tags**. Đổi key thành `{user:id}:sockets`, `{user:id}:status`. Redis sẽ hash phần trong `{}` để đảm bảo chúng luôn nằm trên cùng 1 node.

### 6. Circular Dependency (Vòng lặp phụ thuộc)
* **Mô tả:** `SocketModule` import `MessagingModule` (dùng `forwardRef`) và ngược lại.
* **Nguyên nhân gốc rễ:** Coupling quá chặt giữa logic Socket (Giao vận) và Logic Business (Lưu trữ tin nhắn).
* **Ảnh hưởng:**
    * **Khởi động lỗi/chậm:** NestJS mất nhiều thời gian để resolve dependency.
    * **Spaghetti Code:** Khó tách thành Microservices sau này.
* **Giải pháp:** Sử dụng **Event-Driven Architecture**.
    * `MessagingModule` chỉ bắn Event (via `EventEmitter2` hoặc Redis).
    * `SocketModule` lắng nghe Event và đẩy xuống client.
    * Loại bỏ hoàn toàn `forwardRef`.

---

## III. MỨC ĐỘ TRUNG BÌNH: PERFORMANCE & CODE QUALITY

Các vấn đề về tối ưu tài nguyên và Clean Code.

### 7. Global Key Scanning (CPU Spike)
* **Mô tả:** Cron Job `cleanupZombieSockets` quét toàn bộ key Redis mỗi giờ.
* **Nguyên nhân gốc rễ:** Sử dụng mô hình "Proactive Cleanup" (Chủ động quét) thay vì "Reactive" (Phản ứng sự kiện).
* **Ảnh hưởng:**
    * Khi số lượng key lớn (triệu socket), việc scan này (dù dùng stream) vẫn tiêu tốn CPU Redis và Network I/O, gây lag (jitter) cho các kết nối realtime.
* **Giải pháp:** Cấu hình **Redis Keyspace Notifications** (`notify-keyspace-events Ex`). Server lắng nghe sự kiện key hết hạn (`expired`) để dọn dẹp dữ liệu liên quan. Không cần quét định kỳ.

### 8. Race Condition trong Logger Disconnect
* **Mô tả:** Khi user disconnect, hệ thống tìm record kết nối mới nhất dựa trên thời gian (`orderBy: connectedAt`) để update.
* **Nguyên nhân gốc rễ:** Dựa vào thời gian (vốn không chính xác tuyệt đối trong async) để định danh connection.
* **Ảnh hưởng:**
    * **Sai dữ liệu log:** Nếu user reconnect cực nhanh (mạng chập chờn), logic disconnect của phiên cũ có thể update nhầm vào phiên mới (do phiên mới vừa được tạo xong).
* **Giải pháp:** Gán `connectionId` (UUID của record DB) vào object `client` ngay khi connect. Khi disconnect, update chính xác theo `connectionId` đó.

### 9. Memory Leak Potential & GC Pressure
* **Mô tả:**
    * `SocketGateway` dùng `Map` (`clientSubscriptions`) để quản lý subscription thủ công.
    * Tạo Mock Request Object khổng lồ chỉ để lấy device fingerprint cho *mỗi* kết nối.
* **Nguyên nhân gốc rễ:** Quản lý state thủ công thay vì gắn vào lifecycle của object Socket.
* **Ảnh hưởng:**
    * **Memory Leak:** Nếu logic cleanup bị lỗi (exception), Map sẽ phình to mãi mãi.
    * **GC Pressure:** Tạo object thừa thãi gây áp lực cho Garbage Collector, làm giảm throughput.
* **Giải pháp:**
    * Gắn subscription vào chính object `client` (`client._subs`). Khi client disconnect -> GC tự thu hồi.
    * Refactor `DeviceFingerprintService` để nhận plain object thay vì Request object.

### 10. Anti-Pattern: Redis Init in Constructor
* **Mô tả:** `RedisService` khởi tạo kết nối I/O (`new Redis()`) ngay trong `constructor`.
* **Nguyên nhân gốc rễ:** Vi phạm nguyên tắc Dependency Injection và Lifecycle Management của NestJS.
* **Ảnh hưởng:**
    * **Khó Test:** Không thể mock Redis khi viết Unit Test.
    * **Không kiểm soát được lỗi:** Nếu Redis chết lúc start app, app sẽ crash theo cách không kiểm soát được (Unhandled Promise Rejection).
* **Giải pháp:** Chuyển logic kết nối vào `onModuleInit`.

---

## IV. TỔNG KẾT & LỘ TRÌNH KHẮC PHỤC

Hệ thống hiện tại có cấu trúc module tốt (NestJS standard) nhưng logic bên trong chưa sẵn sàng cho môi trường Production (Enterprise Grade).

### Ưu tiên 1 (Ngay lập tức - Fix before Feature):
1.  Uncomment **Redis Adapter**.
2.  Refactor Auth: Dùng **Redis Cache** thay vì DB.
3.  Sửa lỗi **OOM** `getOnlineUsers`: Bỏ `zrange 0 -1`.

### Ưu tiên 2 (Trong Sprint tới):
1.  Chuyển đổi Pub/Sub sang **Redis Streams**.
2.  Refactor Redis Keys (Hash Tags) để support Cluster.
3.  Xử lý Circular Dependency bằng Event Emitter.

### Ưu tiên 3 (Technical Debt):
1.  Batching cho Logger.
2.  Keyspace Notification cho Cleanup Job.
3.  Refactor Redis Service Lifecycle.