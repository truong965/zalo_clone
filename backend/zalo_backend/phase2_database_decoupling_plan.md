# Kế hoạch Thực thi Chi tiết - Giai đoạn 2: Tách rời Khóa ngoại CSDL (Database Decoupling)

Dựa trên việc phân tích trực tiếp file [schema.prisma](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/prisma/schema.prisma) hiện tại, đây là kế hoạch chi tiết và đảm bảo an toàn tuyệt đối để gỡ bỏ sự phụ thuộc vật lý (Foreign Keys) giữa các Domain. 

## 1. Phân Tích Hiện Trạng (Dựa trên [schema.prisma](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/prisma/schema.prisma))
Tất cả các module hiện đang dính chặt vào bảng [User](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/socket/socket.gateway.ts#511-532) thông qua `@relation`. Ví dụ:
- **Social**: [Friendship](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/modules/friendship/friendship.module.ts#67-96), [Block](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/shared/redis/redis-key-builder.ts#362-370), `UserContact` đều chứa quan hệ `@relation` tới [User](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/socket/socket.gateway.ts#511-532).
- **Messaging**: [Message](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/shared/redis/redis-key-builder.ts#80-81), `ConversationMember` chứa quan hệ tới [User](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/socket/socket.gateway.ts#511-532). [Message](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/shared/redis/redis-key-builder.ts#80-81) lại liên kết tới `MediaAttachment`.
- **Call**: `CallHistory`, `CallParticipant` liên kết tới [User](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/socket/socket.gateway.ts#511-532) và [Conversation](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/shared/redis/redis-key-builder.ts#274-281).

**Rủi ro:** Khi xóa `@relation`, tất cả các đoạn code sử dụng `include: { user: true }` hoặc `include: { message: true }` trong `this.prisma...findMany()` sẽ bị báo lỗi TypeScript và crash.

**Giải pháp (Data Composition):** Thay vì nhờ PostgreSQL JOIN dữ liệu, tầng Application (Service) sẽ tự làm việc đó. 
Ví dụ luồng lấy tin nhắn mới:
1. `MessageService` lấy 20 tin nhắn (được 1 mảng các `senderId`).
2. `MessageService` gọi `IdentityFacade.getUsersByIds([senderId1, senderId2])`.
3. Map thông tin User vào từng tin nhắn rồi trả về cho Client. (Sử dụng hệ thống Redis Cache để đảm bảo độ trễ gần như bằng không).

---

## 2. Chiến lược Tách lớp (Iterative Decoupling)

Tuyệt đối không gỡ toàn bộ `@relation` trong 1 lần commit (Big Bang). Chúng ta sẽ làm từng Domain một, từ dễ đến khó (Core).

### Bước 2.1: Cô lập Media Service (Dễ, Rủi ro thấp)
Media là một tính năng độc lập, đã được trích xuất một phần ra Worker.
*   **Hành động trên Prisma:**
    *   Trong model `MediaAttachment`:
        *   Giữ lại: `messageId BigInt? @map("message_id")`
        *   Giữ lại: `uploadedBy String @map("uploaded_by") @db.Uuid`
        *   **Xóa bỏ:** `message Message? @relation(...)` và `uploader User @relation(...)`
    *   Trong model [Message](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/shared/redis/redis-key-builder.ts#80-81) và [User](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/socket/socket.gateway.ts#511-532): Xóa các mảng ngược lại (`mediaAttachments` và `uploadedMedia`).
*   **Hành động trên Code:**
    *   Sửa các API lấy thông tin Media để fetch chay không qua `include: { uploader: true }`.

### Bước 2.2: Cô lập Call Service (Trung bình)
Call Module là một sub-domain khá rõ ràng, liên kết chủ yếu đến User và Conversation.
*   **Hành động trên Prisma:**
    *   Trong `CallHistory` & `CallParticipant`: 
        *   Giữ ID: `initiatorId`, `conversationId`, `userId`, `kickedBy`.
        *   **Xóa bỏ:** Các dòng `@relation` tương ứng trỏ tới [User](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/socket/socket.gateway.ts#511-532) và [Conversation](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/shared/redis/redis-key-builder.ts#274-281).
    *   Trong [User](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/socket/socket.gateway.ts#511-532), [Conversation](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/shared/redis/redis-key-builder.ts#274-281): Xóa các mảng `callsMade`, `callParticipations`, `kickedCalls`, `calls`.
*   **Hành động trên Code:**
    *   Sửa `CallHistoryService` (đặc biệt là API lấy lịch sử cuộc gọi). Lấy danh sách Call, sau đó query thủ công sang `ConversationModule` và `UserModule/SharedModule` để lấy tên Group và tên người gọi để append vào response.

### Bước 2.3: Cô lập Social Graph (Trung bình khá)
Các bảng danh bạ, bạn bè, block chặn đứng độc lập khỏi Chat nhưng phụ thuộc chặt vào User Identity.
*   **Hành động trên Prisma:**
    *   Trong [Friendship](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/modules/friendship/friendship.module.ts#67-96): Xóa quan hệ `user1`, `user2`, `requester`, `actionUser` (Giữ nguyên các cột foreign key ID định dạng `String`).
    *   Trong [Block](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/shared/redis/redis-key-builder.ts#362-370): Xóa quan hệ `blocker`, `blocked`.
    *   Trong `UserContact`: Xóa quan hệ `owner`, `contactUser`.
    *   Trong [User](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/socket/socket.gateway.ts#511-532): Xóa các mảng `sentFriendRequests`, `receivedFriendRequests`... 
*   **Hành động trên Code:**
    *   Refactor `FriendshipService.getFriendsList()`. Thay vì `include: { user2: true }`, ta fetch list id, rồi gọi `IdentityFacade.getProfiles(ids)`.

### Bước 2.4: Cô lập Trái tim hệ thống - Messaging (Cực khó, Làm cuối cùng)
*   **Hành động trên Prisma:**
    *   Tách rời [Conversation](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/shared/redis/redis-key-builder.ts#274-281), `ConversationMember`, `GroupJoinRequest` và [Message](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/shared/redis/redis-key-builder.ts#80-81) khỏi bảng [User](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/socket/socket.gateway.ts#511-532).
    *   Trong [Message](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/shared/redis/redis-key-builder.ts#80-81): Giữ chiều dọc ([Conversation](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/shared/redis/redis-key-builder.ts#274-281) -> [Message](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/shared/redis/redis-key-builder.ts#80-81)) vì chúng cùng Domain. Nhưng xóa chiều ngang ([Message](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/shared/redis/redis-key-builder.ts#80-81) -> [User](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/src/socket/socket.gateway.ts#511-532) của `sender`).
*   **Hành động trên Code:**
    *   Đây là phần tốn sức nhất. Mọi API lấy danh sách chat, tin nhắn đều phải viết lại logic mapping. Sử dụng triệt để DataLoader pattern để gom batch các IDs cần query User, tránh lỗi N+1 queries.

---

## 3. Tiêu chí Hoàn thành (Definition of Done) cho giai đoạn 2
1. File [schema.prisma](file:///d:/HKII-2025-2026/zalo_clone/backend/zalo_backend/prisma/schema.prisma) có thể cắt vật lý văn bản thành 4 file (`schema.identity.prisma`, `schema.chat.prisma`, `schema.social.prisma`, `schema.call.prisma`) mà Prisma Compiler không báo lỗi reference thiếu bảng.
2. Mã nguồn biên dịch thành công (`npm run build`).
3. App chạy mượt mà, API List Messages, Call History, Friend List hiển thị đầy đủ avatar/tên người dùng giống hệt lúc chưa tách CSDL. Độ trễ (Latency) không được tăng đáng kể (nhờ cache Redis).

## Ý kiến người dùng
Xin hãy phản hồi xem bạn có đồng ý đi từng bước nhỏ (Bắt đầu với 2.1 Media) theo kế hoạch này không? Việc này đảm bảo ta có thể test cẩn thận mà không làm sụp đổ toàn bộ app Zalo.
