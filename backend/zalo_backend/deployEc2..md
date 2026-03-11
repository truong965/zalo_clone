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