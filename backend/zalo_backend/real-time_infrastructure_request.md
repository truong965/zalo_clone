Mục tiêu là xây dựng hạ tầng Real-time (Socket/WebSocket) đủ vững chắc cho production, trước khi triển khai bất kỳ tính năng Chat nào.

Context quan trọng:
Việc vội vàng code tính năng Chat khi Socket Infrastructure chưa ổn định sẽ dẫn đến:

Race Conditions

Message Loss

Zombie Connections
khi số lượng user tăng lên.

Vì vậy, chúng ta sẽ chưa viết bất kỳ dòng code nào cho Chat cho đến khi hoàn thành và validate đầy đủ checklist hạ tầng bên dưới.

YÊU CẦU CHUNG

KHÔNG viết code

Trình bày dưới dạng Technical Specification / Implementation Plan

Tư duy production-grade, enterprise-level

Giải thích rõ mục tiêu, lý do và rủi ro nếu bỏ qua từng hạng mục

1. TỔNG QUAN KIẾN TRÚC (HIGH-LEVEL ARCHITECTURE)

Hệ thống cần chuyển từ Single Node sang Cluster-ready Architecture, gồm 3 lớp:

Load Balancer (Nginx / Cloud LB): phân phối traffic, sticky session

Socket Server Cluster (NestJS instances): xử lý kết nối, auth, realtime logic

Redis Adapter Layer (Pub/Sub): trung gian giao tiếp giữa các node

2. SCALABILITY & CLUSTER SUPPORT

Mục tiêu: Hệ thống hoạt động đúng với 2, 5, 10+ server instances.

Redis Socket.IO Adapter

Vai trò trong cross-node message delivery

Rủi ro nếu chỉ dùng memory adapter

Sticky Session tại Load Balancer

Vì sao Socket.IO handshake cần sticky

Hệ quả nếu handshake rơi vào node khác

3. CONNECTION RELIABILITY (ĐỘ TIN CẬY KẾT NỐI)

Mục tiêu: Kết nối ổn định trong điều kiện mạng kém.

Heartbeat / Ping-Pong tuning

pingInterval, pingTimeout

Ảnh hưởng tới Online/Offline detection

Client-side Reconnection Strategy

Exponential Backoff

Tránh Thundering Herd khi server restart

Graceful Shutdown

Xử lý SIGTERM / SIGINT

Quy trình shutdown an toàn khi deploy

4. STATE MANAGEMENT (QUẢN LÝ TRẠNG THÁI)

Mục tiêu: Biết chính xác user nào đang online/offline.

Redis-based Presence System

Redis là source of truth

TTL, consistency, failure scenarios

Socket Registry (UserId ↔ SocketId)

Multi-device login

Fan-out notification strategy

5. SECURITY & GUARDRAILS

Mục tiêu: Bảo vệ hệ thống khỏi spam, abuse và payload độc hại.

Socket Rate Limiting

Giới hạn event / giây

Ngăn spam & resource exhaustion

Payload Validation

DTO / Validation pipeline cho WebSocket

Ngăn payload quá lớn / malformed

Global Exception Handling for WS

Không crash process

Chuẩn hóa error response cho client

6. OBSERVABILITY (GIÁM SÁT & DEBUG)

Mục tiêu: Có khả năng quan sát và truy vết sự cố production.

Structured Logging

Các field bắt buộc: SocketId, UserId, EventName, Latency

Metrics & Monitoring

socket_connected_total

socket_messages_received_per_second

socket_errors_total

Alerting strategy

7. KẾ HOẠCH THỰC HIỆN (ƯU TIÊN)

Hãy đề xuất thứ tự triển khai hợp lý, ví dụ:

Hạ tầng Redis + Socket Cluster communication

Logging & Exception Handling

Presence & State Management

Security guardrails (Rate limit, validation)

Output mong muốn:
Một bản Real-time Infrastructure Blueprint đủ chi tiết để đội backend có thể triển khai tuần tự và tự tin tiến tới core messaging mà không gặp rủi ro kiến trúc.