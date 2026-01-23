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