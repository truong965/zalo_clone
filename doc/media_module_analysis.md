# Phân Tích Hệ Thống Xử Lý Media (Media Module & Worker)

Tài liệu này mô tả chi tiết quy trình xử lý media trong hệ thống Zalo Clone, từ lúc người dùng bắt đầu upload đến khi file được tối ưu hóa và sẵn sàng phục vụ.

## 1. Luồng Upload và Lưu Trữ (Media Upload Flow)

Hệ thống sử dụng kỹ thuật **Direct Upload to S3** (Upload trực tiếp từ Client lên Storage) để giảm tải cho server API. Quy trình gồm 3 giai đoạn chính:

### Giai đoạn 1: Khởi tạo (Initiate)
- **API**: `POST /media/upload/initiate`
- **Xử lý tại `MediaUploadService.initiateUpload`**:
    1. Kiểm tra loại file (Image, Video, Audio, Document) dựa trên extension và mimeType.
    2. Kiểm tra giới hạn dung lượng file từ cấu hình (`upload.config.ts`):
        - Ảnh (Image): 10MB mặc định.
        - Video: 100MB mặc định.
        - Audio: 20MB mặc định.
        - Tài liệu (Document): 25MB mặc định.
    3. Tạo một bản ghi `MediaAttachment` trong cơ sở dữ liệu với trạng thái `PENDING`.
    4. Tạo một đường dẫn tạm thời (temp key) trên S3: `temp/${userId}/${uploadId}`.
    5. Trả về một **Presigned URL** (URL có hiệu lực tạm thời) cho phép Client có quyền `PUT` file trực tiếp lên S3.

### Giai đoạn 2: Tải lên (Upload)
- Client thực hiện lệnh `PUT` dữ liệu binary của file lên Presigned URL đã nhận. Việc này diễn ra trực tiếp giữa trình duyệt/mobile và AWS S3/MinIO, không đi qua server backend.

### Giai đoạn 3: Xác nhận (Confirm)
- **API**: `POST /media/upload/confirm`
- **Xử lý tại `MediaUploadService.confirmUpload`**:
    1. Xác minh file đã tồn tại trên S3 bằng bộ công cụ `S3Service.verifyFileExists` (có cơ chế retry để đảm bảo tính nhất quán dữ liệu).
    2. Chuyển file từ thư mục tạm (`temp/`) sang thư mục chính thức (`permanent/`) bằng lệnh copy nguyên tử (atomic move).
    3. Cập nhật trạng thái bản ghi thành `READY` và gán URL CloudFront chính thức.
    4. Nếu là **Ảnh** hoặc **Video**, hệ thống sẽ đẩy một Task vào hàng đợi xử lý (Queue) để Worker thực hiện các bước tối ưu tiếp theo.

---

## 2. Vai Trò của `zalo_media_worker`

Worker là một dịch vụ chạy độc lập, chuyên xử lý các tác vụ tiêu tốn nhiều tài nguyên (CPU/RAM).

### Xử lý Hình ảnh (`ImageProcessor`)
Sử dụng thư viện **Sharp** với quy trình tối ưu:
1. **Chuyển đổi sang WebP**: Tất cả các định dạng đầu vào (PNG, JPG, HEIC...) đều được chuyển về định dạng **WebP**.
2. **Tạo Thumbnail**: Tạo một ảnh nhỏ kích thước 150x150 (crop cover), chất lượng 80% để hiển thị trong danh sách chat.
3. **Tạo bản Optimized**: Nếu ảnh gốc có kích thước quá lớn (> 2048px), Worker sẽ tạo thêm một bản WebP được thu nhỏ về mức tối đa 2048px với chất lượng 85% để xem nhanh.
4. **Cơ chế Streaming**: Worker đọc file từ S3 dưới dạng Stream, đi qua Sharp và đẩy ngược lên S3 cũng dưới dạng Stream. Điều này giúp hệ thống không cần load toàn bộ file vào RAM, tránh lỗi Out-Of-Memory.

### Xử lý Video (`VideoProcessor`)
Sử dụng thư viện **FFmpeg**:
1. **Trích xuất ảnh đại diện (Thumbnail)**: Worker tìm vị trí 10% thời lượng video (hoặc frame đầu tiên nếu video quá ngắn) để chụp lại một tấm ảnh JPEG làm ảnh cover.
2. **Transcoding (Tương lai)**: Hệ thống đã thiết kế luồng chuyển đổi sang HLS (HTTP Live Streaming) để hỗ trợ adaptive bitrate, nhưng hiện tại đang tạm tắt để tiết kiệm tài nguyên server (EC2 RAM).

---

## 3. Tại sao lại chuyển đổi thành WebP và Optimized Variants?

Việc ép kiểu toàn bộ ảnh về WebP và tạo ra các phiên bản khác nhau (variants) là một quyết định kỹ thuật quan trọng dựa trên các yếu tố sau:

### Tối ưu hoá dung lượng (Compression)
- **WebP** có hệ số nén tốt hơn **25-34%** so với JPEG và vượt xa PNG. Điều này giúp giảm chi phí lưu trữ trên S3 và giảm băng thông truyền tải (Egress) từ CDN.

### Tăng tốc độ trải nghiệm Mobile (Performance)
- Trong một ứng dụng trò chuyện, tốc độ tải là ưu tiên hàng đầu.
- Thay vì bắt user tải một ảnh PNG gốc nặng 5MB, hệ thống chỉ trả về bản **Thumbnail WebP 20KB**. Khi user nhấn vào xem chi tiết, hệ thống trả về bản **Optimized 300KB**. Người dùng nhận được nội dung gần như lập tức.

### Tính tương thích và đồng nhất (Uniformity)
- Người dùng có thể upload các file đặc thù như `.heic` từ iPhone mà nhiều trình duyệt cũ hoặc thiết bị Android đời thấp không hiển thị được.
- Bằng cách convert tất cả về **WebP/JPEG**, hệ thống đảm bảo mọi thiết bị trong mạng lưới đều có thể xem được media một cách ổn định.

### Xử lý an toàn (Security & Reliability)
- Việc server backend không trực tiếp nhận file giúp ngăn chặn các cuộc tấn công DDoS qua file lớn hoặc khai báo sai dung lượng file (Payload too large).
- File gốc luôn được giữ lại trong thư mục `permanent`, cho phép người dùng "Tải ảnh gốc" nếu cần, trong khi các bản tối ưu chỉ phục vụ mục đích hiển thị nhanh.
