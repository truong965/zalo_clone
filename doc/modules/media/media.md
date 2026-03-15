# Module: Media

> **Cập nhật lần cuối:** 14/03/2026
> **Kiến trúc:** Microservice (`zalo_backend` + `zalo_media_worker`)
> **Swagger:** `/api/docs` (tags: `Media`)

---

## 1. Tổng quan

### 1.1 Phạm vi sở hữu

Media module quản lý **vòng đời tập tin đính kèm** (Image, Video, Audio, Document):

- **Zero-buffer upload**: Cấp phát S3 Presigned URL để Client upload trực tiếp lên Storage, không tốn RAM của backend API.
- **Serve Original Immediately**: Backend xử lý chuyển file sang thư mục `permanent/` và trả về public CDN URL **ngay lập tức** khi user xác nhận upload. Client hiển thị file tức thì mà không cần chờ.
- **Dedicated Media Worker**: Tách biệt hoàn toàn xử lý nặng (ảnh, video) sang một microservice riêng thông qua hàng đợi AWS SQS. Bảo vệ API backend không bị CPU throttling.
- **Background Processing**: Media Worker tĩnh lặng tạo thumbnail ảnh, nén ảnh tĩnh/động, trích xuất khung hình video ở background và cập nhật qua Socket khi xong.
- **Security Check**: Check Magic Bytes chống tệp giả mạo (thực hiện ở Worker nếu có xử lý, hoặc chặn từ Client/Backend).
- **Garbage Collection (S3 Cleanup)**: Cron job dọn các file upload dở dang (Stale) và quá hạn Soft Delete.

**Không** sở hữu:
- Gắn file vào tin nhắn → `MessageModule`
- Load file trong cuộc trò chuyện → `MessageModule`

### 1.2 Use cases

| Mã | Use case | Endpoint / Flow |
|---|---|---|
| UC-MD-01 | Khởi tạo upload tập tin | `POST /media/upload/initiate` |
| UC-MD-02 | Tải lên Avatar rút gọn | `POST /media/upload/avatar` |
| UC-MD-03 | Phê duyệt hoàn tất upload | `POST /media/upload/confirm` |
| UC-MD-04 | Kiểm tra trạng thái xử lý | `GET /media/:id` |
| UC-MD-05 | Lấy public stream/serve URL | `GET /media/serve/:id` (redirects to Presigned/CDN) |
| UC-MD-06 | Xóa mềm Media | `DELETE /media/:id` |
| UC-MD-07 | Xử lý ảnh kích thước chuẩn | Worker `ImageProcessor` |
| UC-MD-08 | Trích xuất ảnh bìa Video | Worker `VideoProcessor` |
| UC-MD-09 | Stream/Validate Audio/Thư mục | Worker `DirectFileProcessor` |
| UC-MD-10 | Dọn dẹp rác S3 tự động| Cron `S3CleanupService` chạy lúc 2:00 AM mỗi ngày |

---

## 2. Phụ thuộc module

### 2.1 Module imports

| Module | Vai trò |
|---|---|
| `SocketModule` | Phát (emit) % tiến trình xử lý file real-time |
| `BullModule` | Cung cấp Redis Queue engine khi `QUEUE_PROVIDER=redis` |

### 2.2 Providers (Kiến trúc Microservice)

| Provider | Nơi đặt | Vai trò |
|---|---|---|
| `MediaUploadService` | **Backend** | API verify upload, di chuyển S3 temp -> permanent, gán trạng thái `READY` và trả CDN URL. |
| `SqsMediaQueueService` | **Backend** | Đẩy Job vào AWS SQS (chỉ gửi Image/Video). |
| `MediaInternalController`| **Backend** | Endpoint nội bộ để Worker bắn webhook cập nhật tiến trình xử lý. |
| `SqsMediaConsumer` | **Worker** | Long-polling fetch Job từ SQS. |
| `ImageProcessor` | **Worker** | Tạo thumbnail và bản tối ưu WebP với Sharp. |
| `VideoProcessor` | **Worker** | Trích xuất thumbnail video với FFmpeg. |
| `S3CleanupService` | **Worker** | Dọn rác S3 tự động bằng vòng lặp cron job. |

### 2.3 Domain Events phát ra

| Event | Trigger | Payload chính |
|---|---|---|
| `media.uploaded` | `confirmUpload` sau khi File lên Temp | `mediaId`, `userId`, `mimeType`, `mediaType` |
| `media.processed` | Worker xử lý xong | `mediaId`, `userId`, `thumbnailUrl`, `cdnUrl` |
| `media.failed` | Worker retry hết số lần | `mediaId`, `userId`, `reason` |
| `media.deleted` | `deleteMedia` (Soft delete) | `mediaId`, `userId` |

### 2.4 Cross-module event consumers

| Event | Module / Listener | Hành vi |
|---|---|---|
| `media.processed` | Message / Conversation | Hiển thị tệp đính kèm trong phòng chat (thông qua Broadcast Socket) |
| *(Tiến trình Worker)* | `MediaInternalController` -> Socket | Worker gọi API nội bộ, Backend phát Socket `progress:{mediaId}` cho user |

---

## 3. API REST

> Xem chi tiết Request/Response tại Swagger UI: `/api/docs`

### MediaController (`/media`)

| Method | Endpoint | Mô tả |
|---|---|---|
| POST | `/media/upload/initiate` | Cấp phát Presigned PUT URL. Sinh `uploadId` |
| POST | `/media/upload/avatar` | Cấp phát Presigned PUT URL (bypass Worker). |
| POST | `/media/upload/confirm` | Check malware, validation size, move file vào hàng đợi |
| GET | `/media/:id` | Poll trạng thái quá trình (PENDING/PROCESSING/READY/FAILED) |
| GET | `/media/serve/:id` | Public resource streaming. Hỗ trợ query tham số `v=thumbnail|optimized` |
| DELETE | `/media/:id` | Soft delete. Thực vật lý xóa bởi CleanupService sau 30 ngày |

### 3.1 Rule nghiệp vụ

1. **Upload Bypass:** File Avatar không chui vào database báo cáo tiến trình (bảo vệ DB, giảm tải worker). Các tệp Media gửi thẳng vô chat mới lưu bảng `MediaAttachment`.
2. **Serve Original Immediately (UX tối ưu):** Bất kể file gì, khi upload xong gọi `/confirm`, Backend sẽ lập tức move file, set `READY` và trả về `cdnUrl` bản gốc. Frontend hiển thị ngay lập tức (Zero delay).
3. **Selective Background Queuing:** Background Worker chỉ nhận lệnh tạo Thumbnail cho `IMAGE` và `VIDEO`. Còn `AUDIO` và `DOCUMENT` không tốn CPU tạo thumbnail nên cắt đứt chuỗi sau khi `/confirm` (không vào Queue).
4. **Rate Limit Config:** `10 reqs / min` cho initiate upload thông thường và `5 reqs / min` cho avatar upload.
5. **Private CDN:** Trả `serve/:id` với short-lived Presigned Url GET để ngăn đánh cắp trực tiếp S3 Path cố định.

---

## 4. Kiến trúc kỹ thuật

### 4.1 Storage & Presigned URLs Flow

- Backend không nhận binary từ Frontend để chống OOM.
- **B1:** Client gọi `POST /initiate-upload`. Backend cấp `s3KeyTemp` (`temp/user_id/upload_id.ext`).
- **B2:** Client PUT binary lên `Presigned URL`.
- **B3:** Client gọi `POST /confirm`.
- **B4:** Backend kiểm tra S3 bằng `HeadObject`, atomic move file sang `permanent/...`, cập nhật DB `processingStatus = READY`, và trả về `cdnUrl` cho client.
- **B5 (Background):** Nếu là IMAGE/VIDEO, backend ném SQS message. Media Worker âm thầm lấy S3 stream tạo thumbnail và gọi API webhook báo cập nhật.

### 4.2 File Validation Security Check

| Loại Tệp | Check Engine | Security Layer |
|---|---|---|
| Toàn bộ cơ sở | `file-type` + `clamav` | Check Signatures Magic Bytes & Mã độc. |
| PNG/JPEG/WEBP | `sharp` | Block SVG Scripts, Size dimensions Check, Decode corruption. |
| MP4/MOV/AVI | `FFprobe` | Lọc Fake Video Format, Duration checks, Stream corruption |
| Document/Audio| Custom Scan Script | Nhận dạng Embedded Active Scripts trong PDF. |

### 4.3 S3 Cleanup & Garbage Collection Strategy

Cron chạy định kỳ hàng ngày (2:00 AM) bằng Module `@nestjs/schedule`:
1. **Multipart Upload Abort**: Clean các Part AWS nếu user rớt mạng lúc upload.
2. **Stale Processing Files**: Xóa file PENDING quá 24h (User gọi initiate xong không confirm).
3. **Failed Job Traces**: File rác sinh ra từ quy trình Worker vỡ/crash. Xóa sau 7 ngày.
4. **Soft Delete Collection**: Remove vật lý các Media đã bị User hoặc System xóa mềm (`deletedAt`) quá 30 ngày.

---

## 5. Lịch sử Refactor & Hoàn thiện (Phase 3)

Quá trình phân tích Module Phase 3 từng phát hiện 3 rủi ro/lỗi lớn. Các lỗi này đã được giải quyết triệt để thông qua kiến trúc Worker độc lập:

### 5.1 MD-R1: Đã giải quyết (S3 Orphaned Files)
*   **Lịch sử:** Khi cleanup `Failed Uploads` bị lỗi S3, file bị mồ côi (Orphan) nhưng DB vẫn xóa reference. 
*   **Giải pháp ứng dụng:** Code dọn rác được dời sang Media Worker. Đã thay đổi behavior để không gán `s3Key = null` nếu S3 DeleteObject thất bại, cho phép cron chạy lại vào ngày mai tiếp tục xóa.

### 5.2 MD-R2: Đã giải quyết (Monolithic Memory Hog)
*   **Lịch sử:** Xử lý `sharp` và `ffmpeg` nằm chung process với HTTP API NestJS gây CPU Throttling và nghẽn Socket.IO.
*   **Giải pháp ứng dụng:** Đã tách hoàn toàn thư mục sang `@zalo_media_worker`. Worker chạy trong terminal/process tách biệt, giao tiếp với API backend bằng AWS SQS queue. Backend giờ đây rất nhẹ.

### 5.3 MD-R3: Đã giải quyết (Race Condition ở File Confirm)
*   **Lịch sử:** Logic cũ bắt UI phải chờ đợi (Synchronous UX) 1 cái Queue chậm chạp xử lý xong ảnh/video, gây UX tê liệt (đợi 1-2 phút ảnh mới hiện).
*   **Giải pháp ứng dụng ("Serve Original Immediately"):** Loại bỏ hoàn toàn bottleneck. Khi client Confirm, Backend tự mình dời file S3 và đánh `READY` cấp `cdnUrl` tức thì. Frontend render ảnh gốc cực nhanh. Worker lùi về làm nền, chỉ tạo thumbnail nhỏ ở phía sau mà không block UI. Kiến trúc hoàn toàn async và hướng sự kiện.
