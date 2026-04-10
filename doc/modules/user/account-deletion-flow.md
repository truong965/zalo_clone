# Tài liệu Kỹ thuật: Quy trình Xóa Tài Khoản (Account Deletion Flow)

Hệ thống sử dụng mô hình **Anonymize & Asynchronous Purge** để tối ưu hóa trải nghiệm người dùng (UX) và đảm bảo hiệu năng hệ thống.

---

## 1. Tổng quan các Pha (Phases)

Quy trình được chia làm 2 giai đoạn chính:

### Pha 1: Ẩn danh tức thì (Synchronous Anonymization)
*   **Thời điểm:** Thực thi ngay khi người dùng nhấn nút "Xác nhận xóa" và nhập đúng mật khẩu.
*   **Mục tiêu:** Giải phóng tài nguyên định danh (Số điện thoại/Email) và ngắt truy cập ngay lập tức.
*   **Các bước thực hiện:**
    1.  **Đổi Số điện thoại:** Chuyển `phoneNumber` từ `+84...` sang `DEL_${timestamp}` (Ví dụ: `DEL_1712456789000`). Bước này giúp số điện thoại cũ được **tự do** để đăng ký tài khoản mới ngay lập tức.
    2.  **Xóa PII (Dữ liệu định danh):** Gán `email = null`, `avatar = null`, `displayName = "Người dùng Zalo"`.
    3.  **Cập nhật Trạng thái:** Chuyển `status = DELETED` và ghi nhận `deletedAt`.
    4.  **Hủy Phiên làm việc (Auth):** Gửi sự kiện `AUTH_SECURITY_REVOKED` để đăng xuất user khỏi tất cả thiết bị và ngắt kết nối Socket.
    5.  **Tạo Lệnh dọn dẹp:** Đưa một Job vào **BullMQ Queue** để xử lý các dữ liệu nặng ở nền.

### Pha 2: Dọn dẹp dữ liệu nền (Asynchronous Purge)
*   **Thời điểm:** Thực thi bởi `AccountPurgeWorker` sau Pha 1 (vài giây đến vài phút tùy tải hệ thống).
*   **Mục tiêu:** Dọn dẹp triệt để dữ liệu liên quan mà không làm treo API chính.
*   **Các bước thực hiện (Theo thứ tự an toàn):**
    1.  **Dữ liệu Auth:** Xóa cứng `tokens`, `devices`, `privacySettings`.
    2.  **Tin nhắn (Anonymize):** Chuyển `senderId = null` cho tất cả tin nhắn đã gửi. Nội dung được giữ lại để hội thoại của người khác không bị đứt đoạn.
    3.  **Media (Soft-delete):** Đánh dấu `deletedAt` cho các file đính kèm. `S3CleanupService` sẽ thực sự xóa file trên S3 sau 30 ngày.
    4.  **Social Graph:** Xóa tất cả `friendships`, `blocks`, `contacts`.
    5.  **Hội thoại:** Rút User khỏi mảng `participants` của tất cả các Nhóm chat (Conversation).
    6.  **Khác:** Xóa `Reminders`, `SearchQueries`, `CallParticipants`.
    7.  **Kết thúc:** **Xóa cứng (Hard Delete)** bản ghi User khỏi bảng `users`.

---

## 2. Cơ chế Chịu lỗi & Retry

Để đảm bảo tính toàn vẹn của dữ liệu, `AccountPurgeWorker` được thiết kế với các cơ chế sau:

### Idempotency (Tính khả kiến)
Mỗi bước trong Worker đều được viết dưới dạng "Atomic" (Nguyên tử).
- Sử dụng lệnh `deleteMany` hoặc `updateMany` dựa trên `userId`.
- Nếu job bị lỗi ở giữa chừng và thử lại, các bước đã hoàn thành trước đó sẽ không gây ra lỗi vì dữ liệu cũ đã không còn.

### Cấu hình Retry (BullMQ)
- **Attempts:** 3 lần. Nếu quá 3 lần vẫn lỗi, hệ thống sẽ dừng lại để chờ kiểm tra thủ công.
- **Exponential Backoff:** Thời gian chờ giữa các lần retry tăng dần (1s, 2s, 4s...) để tránh tạo áp lực liên tục lên Database khi hệ thống đang gặp sự cố.

---

## 3. Tại sao chọn mô hình này?

1.  **Tốc độ:** Người dùng thấy kết quả "Xóa thành công" chỉ trong chưa đầy 1 giây.
2.  **Khả dụng:** Số điện thoại được giải phóng ngay để tái sử dụng.
3.  **An toàn:** Ngắt hoàn toàn quyền truy cập ngay lập tức ở Pha 1.
4.  **Bền bỉ:** Dữ liệu lớn (như hàng vạn tin nhắn) được dọn dẹp dần dần ở nền, đảm bảo Database không bị khóa (Lock) hoặc quá tải.
