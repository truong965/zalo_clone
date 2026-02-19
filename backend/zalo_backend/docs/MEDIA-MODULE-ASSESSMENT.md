# Media Module — Code Assessment Report

**Date**: 2025-01-XX  
**Scope**: `src/modules/media/` — so sánh với `ARCHITECTURE.md` & `01-AWS-ARCHITECTURE-MVP.md`  
**Target**: 10K users, 3K concurrent, $200/6 tháng, single EC2 instance  
**Phương pháp**: Đánh giá từng file, cross-reference với architecture docs, phân loại theo mức độ ưu tiên  

---

## 📊 TÓM TẮT NHANH

| Hạng mục | Trạng thái | Mức nghiêm trọng |
|----------|-----------|------------------|
| Upload flow (presigned URL → confirm) | ✅ Đúng kiến trúc | — |
| Queue system (Bull/Redis vs SQS) | ✅ Quyết định: dùng SQS free tier | RESOLVED |
| Storage (MinIO vs AWS S3) | ✅ Quyết định: S3 production, MinIO local dev | RESOLVED |
| ClamAV malware scanning | ❌ Over-engineering cho MVP | HIGH |
| HLS video transcoding | ❌ Over-engineering cho MVP | HIGH |
| MetricsService (cron mỗi phút) | ⚠️ Không cần thiết ở MVP scale | MEDIUM |
| S3CleanupService (đã comment out) | ⚠️ Cần bật hoặc dùng S3 Lifecycle thay thế | MEDIUM |
| MediaProgressGateway (separate WebSocket) | ⚠️ Nên dùng chung Socket.IO gateway | MEDIUM |
| Event-driven communication | ❌ Không emit event nào cả | HIGH |
| File naming (.ts.ts extension) | ❌ Bug cấu trúc | LOW |
| PrismaService import trực tiếp | ⚠️ Vi phạm shared module pattern | LOW |

---

## 1. KIẾN TRÚC TỔNG QUAN — ĐÚNG / SAI SO VỚI DOCS

### 1.1 Upload Flow ✅

**Architecture doc mô tả:**
```
Client → GET /media/upload-url → presigned URL
Client uploads directly to S3
Client → POST /media/confirm-upload
Background worker processes media
```

**Code thực tế:**
```
POST /media/upload/initiate → presigned URL + DB record (PENDING)
Client uploads directly to S3
POST /media/upload/confirm → verify S3 → enqueue processing
Bull worker picks up job → download, validate, process, move to permanent
```

**Đánh giá**: Flow cơ bản **đúng** với kiến trúc. Endpoint naming hơi khác (initiate vs upload-url) nhưng logic tương đương. Presigned URL expiry mặc định 300s (5 phút) — docs nói 15 phút. **Nhỏ, không critical.**

---

### 1.2 Queue System — ✅ QUYẾT ĐỊNH: Chuyển sang SQS

**Quyết định**: Dùng **AWS SQS** (free tier) thay vì Bull/Redis cho production.

**Lý do chọn SQS:**
- Free tier: 1M request/tháng → MVP ước tính ~500K jobs/tháng → **$0**
- Built-in DLQ (Dead-Letter Queue) — docs yêu cầu, Bull không có
- Serverless — không tốn RAM trên EC2 (không cần Redis riêng cho queue)
- Retry + visibility timeout tích hợp sẵn
- FIFO queue đảm bảo thứ tự xử lý

**Lộ trình migration Bull → SQS:**
- `BullModule` trong `media.module.ts` → xóa, thay bằng SQS client (`@aws-sdk/client-sqs`)
- `MediaQueueService` → rewrite: enqueue = `sqs.sendMessage()`, stats = `sqs.getQueueAttributes()`
- `MediaConsumer` (`@Processor`) → rewrite thành cron polling (`@Cron('*/30 * * * * *')`) + `sqs.receiveMessage()` (long polling)
- `queue.config.ts` → đổi từ Redis config sang SQS URL/ARN config
- **Queue URLs cần tạo trên AWS:**
  - `media-processing.fifo` + DLQ `media-processing-dlq.fifo`
  - `cleanup-jobs` (standard queue)

**Không ảnh hưởng:** Codebase hiện tại Bull và SQS đều chạy trên cùng EC2, logic xử lý trong processor/consumer **không thay đổi**.

---

### 1.3 Event-Driven Communication ❌ THIẾU

**Architecture doc mô tả:**
```
MediaService.confirmUpload() → Emit event: 'media.uploaded'
Worker hoàn thành → Emit event: 'media.processed'
```
Các module khác (search_engine, notification) listen những event này.

**Code thực tế:**
- **KHÔNG CÓ** `EventEmitter` hoặc `eventEmitter.emit()` ở bất kỳ đâu trong media module
- `search-event.listener.ts` đã có handler `@OnEvent('media.uploaded')` nhưng **không ai emit event này**
- Schema có `EventType.MEDIA_UPLOADED` và `EventType.MEDIA_DELETED` nhưng media module không dùng

**Đánh giá**: Đây là **vi phạm nghiêm trọng** nguyên tắc event-driven monolith. Media module hoạt động như "island" — không thông báo cho hệ thống khi media được upload/xử lý xong. Search engine sẽ không index media mới, notifications sẽ không gửi.

**Cần bổ sung:**
- `media.uploaded` — khi `confirmUpload()` thành công
- `media.processed` — khi worker hoàn thành (status READY)
- `media.failed` — khi processing fail hết retries
- `media.deleted` — khi media bị soft-delete

---

### 1.4 S3 Bucket Structure — Sai lệch nhẹ

**Architecture doc:**
```
uploads/temp/{uploadId}/{filename}
uploads/final/{userId}/{messageId}/
processed/images/{messageId}/
processed/thumbnails/{messageId}/
```

**Code thực tế:**
```
temp/{cuid}_{originalName}                    → InitiateUpload
permanent/{year}/{month}/unlinked/{md5hash}   → After processing
Thumbnails/optimized sử dụng suffix: {name}-thumbnail.webp, {name}-optimized.webp
```

**Đánh giá**: Structure khác nhưng logic tương đương. Code dùng `permanent/` thay vì `uploads/final/` + `processed/`. Dùng date-based partitioning (`permanent/2025/01/`) là tốt cho S3 performance. **Không cần sửa, chỉ cần update docs cho khớp.**

---

### 1.5 Storage — MinIO (dev) vs AWS S3 (production) ✅ QUYẾT ĐỊNH: Chuyển sang S3

**Hiện trạng:**
- Local dev: MinIO chạy trong `docker-compose.yml` (port 9000/9001)
- `s3.config.ts` đã thiết kế switch giữa MinIO và S3 chỉ qua env vars:
  - `S3_ENDPOINT` set → `forcePathStyle: true` → MinIO mode
  - `S3_ENDPOINT` unset → `forcePathStyle: false` → AWS S3 mode

**Quyết định: Dùng AWS S3 cho production MVP, giữ MinIO cho local dev.**

**Lý do KHÔNG dùng MinIO trên production EC2:**

| Vấn đề | Chi tiết |
|--------|---------|
| Tốn tài nguyên EC2 | MinIO cần ~200-500MB RAM + CPU, cộng thêm vào EC2 t2.micro vốn đã chật hẹp |
| Tốn disk | MinIO lưu data trên EBS volume → cần attach thêm EBS (thêm chi phí) |
| Không có Lifecycle Rules | MinIO không hỗ trợ S3 Lifecycle Rules → không tự xóa temp files sau 24h |
| Không có CloudFront | CDN integration phức tạp hơn nhiều với MinIO |
| Backup thủ công | Phải tự backup MinIO data, S3 durability 99.999999999% |
| Operational overhead | Thêm 1 service cần monitor, update, restart |

**Lý do dùng AWS S3 cho production:**

| Lợi ích | Chi tiết |
|---------|---------|
| Free tier 12 tháng | 5GB storage + 20K GET + 2K PUT/tháng → đủ cho giai đoạn đầu |
| Zero EC2 resource | S3 không tốn RAM/CPU trên instance |
| Native Lifecycle Rules | Xóa `temp/*` sau 24h miễn phí — thay thế `S3CleanupService` bị disabled |
| CloudFront native | CDN dễ cấu hình, latency thấp hơn |
| Code đã sẵn sàng | Chỉ cần xóa `S3_ENDPOINT` khỏi .env production |
| Cost sau free tier | ~$23/tháng ở tháng 6 (1TB) — đã tính trong budget docs |

**Migration (zero code change):**
```
# .env.development.local (giữ nguyên MinIO)
S3_ENDPOINT=http://localhost:9000
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
S3_BUCKET_NAME=zalo-clone-media-dev

# .env.production (AWS S3)
# S3_ENDPOINT= (xóa dòng này hoặc để trống)
AWS_ACCESS_KEY_ID=<real-key>
AWS_SECRET_ACCESS_KEY=<real-secret>
AWS_REGION=ap-southeast-1
S3_BUCKET_NAME=zalo-clone-media
CLOUDFRONT_DOMAIN=<your-cf-domain>.cloudfront.net
```

**MinIO giữ vai trò local dev only** — không cần loại bỏ khỏi `docker-compose.yml`.

### 2.1 `media.module.ts` (~80 dòng)

**Vấn đề phát hiện:**

| # | Vấn đề | Mức độ |
|---|--------|--------|
| 1 | `PrismaService` import trực tiếp từ `src/database/prisma.service` thay vì import `PrismaModule` từ `shared/` | LOW |
| 2 | `S3CleanupService` đã bị comment out — không active | MEDIUM |
| 3 | `ThrottlerModule.forRoot()` khai báo riêng cho media module thay vì dùng global throttler | LOW |
| 4 | `MediaConsumer` conditionally loaded bằng `process.env.TEST_MODE` — logic test leak vào production module | LOW |
| 5 | Không import `EventEmitterModule` → không thể emit event | HIGH |

---

### 2.2 `media.controller.ts` (~50 dòng)

**Đánh giá**: Clean và minimal. Chỉ 2 endpoint (`initiate` + `confirm`).

**Thiếu:**
- Không có `GET /media/:id` — frontend không có cách lấy media metadata/status
- Không có `DELETE /media/:id` — không có soft-delete endpoint
- Docs mô tả `GET /media/upload-url` nhưng code dùng `POST /media/upload/initiate`

---

### 2.3 `s3.service.ts` (626 dòng) — OVER-ENGINEERED

**Tính năng hiện có:**
- Presigned URL generation ✅
- File existence verification with exponential backoff (5 retries) ✅
- Incomplete multipart upload detection/abort ⚠️
- Atomic move with rollback ✅
- Download to local temp file ✅
- Partial download (magic number validation) ⚠️
- Stream upload (using `@aws-sdk/lib-storage` Upload) ✅
- Stream download ✅
- Folder deletion ✅
- CloudFront URL generation ✅
- Health check ✅

**Vấn đề:**

| # | Vấn đề | Mức độ | Ghi chú |
|---|--------|--------|---------|
| 1 | `waitForFileExistence` — deprecated nhưng vẫn giữ lại | LOW | Xóa deprecated code |
| 2 | Multipart upload management — MVP không cần (presigned URL handle upload) | LOW | Giữ nếu dùng cho large file upload |
| 3 | `downloadPartial()` — chỉ để check magic bytes, nhưng đã có `file-validation.service.ts` làm deep validation | LOW | Có thể xóa |
| 4 | 626 dòng cho 1 service — nên split nếu tiếp tục grow | LOW | |

**Khuyến nghị**: Service này chất lượng tốt, nhưng có ~100 dòng code không cần thiết cho MVP. Có thể giữ nguyên nhưng đánh dấu rõ "Phase 2 features".

---

### 2.4 `media-upload.service.ts` (348 dòng)

**Đánh giá**: Logic core đúng. Presigned URL flow, confirm upload, dispatch processing.

**Vấn đề:**

| # | Vấn đề | Mức độ |
|---|--------|--------|
| 1 | `confirmUpload()` — inline processing cho AUDIO/DOCUMENT (download → validate → move → update DB) nhưng `enqueueProcessing()` cũng có fallback path cho AUDIO/DOCUMENT → dead code | LOW |
| 2 | Không emit `media.uploaded` event sau khi confirm thành công | HIGH |
| 3 | Không emit `media.processed` event sau khi inline processing hoàn tất | HIGH |
| 4 | `generateTempS3Key()` dùng `cuid2` — OK nhưng key format khác docs | LOW |

---

### 2.5 `file-validation.service.ts` (565 dòng) — ĐÁNH GIÁ QUAN TRỌNG

**Tính năng hiện có:**
- Magic byte validation (file-type library)
- ClamAV malware scanning (clamscan npm)
- Deep image validation (sharp — dimensions, corruption)
- Deep video validation (ffprobe — duration, resolution, codec)
- Deep audio validation (ffprobe — duration, codec)
- SVG XSS protection
- Document embedded script detection
- Executable file detection (MZ, ELF, Mach-O, shebang)
- Polyglot file detection
- MIME type mismatch detection

**Vấn đề Critical:**

| # | Vấn đề | Mức độ | Lý do |
|---|--------|--------|-------|
| 1 | **ClamAV integration** — yêu cầu ClamAV container riêng (~1.5GB RAM) | **HIGH** | EC2 t2.micro/t3.medium chỉ có 1-4GB RAM. ClamAV chiếm 1.5GB → impossible trên MVP |
| 2 | ClamAV `fail-open` pattern — nếu scan lỗi, vẫn cho qua (`return { isValid: true }`) | MEDIUM | Nếu ClamAV crash/OOM, mọi file đều bypass |
| 3 | 565 dòng — quá lớn, nên split hoặc simplify cho MVP | MEDIUM | |
| 4 | `ffprobe-static` + `ffmpeg-static` bundled — ~100MB binary size thêm vào Docker image | MEDIUM | |

**Khuyến nghị ClamAV:**
- MVP: **TẮT ClamAV** (`CLAMAV_ENABLED=false` — config đã support). Chỉ dùng magic byte validation + executable detection
- Phase 2: Bật ClamAV khi có dedicated worker instance hoặc EC2 instance lớn hơn
- Config `upload.config.ts` đã có `clamav.enabled` flag → **chỉ cần đảm bảo .env production set `CLAMAV_ENABLED=false`**

---

### 2.6 `metrics.service.ts` (386 dòng)

**Tính năng hiện có:**
- Cron mỗi phút: collect queue stats (waiting, active, completed, failed, delayed)
- Calculate processing rate, avg processing time, failure rate
- Threshold-based alerting (log only — TODO Slack/PagerDuty)
- Weekly cron: clean old jobs
- API methods: `getCurrentMetrics()`, `getFailureStats()`, `getPerformanceByType()`
- DB queries mỗi phút: `findMany` last 100 READY records để tính avg time

**Vấn đề:**

| # | Vấn đề | Mức độ | Lý do |
|---|--------|--------|-------|
| 1 | Cron mỗi phút chạy DB queries → overhead không cần thiết cho 5K images/day | MEDIUM | MVP xử lý ~170 media/giờ → check mỗi 5-10 phút là đủ |
| 2 | Alerting chỉ log → không có giá trị thực tế | LOW | TODO comments nhưng không implement |
| 3 | `getPerformanceByType()` không giới hạn `take` → nếu có nhiều record sẽ scan hết | LOW | |
| 4 | `getOrphanedFilesCount()` query hay nhưng không được expose qua controller/admin API | LOW | |

**Khuyến nghị:**
- Giảm cron frequency: 1 phút → 5 phút hoặc 10 phút
- Hoặc: Tách metrics thành optional module, chỉ enable khi cần debug
- Phase 2: Tích hợp CloudWatch custom metrics thay vì self-collected

---

### 2.7 `s3.cleanup.service.ts` (322 dòng) — DISABLED

**Trạng thái**: COMMENTED OUT trong `media.module.ts` → **KHÔNG CHẠY**

**Tính năng (nếu enabled):**
- Daily cron 2AM: clean stale PENDING uploads (>24h)
- Clean FAILED uploads (>7 days)
- Hard-delete soft-deleted media (>30 days)
- Abort incomplete multipart uploads
- Batch processing (100 items, 5 concurrent)

**Vấn đề:**

| # | Vấn đề | Mức độ |
|---|--------|--------|
| 1 | **Disabled** → temp files tích lũy vô hạn trên S3 → tăng cost | HIGH |
| 2 | Thiếu `optimizedS3Key` trong DB schema → không cleanup được optimized image variants | MEDIUM |
| 3 | Comment trong `deleteMediaAssets()`: "Cần logic suy diễn key từ URL" cho optimized images | MEDIUM |

**Khuyến nghị:**
- **Ngắn hạn**: Bật S3 Lifecycle Rule xóa `temp/*` sau 24h → miễn phí, không cần code
- **Trung hạn**: Uncomment `S3CleanupService` và thêm vào providers
- **Schema**: Thêm `optimizedS3Key` vào `MediaAttachment` model để track đầy đủ

---

### 2.8 `media-queue.service.ts` (~170 dòng)

**Đánh giá**: Clean wrapper cho Bull queue. Enqueue methods cho image, video, generic file.

**Vấn đề:**

| # | Vấn đề | Mức độ |
|---|--------|--------|
| 1 | `enqueueFileProcessing()` dùng hardcoded retry config thay vì config service | LOW |
| 2 | Không có dead-letter queue (DLQ) — docs yêu cầu DLQ cho media-processing | MEDIUM |
| 3 | `cleanOldJobs()` xóa cả completed và failed lớn hơn 7 ngày — docs nói failed giữ 30 ngày | LOW |

---

### 2.9 `media.consumer.ts` (416 dòng)

**Đánh giá**: Complex nhưng logic đúng. Download → validate → route by type → process → update DB.

**Vấn đề:**

| # | Vấn đề | Mức độ |
|---|--------|--------|
| 1 | `handleJob()` download file 2 lần: 1 lần để validate (dòng 83), 1 lần trong `validateAndMoveMedia()` nếu có `s3KeyTemp` | MEDIUM |
| 2 | `processDirectFile()` upload lại file từ buffer → đã download file, validate xong upload lại? Tại sao không move atomic? | MEDIUM |
| 3 | Không emit `media.processed` event khi job hoàn thành | HIGH |
| 4 | `onFailed()` — error message gửi cho client chỉ là `'Failed'` → không informative | LOW |
| 5 | `ensureMediaConsistency()` — race condition handler tốt nhưng validate + move ở đây lẫn với logic ở processImage/processVideo → confusing flow | MEDIUM |

---

### 2.10 `image.processor.ts` (~180 dòng) ✅

**Đánh giá**: **Chất lượng tốt**. Stream-based processing, không load toàn bộ file vào RAM.

**Điểm tốt:**
- `sharp.cache(false)` — tránh memory leak trong container
- `sharp.simd(true)` — optimize performance
- Stream pipeline: S3 → Sharp → S3 (không tốn RAM chứa file gốc)
- Chỉ generate optimized version khi original > 2048px (smart decision)
- WebP output — tiết kiệm bandwidth

**Vấn đề nhỏ:**
- Download stream từ S3 **2 lần** (1 cho thumbnail, 1 cho optimized) — comment trong code nói "Chấp nhận tải lại từ S3 để tiết kiệm RAM server" → OK trade-off cho MVP

---

### 2.11 `video.processor.ts` (342 dòng) — OVER-ENGINEERED CHO MVP

**Tính năng hiện có:**
- Thumbnail extraction tại 1 giây
- **HLS transcoding** (H.264 + AAC, 480p/720p adaptive bitrate)
- Upload HLS segments và playlist lên S3

**Vấn đề CRITICAL:**

| # | Vấn đề | Mức độ | Lý do |
|---|--------|--------|-------|
| 1 | **HLS transcoding trên EC2 t2.micro/t3.medium** → CPU-bound, 1 video có thể chiếm 100% CPU trong nhiều phút | **CRITICAL** | Architecture doc nói "Video metadata extraction (no transcoding in MVP)" |
| 2 | HLS segment upload tuần tự (`for...of` loop) → chậm | LOW | |
| 3 | Cả file video download về local temp → RAM/disk pressure trên EC2 | HIGH | Video 100MB+ sẽ fill disk nhanh trên t2.micro (8GB EBS) |
| 4 | `ffmpeg-static` binary ~70MB thêm vào Docker image | MEDIUM | |
| 5 | `VIDEO_PRESETS` chỉ có 480p và 720p → thiếu fallback cho video nhỏ hơn 480p | LOW | |

**Khuyến nghị:**
- MVP: **CHỈ extract thumbnail** (giữ `extractThumbnail()`), **TẮT HLS transcoding** hoàn toàn
- Architecture doc rõ ràng: `"Video metadata extraction (no transcoding in MVP)"`
- Phase 2: Dùng AWS MediaConvert (serverless, pay per minute) thay vì self-hosted FFmpeg

---

### 2.12 `media-progress.gateway.ts` (~110 dòng)

**Đánh giá**: Separate WebSocket gateway cho media processing progress.

**Vấn đề:**

| # | Vấn đề | Mức độ | Lý do |
|---|--------|--------|-------|
| 1 | Tạo WebSocket gateway riêng (`/media-progress` namespace) → thêm 1 persistent connection nữa cho mỗi client | MEDIUM | Architecture doc không mention riêng gateway cho media — nên dùng chung Socket.IO gateway chính |
| 2 | `sendProgress()` emit cho **TẤT CẢ** connected clients (`this.server.emit(...)`) thay vì chỉ user sở hữu | MEDIUM | Privacy issue + bandwidth waste |
| 3 | `handleSubscribe()` nhận `userId` từ client payload — không authenticate → bất kỳ ai có thể subscribe cho user khác | HIGH | Security vulnerability |
| 4 | `userSockets` Map — in-memory, mất khi restart, không work multi-instance | LOW | MVP single instance nên OK, nhưng cần note |
| 5 | CORS hardcoded `process.env.CORS_ORIGIN || 'http://localhost:3001'` → khác với main Socket.IO gateway config | LOW | |

**Khuyến nghị:**
- Merge vào main Socket.IO gateway trong `src/socket/` — dùng chung authentication, room management
- Hoặc: Đơn giản hóa thành polling endpoint (`GET /media/:id/status`) cho MVP — không cần realtime progress
- Fix security: authenticate WebSocket connection trước khi cho subscribe

---

### 2.13 DTOs (5 files)

**Vấn đề:**

| # | File | Vấn đề | Mức độ |
|---|------|--------|--------|
| 1 | `confirm-upload.dto.ts.ts` | **Double `.ts.ts` extension** — file name bug | LOW |
| 2 | `request-upload.dto.ts.ts` | **Double `.ts.ts` extension** — file name bug | LOW |
| 3 | `confirm-upload.dto.ts.ts` | Có commented-out DTO cũ (old version) bên dưới — dead code | LOW |
| 4 | `request-upload.dto.ts.ts` | Gần giống `initiate-upload.dto.ts` → duplicate DTO | MEDIUM |
| 5 | `get-media.dto.ts` | Defined nhưng **không được dùng** ở bất kỳ controller nào | LOW |
| 6 | `media-response.dto.ts` | OK nhưng thiếu nhiều field (thumbnailUrl, hlsPlaylistUrl, width, height, duration) | LOW |
| 7 | `initiate-upload.dto.ts` | `@Max(104857600)` = 100MB nhưng comment nói 50MB → inconsistent | LOW |

---

### 2.14 `media.constant.ts` (~80 dòng)

**Đánh giá**: Clean, centralized constants. MIME mapping, retry config, security patterns, error messages.

**Nhỏ:**
- `MIME_TO_EXTENSION` thiếu `image/svg+xml` — nhưng file-validation.service.ts có SVG validation → nên thêm hoặc explicitly reject
- `KNOWN_SIGNATURES` cho polyglot detection — ZIP signature `[0x50, 0x4b, 0x03, 0x04]` cũng match .docx, .xlsx → false positive cao

---

## 3. CẤU TRÚC THƯ MỤC — ĐÁNH GIÁ

### Hiện tại:
```
modules/media/
├── dto/
│   ├── confirm-upload.dto.ts.ts    ← bug naming
│   ├── get-media.dto.ts            ← unused
│   ├── initiate-upload.dto.ts
│   ├── media-response.dto.ts
│   └── request-upload.dto.ts.ts    ← bug naming, duplicate
├── gateways/
│   └── media-progress.gateway.ts   ← nên merge vào socket/
├── processors/
│   ├── image.processor.ts          ✅
│   └── video.processor.ts          ← over-engineered (HLS)
├── queues/
│   ├── media.consumer.ts           ← complex, double download
│   └── media-queue.service.ts      ✅
├── services/
│   ├── file-validation.service.ts  ← quá lớn (565 dòng), ClamAV overkill
│   ├── media-upload.service.ts     ← core logic OK, thiếu events
│   ├── metrics.service.ts          ← overkill cho MVP
│   ├── s3.cleanup.service.ts       ← disabled
│   └── s3.service.ts               ← OK nhưng lớn
├── media.controller.ts             ← thiếu GET/DELETE endpoints
└── media.module.ts                 ← thiếu EventEmitter, PrismaService direct import
```

### Khuyến nghị cấu trúc:
```
modules/media/
├── dto/
│   ├── confirm-upload.dto.ts       ← fix naming
│   ├── initiate-upload.dto.ts      ← giữ nguyên
│   └── media-response.dto.ts       ← bổ sung fields
├── listeners/                       ← MỚI: listen events từ module khác
│   └── media-event.listener.ts
├── processors/
│   ├── image.processor.ts
│   └── video.processor.ts          ← simplify: chỉ thumbnail cho MVP
├── queues/
│   ├── media.consumer.ts
│   └── media-queue.service.ts
├── services/
│   ├── file-validation.service.ts  ← simplify, tắt ClamAV
│   ├── media-upload.service.ts     ← thêm event emit
│   ├── s3.service.ts
│   └── s3-cleanup.service.ts       ← bật lại hoặc dùng S3 Lifecycle
├── media.controller.ts             ← thêm GET/DELETE
└── media.module.ts                 ← thêm EventEmitterModule, fix imports
```

**Loại bỏ:**
- `metrics.service.ts` → tách thành optional admin module hoặc chuyển sang CloudWatch
- `media-progress.gateway.ts` → merge vào `src/socket/` hoặc đơn giản hóa thành polling
- `request-upload.dto.ts.ts` → xóa (duplicate)
- `get-media.dto.ts` → xóa hoặc dùng khi thêm GET endpoint

---

## 4. PHÂN TÍCH RESOURCE IMPACT CHO MVP

### Ước tính sử dụng resource trên EC2 t3.medium (4GB RAM):

| Component | RAM ước tính | CPU impact | Cần cho MVP? |
|-----------|-------------|------------|-------------|
| NestJS + HTTP API | 300-500MB | Low | ✅ |
| Socket.IO (3K connections) | 500-800MB | Low | ✅ |
| Redis (self-hosted) | 300-512MB | Low | ✅ |
| Bull worker (image processing) | 200-400MB | Medium | ✅ |
| **Sharp image processing** | 100-200MB | High per job | ✅ |
| **FFmpeg HLS transcoding** | 500MB-1GB | **Very High** | ❌ |
| **ClamAV daemon** | **1.5GB** | Medium | ❌ |
| MetricsService cron | 50MB | Low | ❌ (optional) |
| MediaProgressGateway | 50MB | Low | ❌ (merge) |

**Total nếu tất cả enabled**: ~3.5-5GB RAM → **VƯỢT 4GB** trên t3.medium  
**Total sau khi tắt ClamAV + HLS**: ~1.5-2.5GB RAM → **Vừa đủ**

---

## 5. ƯU TIÊN HÀNH ĐỘNG

### P0 — Phải sửa trước khi production (Blocking)

1. **Tắt HLS video transcoding** — chỉ giữ thumbnail extraction. Architecture doc nói rõ "no transcoding in MVP"
2. **Đảm bảo ClamAV disabled** trong production .env (`CLAMAV_ENABLED=false`)
3. **Thêm event emit** vào media module: `media.uploaded`, `media.processed`, `media.failed`
4. **Bật S3 Lifecycle Rule** xóa `temp/*` sau 24h — thay thế disabled S3CleanupService

### P1 — Nên sửa sớm (Important)

5. **Fix MediaProgressGateway security** — authenticate trước khi subscribe, hoặc merge vào main socket gateway
6. **Fix `sendProgress()`** — chỉ emit cho user sở hữu, không broadcast all
7. **Fix double file download** trong `media.consumer.ts` — tối ưu flow validate + move
8. **Thêm GET /media/:id endpoint** — frontend cần check processing status
9. **Uncomment S3CleanupService** hoặc implement S3 Lifecycle alternative
10. **Fix DTO file naming** — rename `.ts.ts` → `.ts`

### P2 — Nice to have (Improvement)

11. **Giảm MetricsService cron** frequency từ 1 phút → 5-10 phút
12. **Xóa duplicate DTOs** (`request-upload.dto.ts.ts` vs `initiate-upload.dto.ts`)
13. **Import PrismaModule** từ shared thay vì direct PrismaService
14. **Thêm DLQ** cho media-processing queue (hoặc migrate sang SQS)
15. **Bổ sung `optimizedS3Key`** vào DB schema cho cleanup tracking
16. **Update architecture docs** cho khớp với implementation thực tế (S3 key format, endpoint naming)

---

## 6. SO SÁNH TÓM TẮT: DOCS vs CODE

| Hạng mục | Architecture Docs | Code thực tế | Đánh giá |
|----------|-------------------|--------------|----------|
| Upload flow | Presigned URL → confirm → queue | Presigned URL → confirm → queue | ✅ Match |
| Queue backend | SQS FIFO | Bull/Redis | ⚠️ Khác (OK cho dev) |
| Event emit | `media.uploaded`, `media.processed` | Không emit event nào | ❌ Missing |
| Video processing | "No transcoding in MVP" | Full HLS transcoding | ❌ Over-engineered |
| Malware scan | Không mention | ClamAV integration (1.5GB RAM) | ❌ Over-engineered |
| S3 structure | `uploads/temp/`, `uploads/final/`, `processed/` | `temp/`, `permanent/` | ⚠️ Khác (OK) |
| S3 cleanup | S3 Lifecycle Rules (24h temp delete) | Code-based cleanup (disabled) | ❌ Not running |
| Media progress | Không mention riêng gateway | Separate WebSocket gateway | ⚠️ Overkill |
| Metrics/monitoring | CloudWatch basic | Self-collected cron mỗi phút | ⚠️ Overkill |
| DLQ | `media-processing-dlq.fifo` | Không có DLQ | ⚠️ Missing |
| Shared module | S3 service trong `shared/storage/` | S3 service trong `modules/media/services/` | ⚠️ Sai vị trí |

---

## 7. ĐIỂM TỐT — GIỮ NGUYÊN

- **Presigned URL flow**: Clean, đúng pattern. Client upload trực tiếp lên S3
- **Image processor**: Stream-based, tiết kiệm RAM, WebP output, smart optimization threshold
- **Exponential backoff**: Retry logic tốt cho DB fetch và S3 check
- **Atomic S3 move with rollback**: Safe pattern cho data integrity
- **Upload config**: Centralized, configurable via env vars
- **ClamAV toggle**: Config `enabled` flag có sẵn → dễ tắt/bật
- **Rate limiting**: 10 upload/phút per user — hợp lý cho MVP
- **Media constants**: Centralized constants file — clean, dễ maintain
- **Schema design**: `MediaAttachment` model đầy đủ fields cho cả present và future use

---

*Report generated by code assessment. Không chứa code solution chi tiết — chỉ đánh giá và định hướng.*
