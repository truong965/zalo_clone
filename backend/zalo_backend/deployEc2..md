Let me check the current production files before writing the guide:  

Read [](file:///d%3A/HKII-2025-2026/zalo_clone/backend/zalo_backend/docker-compose.prod.yml)

Read [](file:///d%3A/HKII-2025-2026/zalo_clone/backend/zalo_backend/env.production.example)

---

## Deploy lên EC2 — Hướng dẫn từng bước

### Bước 0 — Push code mới lên remote (local machine)

```bash
cd D:/HKII-2025-2026/zalo_clone
git add -A
git commit -m "migrate: S3 native + SQS + CloudFront avatar"
git push

# Build và push Docker image mới
cd backend/zalo_backend
docker build -t trungmai965/zalo_backend:latest .
docker push trungmai965/zalo_backend:latest
```

---

### Bước 1 — SSH vào EC2

```bash
ssh -i zalo_backend_key_pair.pem ubuntu@18.136.25.102
cd ~/zalo_backend   # hoặc thư mục deploy của bạn
```

---

### Bước 2 — Cập nhật `.env.production`

Đây là bước quan trọng nhất. Mở file và cập nhật:

```bash
nano .env.production
```

Kiểm tra và thay/thêm các dòng sau (giữ nguyên những key khác):

```env
# ─── XÓA hoàn toàn các dòng cũ nếu còn sót ───────────────────────────────
# MINIO_ROOT_USER=...        ← XÓA
# MINIO_ROOT_PASSWORD=...    ← XÓA
# S3_ENDPOINT=...            ← XÓA
# S3_FORCE_PATH_STYLE=...    ← XÓA
# AWS_ACCESS_KEY_ID=...      ← XÓA (IAM Instance Profile xử lý)
# AWS_SECRET_ACCESS_KEY=...  ← XÓA (IAM Instance Profile xử lý)
# QUEUE_PROVIDER=bull        ← thay bằng sqs (xem bên dưới)

# ─── THÊM/CẬP NHẬT ───────────────────────────────────────────────────────
S3_BUCKET_NAME=zalo-clone-media-production
AWS_REGION=ap-southeast-1
CLOUDFRONT_DOMAIN=cdn.zaloclone.me

QUEUE_PROVIDER=sqs
SQS_IMAGE_QUEUE_URL=https://sqs.ap-southeast-1.amazonaws.com/825765428570/zalo-media-image-queue
SQS_IMAGE_DLQ_URL=https://sqs.ap-southeast-1.amazonaws.com/825765428570/zalo-media-image-dlq
SQS_VIDEO_QUEUE_URL=https://sqs.ap-southeast-1.amazonaws.com/825765428570/zalo-media-video-queue
SQS_VIDEO_DLQ_URL=https://sqs.ap-southeast-1.amazonaws.com/825765428570/zalo-media-video-dlq
SQS_VISIBILITY_TIMEOUT_IMAGE=120
SQS_VISIBILITY_TIMEOUT_VIDEO=900
SQS_WAIT_TIME=20
```

Kiểm tra nhanh:

```bash
grep -E "MINIO|S3_ENDPOINT|QUEUE_PROVIDER|SQS_IMAGE|CLOUDFRONT" .env
# Kỳ vọng: KHÔNG thấy MINIO, KHÔNG thấy S3_ENDPOINT
# Phải thấy: QUEUE_PROVIDER=sqs, CLOUDFRONT_DOMAIN=cdn.zaloclone.me
```

---

### Bước 3 — Pull code + image mới

```bash
git pull origin main

docker compose -f docker-compose.prod.yml pull
```

---

### Bước 4 — Stop stack cũ và cleanup MinIO

```bash
# Dừng toàn bộ stack cũ
docker compose -f docker-compose.prod.yml down

# Xem các container còn sót (MinIO có thể vẫn chạy nếu compose cũ)
docker ps -a | grep -E "minio|zalo"

# Buộc xóa container MinIO nếu còn
docker rm -f zalo_minio_prod 2>/dev/null || true

# Xóa MinIO volume (giải phóng storage)
docker volume rm zalo_backend_minio_data 2>/dev/null || true
# Tên volume có thể khác, kiểm tra:
docker volume ls | grep minio
# → Xóa tất cả volume có chữ "minio"
docker volume ls | grep minio | awk '{print $2}' | xargs docker volume rm 2>/dev/null || true

# Xóa image MinIO không còn dùng
docker rmi minio/minio:latest 2>/dev/null || true
docker rmi minio/mc:latest 2>/dev/null || true

# Dọn toàn bộ dangling images/networks
docker system prune -f
```

Kiểm tra storage giải phóng:

```bash
df -h /
docker system df
```

---

### Bước 5 — Deploy stack mới

```bash
docker compose -f docker-compose.prod.yml up -d

# Theo dõi logs 30 giây đầu
docker compose -f docker-compose.prod.yml logs -f --tail=50 api
```

Những log **cần thấy** (không lỗi):

```
S3 Service initialized - Bucket: zalo-clone-media-production, Endpoint: AWS S3
SqsClientFactory initialised (region=ap-southeast-1)
SqsMediaConsumer: starting poll loop for image queue
SqsMediaConsumer: starting poll loop for video queue
Nest application successfully started
```

Những log **báo lỗi** cần xử lý:

| Log | Nguyên nhân | Fix |
|-----|-------------|-----|
| `InvalidClientTokenId` | Còn `AWS_ACCESS_KEY_ID` cũ trong `.env.production` | Xóa key đó |
| `SQS_IMAGE_QUEUE_URL must not be empty` | Thiếu SQS vars | Kiểm tra lại bước 2 |
| `NoSuchBucket` | Bucket chưa tạo hoặc tên sai | Kiểm tra `S3_BUCKET_NAME` |

---

### Bước 6 — Verify health

```bash
# Health check API
curl -s http://localhost:3000/api/v1/health | python3 -m json.tool

# Kiểm tra containers đang chạy (KHÔNG có minio)
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

Kết quả mong đợi — chỉ còn 4 container:
```
zalo_api_prod      Up (healthy)
zalo_postgres_prod Up (healthy)
zalo_redis_prod    Up (healthy)
zalo_nginx_prod    Up (healthy)
```

---

## Hướng dẫn test thủ công qua web

Truy cập `https://zaloclone.me` (hoặc IP EC2).

---

### Test 1 — S3: Upload ảnh trong chat

1. Mở một conversation bất kỳ
2. Click icon đính kèm → chọn một file ảnh (JPG/PNG, < 10MB)
3. Gửi tin nhắn
4. **Kiểm tra:** ảnh hiển thị được trong chat

**Verify trên AWS Console:**
- S3 → `zalo-clone-media-production` → `Browse` → thấy file trong `uploads/{userId}/...`
- URL của ảnh trong chat phải là dạng `https://api.zaloclone.me/api/v1/media/serve/...` (redirect về presigned S3 GET URL)

**Verify trên server:**
```bash
docker compose -f docker-compose.prod.yml logs api --tail=20 | grep -E "S3|upload|presigned"
```

---

### Test 2 — SQS: Image processing queue

1. Upload một ảnh trong chat (bước trên)
2. Ngay sau khi gửi, ảnh sẽ ở trạng thái `PROCESSING` → sau vài giây chuyển thành `PROCESSED`
3. Thumbnail và optimized version xuất hiện

**Verify trên AWS Console:**
- SQS → `zalo-media-image-queue` → **Send and receive messages** → **Poll for messages**
- Trong lúc xử lý: thấy 1 message `In Flight`
- Sau khi xử lý xong: **Approximate Number Of Messages** = 0

**Verify logs:**
```bash
docker compose -f docker-compose.prod.yml logs api --tail=30 | grep -E "SqsMedia|consumed|processed|image"
```

---

### Test 3 — SQS: Video processing queue

1. Upload một video nhỏ (< 50MB, .mp4)
2. Gửi tin nhắn
3. Chờ 30-60 giây → video playable trong chat

**Verify trên AWS Console:**
- SQS → `zalo-media-video-queue` → thấy message in-flight trong lúc transcode

---

### Test 4 — CloudFront Avatar: Group avatar

1. Tạo nhóm mới → trong màn hình tạo nhóm, upload ảnh đại diện
2. Tạo nhóm thành công
3. **Kiểm tra URL avatar của nhóm** — click chuột phải vào avatar → "Copy image address"

**URL mong đợi:**
```
https://cdn.zaloclone.me/avatars/{userId}/{id}.jpg
```
*(Không phải presigned S3 URL, không phải MinIO URL)*

**Verify trên S3:**
- S3 → `zalo-clone-media-production` → `avatars/` → thấy file

**Verify CloudFront headers:**
```bash
curl -Iv "https://cdn.zaloclone.me/avatars/<userId>/<id>.jpg" 2>&1 | grep -E "Via|X-Cache|Age|Server"
# Lần 1: X-Cache: Miss from cloudfront
# Lần 2: X-Cache: Hit from cloudfront  ← cache đang hoạt động
```

---

### Test 5 — DLQ: Kiểm tra error handling (optional)

Kiểm tra không có message nào stuck trong DLQ:

- AWS Console → SQS → `zalo-media-image-dlq` → **Approximate Number Of Messages** phải = 0
- SQS → `zalo-media-video-dlq` → tương tự = 0

Nếu thấy message trong DLQ:
```bash
docker compose -f docker-compose.prod.yml logs api | grep -E "ERROR|failed|retry|dlq" | tail -20
```

---

### Checklist tổng kết

| # | Feature | Test | Expected |
|---|---------|------|----------|
| 1 | S3 upload | Gửi ảnh trong chat | Ảnh hiển thị, URL dạng `/media/serve/...` |
| 2 | S3 serve | Xem ảnh đã gửi | Redirect 302 → presigned S3 GET URL |
| 3 | SQS image queue | Upload ảnh | PROCESSING → PROCESSED trong < 10s |
| 4 | SQS video queue | Upload video | Video playable sau < 60s |
| 5 | CloudFront avatar | Tạo nhóm có avatar | URL = `https://cdn.zaloclone.me/avatars/...` |
| 6 | DLQ empty | Check AWS Console | 0 messages trong cả 2 DLQ |
| 7 | No MinIO | `docker ps` | Không có container nào tên `minio` |