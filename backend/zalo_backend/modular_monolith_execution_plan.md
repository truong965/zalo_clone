# Kế hoạch Thực thi: Chuyển đổi sang Kiến trúc Microservice Ready (Modular Monolith)

Kế hoạch này vạch ra các bước cụ thể để tái cấu trúc backend Zalo Clone từ một Monolith lộn xộn (chủ yếu ở lớp Socket) thành một **Modular Monolith** chuẩn mực. Ở trạng thái này, các ranh giới domain được phân định rạch ròi, sẵn sàng để tách thành các microservice độc lập bất kỳ lúc nào mà không cần viết lại logic lõi.

**Nguyên tắc chung (Rules of Engagement):**
*   **Không code tính năng mới (Feature Freeze):** Trong suốt quá trình này, chỉ tập trung refactor cấu trúc.
*   **Test từng phần (Incremental):** Xong phase nào, deploy/vuốt app phase đó để đảm bảo API và Socket vẫn hoạt động bình thường.
*   **Code là nguồn sự thật duy nhất:** Mọi thay đổi phải bám sát cấu trúc hiện có.

---

## Giai đoạn 1: Dọn dẹp Transport Layer (Giải cứu Socket Gateway)

**Mục tiêu:** Biến [SocketModule](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/socket/socket.module.ts#47-88) thành một "kẻ ngu ngốc" - nó chỉ biết nhận data từ nơi khác và đẩy xuống client TCP/WebSocket. Nó hoàn toàn không được biết "bạn bè là gì", "cuộc gọi là gì".

**Các bước thực hiện:**
1.  **Chuyển dời Listeners:**
    *   Di chuyển `friendship-notification.listener.ts` từ `src/socket/listeners/` sang `src/modules/friendship/listeners/`.
    *   Di chuyển `contact-notification.listener.ts` sang `src/modules/contact/listeners/`.
    *   Di chuyển `call-ended.listener.ts` sang `src/modules/call/listeners/`.
    *   Di chuyển `qr-login-socket.listener.ts` sang `src/modules/auth/listeners/` (hoặc module xử lý QR).
2.  **Định nghĩa Standard Socket Interface (Broker/Adapter):**
    *   Trong thư mục share (`src/common/events` hoặc `src/shared`), định nghĩa một interface chuẩn (VD: `ISocketEmitter` hoặc một Event chuẩn như `socket.broadcast`).
3.  **Thay đổi logic phát Event:**
    *   Các Listener (sau khi được dời về Domain của mình) sẽ lắng nghe Event nghiệp vụ (ví dụ: `friendship.accepted`). Sau khi xử lý nghiệp vụ, thay vì gọi thẳng `socketGateway.emitToUser(...)` (điều khiến nó phải import SocketModule), nó sẽ bắn ra một hệ thống sự kiện trung gian, ví dụ: `this.eventEmitter.emit('socket.outbound', payload)`.
4.  **Làm sạch SocketModule:**
    *   Trong [SocketGateway](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/socket/socket.gateway.ts#36-661), tạo một listener duy nhất lắng nghe `socket.outbound`. Khi nhận được, lập tức đẩy xuống client.
    *   Xóa toàn bộ các import ngược trong [socket.module.ts](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/socket/socket.module.ts): Bỏ `AuthModule`, `FriendshipModule`, `PrivacyModule`.

---

## Giai đoạn 2: Tách Rời (Decouple) Khóa Ngoại Cơ Sở Dữ Liệu

**Mục tiêu:** Xóa bỏ sự phụ thuộc chéo ở cấp độ Database (Prisma). Trạng thái lý tưởng là nếu ta mang `schema.prisma` cắt làm 3 mảnh cài vào 3 database khác nhau, hệ thống vẫn không bị sụp (crash) ở tầng cơ sở dữ liệu.

**Các bước thực hiện:**
1.  **Rà soát Schema (`schema.prisma`):**
    *   Đánh dấu tất cả các `relation` (quan hệ) chéo giữa các Domain. Ví dụ bảng [Conversation](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/shared/redis/redis-key-builder.ts#274-281) (thuộc Domain Chat) tham chiếu đến bảng [User](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/socket/socket.gateway.ts#511-532) (thuộc Domain Identity).
2.  **Chuyển từ Physical Relation sang Logical Relation:**
    *   Xóa bỏ các khóa ngoại cứng (`@relation`) nối giữa 2 Domain khác nhau.
    *   Thay bằng trường ID dạng chuỗi/số đơn thuần. Lấy ví dụ, thay vì `user User @relation(fields: [userId], references: [id])`, chỉ để lại `userId String`.
3.  **Refactor Logic Truy vấn (Queries):**
    *   Sửa toàn bộ các lệnh Prisma bị ảnh hưởng. Nếu code cũ dùng `include: { user: true }`, thì nay phải fetch bằng 2 bước:
        *   Bước 1: Lấy [Conversation](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/shared/redis/redis-key-builder.ts#274-281).
        *   Bước 2: Domain Chat gọi một **Internal API/Service** (hoặc bắn Event) sang Domain Identity để xin thông tin User dựa trên `userId`.
4.  **Tối ưu Response (Composition/Aggregation):**
    *   Sử dụng Redis cache hoặc DataLoader ở cấp độ Service để việc ghép (join) dữ liệu logic bằng code không bị chậm hơn so với join bằng SQL. (Hiện dự án đã có [RedisKeyBuilder](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/shared/redis/redis-key-builder.ts#23-513) rất tốt để phục vụ việc này).

---

## Giai đoạn 3: Xây dựng Thư Viện Lõi (Shared Core Libraries)

**Mục tiêu:** Gom toàn bộ các thành phần hạ tầng (Infrastructure) không chứa nghiệp vụ vào các thư mục thư viện rỗng, để các Domain có thể import chung mà không bị dính chùm vào nhau.

**Các bước thực hiện:**
1.  **Gom Constants & Types:**
    *   Chuyển toàn bộ interfaces, enums, constants dùng chung vào `src/common` (hoặc tạo folder `libs/` giả lập tư duy Monorepo).
2.  **Tách [RedisKeyBuilder](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/shared/redis/redis-key-builder.ts#23-513) & Hạ tầng Caching:**
    *   Đảm bảo `src/shared/redis` hoàn toàn độc lập với các Domain. Hiện tại [RedisKeyBuilder](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/shared/redis/redis-key-builder.ts#23-513) đang làm rât tốt, giữ nguyên.
3.  **Tách Filters & Pipelines:**
    *   Chuyển các Exception Filters (như `ws-exception.filter.ts`), Validation Pipes, Authorization Guards (Throttler, AuthGuard) ra một Core Module riêng biệt.
4.  **Gỡ rối [SharedModule](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/shared/shared.module.ts#17-22):**
    *   Kiểm tra lại [src/shared/shared.module.ts](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/shared/shared.module.ts) (hiện chứa `DisplayNameResolver`). Đảm bảo module này không import ngược bất kỳ Domain Module nào.

---

## Giai đoạn 4: Thiết lập Internal API (Khế ước Giao tiếp - Contracts)

**Mục tiêu:** Chuẩn hóa cách các Domain Modular gọi lẫn nhau.

**Các bước thực hiện:**
1.  **Loại bỏ Direct Service Injection (Nếu có):**
    *   Tuyệt đối cấm sử dụng `forwardRef()`.
    *   Cấm Domain A chèn (inject) trực tiếp `DomainBService` để gọi hàm.
2.  **Xây dựng Facade / Proxy:**
    *   Nếu Domain A (VD: Messaging) cần lưu lịch sử Event (Domain Event Persistence), nó sẽ không gọi thẳng repo của Event.
    *   Nó sẽ tương tác qua bộ Event Emitter hiện tại.
    *   *Nhiệm vụ:* Liệt kê (Document) danh sách toàn bộ các Events đang chạy ngầm trong `EventEmitterModule`. Tạo một tệp `event-contracts.ts` quy định chặt chẽ TypeScript Interface cho từng Event payload.

---

## Giai đoạn 5: Chuẩn bị Cơ sở hạ tầng Chuyển đổi (Gateway Tương lai)

**Mục tiêu:** Setup một kiến trúc định tuyến để chuẩn bị cho bước nhấc (lift) một Domain ra thành Service độc lập mai sau.

**Các bước thực hiện:**
1.  **Dọn dẹp Controllers:**
    *   Kiểm tra tất cả các Route ở NestJS Controller. Phải đảm bảo Route Prefix rành mạch (VD: `/api/v1/auth`, `/api/v1/media`, `/api/v1/messages`).
    *   Không để tình trạng `/api/v1/users/messages` (bắt controller Users phải gánh việc fetch Messages). Trả nó về API của Messages.
2.  **Kiểm định với một Module Mẫu (Tùy chọn tương lai):**
    *   Module `MediaModule` đang là ứng cử viên sáng giá nhất vì nó làm việc với files và S3, dễ cô lập hoàn toàn CSDL và Logic.
    *   Khi quá trình refactor hoàn tất, Backend Zalo Clone đã chính thức "Microservice Ready". Nếu muốn, bạn ngay lập tức có thể bê thư mục `media` ra một source code rỗng của NestJS, dựng API Gateway là nó thành Microservice thực thụ.

---

## Giai đoạn 6: Stack Công Nghệ & Công Cụ Đề Xuất (The Tech Stack)

Phần này bổ sung các bộ công cụ cụ thể sẽ áp dụng trong quá trình quy hoạch lại mã nguồn (ưu tiên 100% mã nguồn mở/miễn phí, có sẵn hệ sinh thái NestJS).

### 1. Công cụ Giao tiếp Nội bộ (Inter-Module Communication)
Thay vì tự code các Interface gọi hàm thủ công, hãy áp dụng chuẩn của NestJS Microservices (ngay cả khi đang chạy Monolith) để code không bị sửa lại về sau:
*   **NestJS Cqrs (`@nestjs/cqrs`):** (Khuyên dùng số 1)
    *   Sử dụng **CommandBus** và **QueryBus** để gọi hàm chéo (Thay thế hoàn toàn cho cách Inject trực tiếp). Service A muốn lấy dữ liệu của Service B chỉ cần phát ra một Query Object, Handler của Service B sẽ bắt lấy nó.
    *   Sử dụng **EventBus** thay thế cho thư viện `EventEmitter2` hiện tại vì nó nằm gọn trong kiến trúc phân tán.
*   **NestJS Microservices (`@nestjs/microservices` với lớp TCP nội bộ):**
    *   Xây dựng hệ thống ClientProxy. Thay vì RabbitMQ, hãy để các module giao tiếp thông qua giao thức TCP cục bộ (Localhost). Khi tách server ra, chỉ cần đổi địa chỉ IP cấu hình.

### 2. Công cụ Cấu trúc Workspace (Monorepo)
*   **Nx (`nx.dev`):** (Khuyên dùng)
    *   Là công cụ chuẩn công nghiệp số 1 hiện nay cho NodeJS/Angular/React. Miễn phí và tích hợp sẵn plugin tự động cấu trúc lại NestJS thành Core Libs và Apps riêng rẽ trong vòng 1 lệnh CLI (`npx create-nx-workspace`). Giúp chia cắt và kiểm soát quyền import thư mục (Lint rule cực mạnh: Cấm Module A import libs của Module B).
*   **NestJS CLI Workspaces:** (Hàng nguyên bản)
    *   Chỉ cần chuyển đổi `nest-cli.json` sang chế độ Monorepo. Kém mạnh mẽ hơn Nx nhưng không tốn thời gian học lỏm.

### 3. Công cụ Gateways (Chỉ dùng khi **bắt đầu tách Service vật lý**)
*   **Có nên dùng ngay trong giai đoạn Refactor Modular Monolith không?**
    *   **KHÔNG.** Trong suốt 5 giai đoạn đầu (chạy chung 1 port Node.js), dùng API Gateway lúc này là "Over-engineering" (Mổ trâu dùng dao mổ gà). Lớp `AppController` hoặc `GlobalPrefix` của NestJS đã làm quá tốt việc định tuyến URL (`/api/v1/auth`, `/api/v1/media`). Thêm Gateway lúc này chỉ tổ tốn RAM và tăng độ trễ (latency) mạng vô ích.
*   **Khi nào mới thực sự cấu hình chúng?**
    *   Chỉ khi bạn quyết định **nhấc 1 thư mục code ra thành 1 server mới chạy ở Port/IP khác** (Ví dụ: Media Service chạy sang Port 4000). Gateway lúc này sẽ đứng trước mặt 2 server (Main Port 3000, Media Port 4000) để bẻ hướng Request của Frontend đi đúng đường mà Frontend không hề hay biết sự tồn tại của 2 server.
*   **Công cụ khuyên dùng lúc đó:**
    *   **Traefik API Gateway:** Rất hiện đại. Cực kỳ hợp với Docker/Docker-Compose. Nó có khả năng "Auto-Discovery" (Tự động tìm kiếm): Traefik tự động nhận diện service mới bật lên và tự tạo route điều phối request mà bạn gần như không cần viết code cấu hình file HTTP routing thủ công.
    *   **Nginx / HAProxy:** Các Reverse Proxy kinh điển để bẻ Route thủ công. Bền bỉ, siêu nhẹ, nhưng cấu hình file text khá bất tiện nếu môi trường Docker thay đổi liên tục.

### 4. Công cụ Xác thực Chéo (Cross-Boundary Auth)
*   Hiện tại Auth đang chạy qua Passport JWT cục bộ. Khi gọi chéo module, bạn cần phải duy trì ngữ cảnh User.
*   Sử dụng **`nestjs-cls`** (Dự án bạn đang cài sẵn rồi!) cực kỳ chuẩn xác. Context lưu trữ Token và UserID sẽ tự động lan truyền qua các lời gọi nội bộ (như In-memory event) mà không cần truyền payload lỉnh kỉnh.

---
**Kết quả Ký Tưởng:** Sau các giai đoạn này, mã nguồn Zalo Clone sẽ sở hữu độ "Rời rạc cao, Gắn kết thấp" (High Cohesion, Low Coupling), chạy siêu mượt trên 1 tiến trình Node.js, nhưng cấu hình tư duy thì không thua gì một hệ thống Microservice tỷ đô.
