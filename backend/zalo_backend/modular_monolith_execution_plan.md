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

## Giai đoạn 6: Đánh giá Stack & Quyết định Công cụ (Tối ưu tách Microservice ít sửa code)

Sau khi hoàn tất 5 giai đoạn và đạt trạng thái microservice ready, mục tiêu của Giai đoạn 6 là:
- Giảm tối đa thay đổi code/logic nghiệp vụ khi tách 1 module thành service độc lập.
- Chuẩn hóa lớp giao tiếp để chỉ thay adapter/transport, không sửa domain core.

### 1. Đánh giá các công cụ đã gợi ý

#### 1.1 NestJS CQRS (`@nestjs/cqrs`)
- Đánh giá: Tốt khi cần command/query/event rõ ràng và scale nhiều team.
- Rủi ro nếu áp dụng toàn hệ thống ngay: tốn refactor lớn, dễ biến thành "đổi framework nội bộ" thay vì tách service.
- Kết luận: **Dùng chọn lọc**, không rollout đại trà.
    - Chỉ áp dụng cho luồng cross-domain phức tạp hoặc cần audit mạnh.
    - Với các port/contracts hiện có, giữ cách gọi hiện tại để tránh churn.

#### 1.2 NestJS Microservices với TCP nội bộ
- Đánh giá: Hữu ích cho thử nghiệm nhanh, nhưng TCP nội bộ không phải lựa chọn bền vững cho production (độ bền message, quan sát, retry policy).
- Kết luận: **Không chọn TCP nội bộ làm chuẩn dài hạn**.
    - Nếu cần transport message bus, ưu tiên broker phổ biến hơn (NATS hoặc RabbitMQ).

#### 1.3 Nx (`nx.dev`)
- Đánh giá: Rất mạnh về boundary lint, affected graph, task cache; chuẩn công nghiệp cho monorepo lớn.
- Rủi ro hiện tại: dự án đã ổn định cấu trúc modular monolith; migrate sang Nx ngay có thể phát sinh đổi cấu trúc build/test CI không cần thiết.
- Kết luận: **Hoãn migrate Nx ở thời điểm này**.
    - Khi số service/app tăng (>= 3 backend apps độc lập), lúc đó chuyển Nx sẽ có lợi rõ ràng.
    - Trước mắt dùng lint boundary + dependency graph để giữ kỷ luật import.

#### 1.4 API Gateway (Traefik / Nginx / HAProxy)
- Đánh giá: Đúng như kế hoạch, chưa cần ở runtime monolith một process.
- Kết luận: **Chỉ bật khi có service tách vật lý**.
    - Docker-first: Traefik rất hợp vì auto-discovery.
    - Cấu hình tĩnh, đơn giản: Nginx vẫn rất phổ biến và ổn định.

#### 1.5 `nestjs-cls`
- Đánh giá: Rất phù hợp cho context propagation trong cùng process.
- Kết luận: **Giữ dùng cho in-process**.
    - Lưu ý: CLS không đi xuyên network boundary; khi tách service phải truyền context qua header/message metadata.

### 2. Công cụ thay thế/phổ biến hơn nên cân nhắc

#### 2.1 Message Broker khi tách service
- **NATS (khuyến nghị ưu tiên):** nhẹ, nhanh, request/reply + pub/sub thuận tiện, rất hợp cho giai đoạn tách dần.
- **RabbitMQ (phổ biến rộng):** ecosystem lớn, routing linh hoạt, phù hợp nếu team đã quen AMQP.
- Quyết định đề xuất: bắt đầu với NATS cho độ đơn giản vận hành; chỉ dùng RabbitMQ nếu tổ chức đã chuẩn hóa AMQP.

#### 2.2 Contract-first cho API nội bộ
- Duy trì event-contracts và internal API ports hiện tại.
- Bổ sung OpenAPI cho sync contract và AsyncAPI cho event contract (nếu mở rộng event bus).
- Mục tiêu: khi tách service chỉ đổi adapter gọi network, không đổi DTO/domain logic.

#### 2.3 Boundary enforcement thay cho migrate Nx sớm
- Áp dụng ESLint boundary rule + dependency-cruiser/madge trong CI để cấm import chéo domain trái luật.
- Đây là phương án ít xáo trộn hơn Nx nhưng vẫn giữ được kỷ luật kiến trúc.

### 3. Quyết định stack chốt cho giai đoạn "tách thật"

#### 3.1 Nguyên tắc bất biến
- Domain core không import framework transport.
- Mọi giao tiếp qua port/interface + contract package dùng chung.
- Adapter in-process và adapter remote cùng implement một contract.

#### 3.2 Lộ trình ít sửa code/logic nhất
1. Giữ modular monolith runtime như hiện tại.
2. Chuẩn hóa hết cross-domain calls vào port contracts (đã làm phần lớn ở giai đoạn 4-5).
3. Với module đầu tiên tách ra (đề xuất Media):
     - Tạo remote adapter (HTTP hoặc NATS) implement cùng port.
     - Giữ nguyên service nghiệp vụ ở module caller.
     - Chuyển binding DI từ local adapter sang remote adapter bằng config flag.
4. Chỉ sau khi chạy ổn định mới đưa Gateway (Traefik/Nginx) vào đường đi frontend.

#### 3.3 Bộ công cụ khuyến nghị cuối cùng
- Runtime monolith: NestJS hiện tại + EventEmitter contracts + `nestjs-cls`.
- Messaging khi tách: NATS.
- Gateway khi tách vật lý: Traefik (Docker) hoặc Nginx (cấu hình tĩnh).
- Governance: ESLint boundary + dependency-cruiser/madge trong CI.
- Monorepo orchestration: tạm giữ hiện trạng; đánh giá Nx lại khi số backend app tăng.

#### 3.4 Nếu hiện tại chưa tách service nào thì dùng gì ngay lập tức?
- **Nên dùng ngay:**
    - `nestjs-cls` để giữ request context nhất quán trong cùng process.
    - `event-contracts` + internal API ports đã có, tiếp tục coi đây là source of truth cho giao tiếp nội bộ.
    - ESLint boundary rule + dependency-cruiser/madge trong CI để chặn import chéo domain sai kiến trúc.
    - OpenAPI cho HTTP contract nội bộ/public nếu chưa chuẩn hóa đầy đủ tài liệu.
- **Có thể dùng nhưng không bắt buộc ngay:**
    - `@nestjs/cqrs` chỉ cho những luồng mới thật sự phức tạp, không cần thay toàn hệ thống hiện tại.
- **Chưa nên dùng lúc này:**
    - NATS.
    - RabbitMQ.
    - Traefik / Nginx / HAProxy ở vai trò API Gateway.
    - Nx migration.
    - NestJS Microservices TCP nội bộ.

Kết luận thực dụng:
- Nếu **chưa tách service**, stack nên áp dụng ngay chỉ nên là các công cụ **bảo vệ kiến trúc và chuẩn hóa contract**, không phải các công cụ transport phân tán.
- Nói ngắn gọn: dùng `nestjs-cls`, contract-first, và boundary enforcement; hoãn broker/gateway/monorepo migration cho đến khi có service vật lý đầu tiên.

#### 3.5 Kế hoạch thực thi chi tiết cho phần "Nên dùng ngay"

Phần này bám theo trạng thái code hiện tại:
- `nestjs-cls` đã được bật global trong `src/app.module.ts`.
- Swagger/OpenAPI đã có trong `src/main.ts`.
- `event-contracts` và internal API ports đã tồn tại trong `src/common/contracts`.
- ESLint hiện chưa có boundary rule, CI hiện chưa có job kiểm tra kiến trúc độc lập.

##### A. Chuẩn hóa `nestjs-cls` trong toàn backend

**Mục tiêu**
- CLS không chỉ "được bật", mà phải trở thành chuẩn duy nhất để đọc request context trong cùng process.

**Hiện trạng**
- Đã có `ClsModule.forRoot({ global: true, middleware: { mount: true } })`.
- Đã thấy usage trong `jwt-auth.guard.ts` và `database/prisma.service.ts`.

**Các bước thực hiện**
1. Xác định và chốt schema context dùng chung:
    - `requestId`
    - `userId`
    - `sessionId` hoặc `deviceId` nếu có
    - `roles` hoặc permission summary nếu thực sự cần
2. Tạo hoặc chuẩn hóa một file contract cho CLS context trong `src/common`:
    - Ví dụ: `src/common/contracts/request-context.ts`
    - Mục đích: tránh việc mỗi nơi tự đặt key string khác nhau.
3. Chuẩn hóa điểm set context:
    - Guard xác thực set `userId`, `roles`
    - Middleware/interceptor set `requestId`
    - Không cho service tự nhét dữ liệu tùy tiện vào CLS.
4. Rà soát và thay thế các luồng đang truyền `userId` kiểu kỹ thuật qua nhiều tầng chỉ để phục vụ logging/audit nếu CLS đã đủ.
5. Bổ sung rule review:
    - Service có thể đọc CLS.
    - Domain event payload không được phụ thuộc CLS ngầm; nếu cần dữ liệu nghiệp vụ thì vẫn phải truyền explicit qua payload.

**Validation**
- Build pass.
- Ít nhất 1 request HTTP đi qua guard -> service -> prisma log/audit vẫn giữ đúng `userId/requestId`.
- Không phát sinh phụ thuộc CLS vào network/event boundary.

**Acceptance Criteria**
- Có contract CLS keys rõ ràng.
- Có đúng 1 cách chuẩn để truy cập request context.
- Team guideline ghi rõ: CLS chỉ là in-process context, không phải cross-service contract.

##### B. Củng cố `event-contracts` + internal API ports thành nguồn sự thật

**Trạng thái triển khai (2026-03-17)**
- Đã mở rộng event registry theo catalog runtime tại:
    - `src/common/contracts/events/event-names.ts`
    - `src/common/contracts/events/event-contracts.ts`
- Đã bổ sung ownership registry cho internal API ports tại:
    - `src/common/contracts/internal-api/port-ownership.registry.ts`
    - `src/common/contracts/internal-api/index.ts`
- Build backend đã pass sau thay đổi contract (`npm run build`).

**Mục tiêu**
- Mọi giao tiếp nội bộ mới phải đi qua contract layer hiện có, không phát sinh shape tự do trong service/listener.

**Hiện trạng**
- Đã có:
  - `src/common/contracts/events/event-names.ts`
  - `src/common/contracts/events/event-contracts.ts`
  - `src/common/contracts/internal-api/*`
- Event payload map đã được mở rộng để bao phủ các event runtime chính theo `doc/architecture/04-EVENT-CATALOG.md`.

**Các bước thực hiện**
1. Tạo inventory chuẩn cho tất cả event runtime đang dùng:
    - emitter class/service
    - event name
    - payload hiện tại
    - listener owner
2. Phân loại event thành 3 nhóm:
    - transport/internal technical events
    - domain events
    - socket outbound events
3. Mở rộng `event-contracts.ts` theo thứ tự ưu tiên:
    - Event đã được nhiều module tiêu thụ
    - Event liên quan realtime/call/reminder/auth
    - Event có nguy cơ sai shape cao
4. Chốt quy tắc cho internal API ports:
    - Port chỉ chứa capability liên domain
    - Không đưa business thừa vào port
    - Tên token/interface phải phản ánh owner domain
5. Bổ sung review checklist:
    - Event mới phải được đăng ký vào contract map trước khi merge
    - Cross-module sync call mới phải dùng port thay vì import service concrete
6. Đồng bộ docs:
    - Event catalog
    - ownership notes cho từng port

**Validation**
- Build pass.
- Không có event name mới nằm ngoài contract registry trong phạm vi đã audit.
- Owner module export đúng token đã công bố.

**Acceptance Criteria**
- `src/common/contracts` là nguồn sự thật duy nhất cho internal contracts.
- Event/listener quan trọng không còn dùng payload shape "ngầm" không tài liệu.
- Port nào đã public thì có owner rõ ràng và adapter binding rõ ràng.

##### C. Thiết lập boundary enforcement trong lint và CI

**Mục tiêu**
- Chặn kiến trúc xấu ngay từ pull request thay vì phát hiện muộn sau refactor.

**Hiện trạng**
- `eslint.config.mjs` mới có rule chung, chưa có boundary rule.
- `.github/workflows/backend-deploy.yml` hiện là deploy pipeline, chưa có job riêng cho kiến trúc/lint/build/test.
- Chưa thấy `dependency-cruiser` hoặc `madge` trong `package.json`.

**Các bước thực hiện**
1. Chọn công cụ phân tích phụ thuộc:
    - Ưu tiên `dependency-cruiser` cho rule-based enforcement.
    - Có thể thêm `madge` cho visualization/cycle scan đơn giản.
2. Cài dev dependencies cần thiết.
3. Tạo config boundary:
    - cấm `src/modules/<A>` import concrete service của `src/modules/<B>`
    - cho phép import từ `src/common`, `src/shared`, contract packages
    - cho phép import token/interface từ `src/common/contracts/*`
4. Tạo script trong `package.json`:
    - `lint:arch`
    - `check:cycles`
    - nếu cần: `check:boundaries`
5. Tạo workflow CI riêng cho backend hoặc mở rộng workflow hiện có:
    - checkout
    - install
    - build
    - lint
    - `lint:arch`
    - test scope tối thiểu
6. Thiết lập fail-fast rule:
    - import chéo domain concrete service -> fail CI
    - circular dependency ở scope module -> fail CI hoặc warning theo mức độ

**Validation**
- Cố tình tạo một import sai kiến trúc trong nhánh thử nghiệm -> CI phải fail.
- Build/lint hiện tại vẫn pass sau khi thêm rule cho code hợp lệ.

**Acceptance Criteria**
- PR mới không thể merge nếu phá boundary rule.
- Có script local để dev tự chạy trước khi push.
- Boundary rule phản ánh đúng kiến trúc hiện tại, không quá chặt đến mức cản tiến độ vô lý.

##### D. Chuẩn hóa OpenAPI cho HTTP contract nội bộ/public

**Mục tiêu**
- Swagger hiện có phải được nâng lên thành contract artifact dùng được trong review và tách service.

**Hiện trạng**
- `src/main.ts` đã setup Swagger ở môi trường non-production.
- Chưa có dấu hiệu export spec thành file artifact trong CI.

**Các bước thực hiện**
1. Audit decorators của controller/DTO:
    - route quan trọng có `@ApiTags`, `@ApiOperation`, response DTO cơ bản
    - internal controllers được tag riêng, ví dụ `Internal - Media`
2. Quy ước tách nhóm route trong docs:
    - public API
    - internal API
    - admin API
3. Bổ sung script export OpenAPI JSON:
    - generate spec từ app bootstrap hoặc script dedicated
    - output vào thư mục docs/contracts hoặc artifact build
4. Đưa export spec vào CI:
    - build spec
    - lưu artifact
    - nếu cần, diff với baseline khi có thay đổi route quan trọng
5. Đồng bộ route manifest với Swagger để tránh tài liệu viết tay bị lệch.

**Validation**
- Có file OpenAPI JSON sinh ra ổn định.
- Route public/internal/admin phản ánh đúng cấu trúc hiện tại.
- Frontend và backend có thể đối chiếu contract từ artifact thay vì đọc code thủ công mọi lần.

**Acceptance Criteria**
- OpenAPI không chỉ là UI dev, mà là contract asset trong pipeline.
- Route mới/sửa route đều có dấu vết trong spec.
- Internal API chuẩn bị sẵn cho bước remote adapter hóa sau này.

##### E. Thứ tự triển khai khuyến nghị
1. CLS contract + usage guideline.
2. Boundary enforcement local scripts.
3. CI architecture job.
4. Event contract expansion + port ownership review.
5. OpenAPI artifact export + docs alignment.

Lý do thứ tự này:
- CLS và boundary rules cho hiệu quả ngay, ít rủi ro.
- CI phải đứng sau local script để tránh làm gãy pipeline quá sớm.
- Contract expansion và OpenAPI artifact cần làm sau khi guardrail đã có để tránh tiếp tục phát sinh lệch chuẩn.

##### F. Deliverables cụ thể
- 1 file contract cho request context keys/types.
- 1 bộ scripts package cho lint kiến trúc.
- 1 config dependency rules.
- 1 workflow CI backend quality gate.
- 1 bản event/port ownership checklist cập nhật.
- 1 OpenAPI JSON artifact flow trong pipeline.

##### G. Definition of Done
- CLS được chuẩn hóa và documented.
- Internal contracts là source of truth thật sự, không chỉ tồn tại trên giấy.
- CI chặn được import chéo domain sai kiến trúc.
- OpenAPI trở thành artifact kiểm soát contract, không chỉ là Swagger UI để xem tay.

### 4. Kết luận thực thi
- Không có công cụ "tuyệt đối tốt nhất" cho mọi bối cảnh.
- Với mục tiêu **giảm tối đa sửa code/logic khi tách service**, chiến lược tốt nhất là:
    - Contract-first + adapter swap + transport-agnostic domain.
    - Tránh migration công cụ lớn (như Nx full migration, CQRS toàn hệ thống) ở thời điểm chưa cần.

---
**Kết quả Ký Tưởng:** Sau các giai đoạn này, mã nguồn Zalo Clone sẽ sở hữu độ "Rời rạc cao, Gắn kết thấp" (High Cohesion, Low Coupling), chạy siêu mượt trên 1 tiến trình Node.js, nhưng cấu hình tư duy thì không thua gì một hệ thống Microservice tỷ đô.
