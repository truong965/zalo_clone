PHASE 1 – SOCKET INFRASTRUCTURE HARDENING

Scope: Rate limiting · Payload validation · Memory leak prevention · Enhanced logging
Mục tiêu tổng thể: Hệ thống socket ổn định dài hạn, không leak memory, an toàn khi scale, debug được trên production

1. RATE LIMITING (Socket Layer)
1.1 Socket Event Rate Limiting

Vị trí triển khai:
src/modules/socket/guards/ws-throttle.guard.ts

Mục tiêu:
Ngăn client spam event (VD: gửi 1000 message/giây) làm treo Socket Server hoặc Database

Ý nghĩa kỹ thuật:
HTTP rate limit không bảo vệ được WebSocket, nên bắt buộc phải chặn ngay tại tầng Socket

2. PAYLOAD VALIDATION (Defense Against Malformed Data)
2.1 WebSocket Validation Pipe

File:
src/modules/socket/pipes/ws-validation.pipe.ts

Mục tiêu:
Validate payload Socket giống như HTTP Controller

Rủi ro nếu thiếu:

Payload JSON quá sâu

String quá lớn

Object không đúng shape
→ Có thể gây crash hoặc memory spike

2.2 DTO cho Socket Events

File:
src/modules/socket/dto/socket-event.dto.ts

Ý nghĩa:

Chuẩn hóa contract client ↔ server

Giảm bug ngầm khi client gửi data sai format

3. MEMORY LEAK PREVENTION (CORE FOCUS) 🧹
3.1 Core Principles (Nguyên lý nền tảng)

Principle 1 – Lightweight Socket Context

Mỗi socket chỉ giữ thông tin tối thiểu

Tránh giữ object lớn theo số lượng kết nối

Principle 2 – Deterministic Cleanup

Cleanup theo sự kiện rõ ràng (connect / disconnect)

Không dựa vào GC “hy vọng nó sẽ dọn”

Principle 3 – Fail-safe (Defense in Depth)

Layer App: TTL + Cron cleanup logic

Layer Infra:
Container Healthcheck / K8s Liveness Probe
→ Nếu process Node.js vượt ngưỡng RAM hoặc event loop block quá lâu → restart pod (last resort)

3.2 Memory Risk Checklist & Mitigation
A. Node.js Heap (Server-side)

1. Socket User Context

Risk:
Lưu bio / description / text dài trong socket → heap tăng tuyến tính theo user

Best practice:
Context Minimization → chỉ giữ { id, role, name }

Severity: 🔴 Critical

2. Event Listeners

Risk:
Listener không remove → dangling references → GC không thu hồi

Giải pháp:
socket.removeAllListeners() khi disconnect

Severity: 🔴 Critical

3. Timers (setInterval / setTimeout)

Risk:
Timer không clear → memory leak phổ biến nhất

Giải pháp:

Wrapper registerSafeInterval, registerSafeTimeout

Lưu timer vào _cleanupTimers

Clear toàn bộ khi disconnect

Severity: 🔴 Critical

4. Closures

Risk:
Callback giữ reference object lớn trong scope cha

Giải pháp:

Stateless handling

Tránh function lồng sâu

Review kỹ socket.on

Severity: 🟡 High

B. Redis Strategy (Data Store Side)

5. Metadata Keys

Risk:
Server crash trước cleanup → Redis key tồn tại vĩnh viễn

Giải pháp:
BẮT BUỘC TTL cho mọi key

Severity: 🔴 Critical

6. Concurrency

Risk:
Nhiều server cleanup cùng lúc → race condition

Giải pháp:

Atomic operation

Lua Script cho check-and-delete

Severity: 🟡 High

7. Eviction Policy

Risk:
Redis đầy → xóa nhầm key quan trọng

Giải pháp:

volatile-lru (ưu tiên key có TTL)

hoặc allkeys-lru

Severity: 🟡 High

8. Blocking Commands

Risk:
KEYS → O(N) → Redis treo

Giải pháp:
BẮT BUỘC dùng SCAN / scanStream

Severity: 🔴 Critical

4. SOCKET CLEANUP FLOW (REFINED)
4.1 On Connection

Verify token → tạo SocketUserContext nhẹ

Khởi tạo _cleanupTimers = []

Ghi Redis metadata với TTL ngắn (VD: 3 phút)

4.2 Active Phase (Heartbeat)

Client gửi ping

Server refresh TTL Redis key

Grace Period Logic (NEW):

Không xóa ngay nếu miss 1 ping

Chỉ cleanup khi miss nhiều nhịp hoặc TTL hết

4.3 On Disconnect

Cleanup theo thứ tự deterministic:

Clear internal timers

Unsubscribe Redis Pub/Sub

Atomic cleanup Redis (Lua / Pipeline)

Cut references:

socket.removeAllListeners()

socket.user = null

4.4 Zombie Socket Handling

getAllActiveSockets + cleanupZombieSockets

Duyệt key bằng scanStream

getUserSockets (IMPORTANT):

Nếu metadata đã mất → tự động remove socketId khỏi user set (lazy cleanup)

5. SAFETY NET – CRON JOB & OBSERVABILITY
5.1 SocketCleanupJob (mỗi 15 phút)

Quét Redis bằng SCAN

Dọn rác logic còn sót

5.2 Metrics & Alerting (NEW)

Metric: metric_zombie_sockets_cleaned_count

Alert rule:

100 zombie / run → 🚨 RED ALERT
→ Có khả năng disconnect logic hoặc Redis timeout đang lỗi

6. ENHANCED LOGGING & ERROR HANDLING
6.1 WebSocket Exception Filter

File: ws-exception.filter

Business Logic Error

Dùng WsException

Client nhận payload chuẩn hóa

System / Crash Error

Filter bắt lỗi

Log stack trace

Không expose lỗi nội bộ cho client

6.2 Client Error Handling Pattern

Lắng nghe event error

Hiển thị toast / alert

Test validation bằng payload rác

KẾT LUẬN (FOR AI REVIEW)

Phase 1 tập trung stability > feature

Memory leak được xử lý đa tầng

Redis được dùng như source of truth

Có safety net khi logic fail

Sẵn sàng scale & production debugging


CHIẾN LƯỢC TEST (THE BATTLE PLAN)
Vì đây là lần đầu, chúng ta sẽ đi theo mô hình "Crawl, Walk, Run" (Bò, Đi, Chạy). Đừng chạy tất cả cùng lúc.

Bạn cần mở 3 Terminals:

Terminal 1 (Server): Chạy npm run start:dev (Theo dõi log server).

Terminal 2 (Monitor): Chạy docker stats (Theo dõi RAM/CPU của Redis & App nếu chạy docker) hoặc mở Task Manager.

Terminal 3 (Attacker): Để chạy lệnh test Artillery.

Giai đoạn 1: Sanity Check (Kiểm tra sức khỏe)
Mục tiêu: Đảm bảo kết nối thành công, Auth hoạt động.

Chạy lệnh:

Bash
npm run test:load
# (Tương ứng: artillery run basic-connection.yml)
Quan sát Terminal 1 (Server):

Thấy log: ✅ Socket authenticated: ... hiện lên liên tục.

Sau 30s thấy log: ❌ Socket disconnected....

Không có lỗi đỏ ERROR.

Kết quả mong đợi: Artillery báo cáo http.codes.200 (hoặc custom metric) và vusers.failed: 0.

Giai đoạn 2: Stress Test CPU & I/O (Message Flood)
Mục tiêu: Xem server chịu được bao nhiêu tin nhắn/giây.

Chạy lệnh:

Bash
npm run test:load:message-flood
Quan sát Terminal 1:

Log có thể trôi rất nhanh.

Chú ý log của WsThrottleGuard: Socket ... bị chặn do spam. Điều này chứng tỏ Rate Limit hoạt động tốt.

Quan sát Terminal 2 (Monitor):

CPU của Node.js process sẽ tăng cao. Nếu chạm 100% 1 Core -> Đó là giới hạn của bạn.

Giai đoạn 3: Memory Leak Detection (Bài kiểm tra quan trọng nhất)
Mục tiêu: Đảm bảo RAM không tăng mãi mãi.

Chuẩn bị: Trong Terminal 1, start server với cờ GC (nếu chưa có trong script start): node --expose-gc dist/main.

Chạy lệnh (Terminal 3):

Bash
# Test Connection Churn (Vào/Ra liên tục)
npm run test:load:connection-churn
Song song (Terminal 4 - Optional): Chạy Memory Profiler của bạn:

Bash
npm run test:memory
Đánh giá:

Sau khi test xong (3 phút), RAM phải giảm xuống (hình răng cưa).

Nếu RAM tạo thành hình bậc thang đi lên -> Leak.

Giai đoạn 4: Chaos Engineering (Phá hoại)
Mục tiêu: Test khả năng phục hồi.

Graceful Shutdown:

Bash
npm run test:graceful-shutdown
Lưu ý: Bạn cần phải tắt server thủ công ở Terminal 1 khi script yêu cầu.

Redis Failure:

Bash
npm run test:redis-failure
Lưu ý: Cần chạy Redis bằng Docker.

✅ CHECKLIST CUỐI CÙNG
[ ] Đã thêm handleTestMessage, handleTestSpam vào SocketGateway.

[ ] Đã sửa port thành 8000 trong redis-failure-sim.js.

[ ] Redis và Database đang chạy.

[ ] Đã cài đủ dependencies (npm install).

Bạn đã sẵn sàng. Hãy bắt đầu với Giai đoạn 1 và báo cho tôi biết kết quả! Good luck!
D:\HKII-2025-2026\zalo_clone\backend\zalo_backend\test\load-tests\processors\auth-processor.js
D:\HKII-2025-2026\zalo_clone\backend\zalo_backend\test\load-tests\scenarios\processors\auth-processor.js