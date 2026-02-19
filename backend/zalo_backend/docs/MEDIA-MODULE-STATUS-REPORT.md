# Media Module — Status Report

> **Ngày**: 2026-02-19  
> **Scope**: `src/modules/media/` — đánh giá toàn bộ sau khi hoàn thành Phase 0–4  
> **Mục tiêu ban đầu**: Theo `MEDIA-MODULE-PLAN.md` và `MEDIA-MODULE-ASSESSMENT.md`  
> **Người đánh giá**: GitHub Copilot (full codebase + env + docker access)

---

## 📊 TỔNG KẾT NHANH

| Phase | Mô tả | Trạng thái | Hoàn thành |
|-------|-------|------------|------------|
| Phase 0 | Deprecated Cleanup | ✅ DONE | 9/9 |
| Phase 1 | Critical Fixes (P0) | ✅ DONE | 5/6 *(1 manual)* |
| Phase 2 | Security & Stability | ⚠️ PARTIAL | 4/5 *(soft-delete sai)* |
| Phase 3 | Bull → SQS Migration | ✅ DONE | 7/7 |
| Phase 4 | Cleanup, Metrics & Polish | ⚠️ PARTIAL | 3/6 *(3 còn lại)* |
| **Tổng** | | | **28/33** |

---

## ✅ NHỮNG GÌ ĐÃ LÀM ĐƯỢC

### Phase 0 — Deprecated Infrastructure Cleanup ✅ HOÀN TOÀN

| # | Item | Bằng chứng |
|---|------|------------|
| 0.1 | Xóa `clamav` khỏi `docker-compose.yml` | File hiện chỉ còn `postgres`, `redis`, `minio`, `minio-init` |
| 0.2 | Rewrite `docker-compose.workers.yml` | Remove `media-worker` + `video-worker` container |
| 0.3 | Fix `S3_ENDPOINT` → `http://localhost:9000` | `.env.development.local` line 39 |
| 0.4 | Xóa duplicate env vars (`MAX_IMAGE_SIZE_MB` x2, `MAX_VIDEO_SIZE_MB` x2) | File sạch, không còn duplicate |
| 0.5 | Xóa `BULL_REDIS_HOST`, `BULL_REDIS_PORT` | Không còn trong `.env.*` |
| 0.6 | Xóa commented-out block ~50 dòng | `.env.development.local` sạch, 83 dòng |
| 0.7 | Rewrite `.env.example` | Đầy đủ sections: App, JWT, DB, Redis, S3, SQS |
| 0.8 | Xóa `RUN apk add ffmpeg` khỏi `Dockerfile` worker stage | HLS disabled → dùng `ffmpeg-static` npm |
| 0.9 | Xóa `VIDEO_WORKER_CONCURRENCY` | Không còn trong `.env.development.local` |

---

### Phase 1 — Critical Fixes ✅ CƠ BẢN XONG

| # | Item | Bằng chứng | Ghi chú |
|---|------|------------|---------|
| 1.1 | HLS transcoding disabled | `video.processor.ts` line 49: `TRANSCODING_ENABLED = false` | ✅ |
| 1.2 | `EventEmitterModule` import vào `media.module.ts` | `media.module.ts` line 5 | ✅ |
| 1.3 | Emit `media.uploaded` event | `media-upload.service.ts` lines 199, 297 | ✅ |
| 1.4 | Emit `media.processed` event | `media.consumer.ts` lines 315, 365; `sqs-media.consumer.ts` lines 322, 360 | ✅ |
| 1.5 | Emit `media.failed` event | `media.consumer.ts` line 456; `sqs-media.consumer.ts` line 274 | ✅ |
| 1.6 | Fix `MediaProgressGateway` JWT auth | `handleConnection()` reject unauthenticated client | ✅ |
| 1.7 | Fix `sendProgress` → per-user room | `server.to('user:{userId}').emit(...)` | ⚠️ CÒN LỖI (xem §B.1) |
| 1.8 | S3 Lifecycle Rule | Manual AWS Console step | ⏳ Cần làm thủ công |

---

### Phase 2 — Security & Stability ⚠️ GẦN XONG

| # | Item | Bằng chứng | Ghi chú |
|---|------|------------|---------|
| 2.1 | Fix double S3 download | `media.consumer.ts` lines 80–90: download once vào buffer | ✅ |
| 2.2 | `GET /media/:id` endpoint | `media.controller.ts` line 46 | ✅ |
| 2.3 | `DELETE /media/:id` endpoint | `media.controller.ts` line 55 | ⚠️ Sai (xem §B.2) |
| 2.4 | Fix DTO filename typos | Không còn `.ts.ts` extension | ✅ |
| 2.5 | PrismaService direct | Vẫn inject trực tiếp trong module, nhưng được chấp nhận cho MVP | ✅ |

---

### Phase 3 — Queue Migration: Bull → SQS ✅ HOÀN TOÀN

| # | Item | Bằng chứng |
|---|------|------------|
| 3.1 | Interface `IMediaQueueService` + token `MEDIA_QUEUE_PROVIDER` | `queues/media-queue.interface.ts` |
| 3.2 | `SqsMediaQueueService` — `sendMessage()` → SQS | `queues/sqs-media-queue.service.ts` |
| 3.3 | `SqsMediaConsumer` — long-poll loop | `queues/sqs-media.consumer.ts` |
| 3.4 | `media.module.ts` dual-provider | `IS_SQS` flag, conditional BullModule, token DI |
| 3.5 | `app.module.ts` BullModule gated | `process.env.QUEUE_PROVIDER !== 'sqs'` guard |
| 3.6 | `queue.config.ts` SQS block | `region`, `imageQueueUrl`, `videoQueueUrl`, visibility timeouts |
| 3.7 | SQS env vars | `.env.development.local` dòng 75–83: URLs đầy đủ (đã có queue thật) |
| 3.8 | `media-upload.service.ts` dùng abstract token | `@Inject(MEDIA_QUEUE_PROVIDER) private readonly mediaQueue: IMediaQueueService` |
| 3.9 | Prisma migration | `npx prisma migrate dev --name add_optimized_s3_key` đã chạy |

**Kiến trúc dual-provider:**
```
QUEUE_PROVIDER=bull  →  MediaQueueService (Bull/Redis)     ← dev default
QUEUE_PROVIDER=sqs   →  SqsMediaQueueService (AWS SQS)    ← production
```

---

### Phase 4 — Cleanup, Metrics & Polish ⚠️ PARTIAL

| # | Item | Bằng chứng | Ghi chú |
|---|------|------------|---------|
| 4.1 | `S3CleanupService` re-enabled | `media.module.ts` providers list | ✅ |
| 4.2 | `MetricsService` cron → `0 */5 * * * *` | `metrics.service.ts` line 64 | ✅ |
| 4.3 | `MetricsService` dùng abstract token | `@Inject(MEDIA_QUEUE_PROVIDER) private readonly queueService: IMediaQueueService` | ✅ |
| 4.4 | `optimizedS3Key` column trong schema | `prisma/schema.prisma` line 759 + migration done | ✅ |
| 4.5 | Deduplicate DTOs (`CreateMediaDto` / `MediaResponseDto`) | `request-upload.dto.ts` vẫn còn — CHƯA LÀM | ❌ |
| 4.6 | Remove `VIDEO_WORKER_CONCURRENCY` env var | Không còn trong `.env.development.local` | ✅ |

---

## ❌ NHỮNG GÌ CHƯA LÀM ĐƯỢC / CÒN VẤN ĐỀ

### B.1 — `sendProgress()` Còn Privacy Leak (Phase 1 ⚠️)

**File**: `src/modules/media/gateways/media-progress.gateway.ts`

**Vấn đề**: Hàm `sendProgress()` có overload với fallback `this.server.emit(...)` khi `userId` không được truyền vào. Cả `MediaConsumer` và `SqsMediaConsumer` đều gọi `sendProgress(mediaId, update)` **không truyền `userId`**, nghĩa là chúng đang dùng fallback broadcast — vi phạm privacy.

```typescript
// HIỆN TẠI (media.consumer.ts, sqs-media.consumer.ts)
this.progressGateway.sendProgress(payload.mediaId, update);
// → Gọi overload không có userId → server.emit() toàn bộ client!

// ĐÚNG phải là:
this.progressGateway.sendProgress(payload.mediaId, update, media.uploadedBy);
```

**TODO còn tồn tại trong code**:
```typescript
// TODO: plumb userId through all sendProgress callsites
```

---

### B.2 — `DELETE /media/:id` Là Hard Delete, Không Phải Soft Delete (Phase 2 ❌)

**File**: `src/modules/media/services/media-upload.service.ts`

**Kế hoạch nói**: "soft-delete + S3 cleanup call"  
**Code thực tế**: `prisma.mediaAttachment.delete()` — **xóa cứng ngay lập tức**

Schema đã có `deletedAt DateTime?` và `deletedById String?` nhưng không được dùng. Nếu xóa cứng:
- Không có cách recovery nếu user xóa nhầm
- S3 cleanup cron job (`s3.cleanup.service.ts`) sẽ **không bao giờ chạy** đúng logic `SOFT_DELETED_MAX_AGE_DAYS = 30`
- Message có `mediaId` reference sẽ trỏ đến record không còn tồn tại

---

### B.3 — `media.deleted` Event Chưa Được Emit (Phase 1 ❌)

**File**: `src/modules/media/services/media-upload.service.ts`  

Cả hai assessment docs và constant file đều đề cập `media.deleted`:
```typescript
// src/common/constants/media.constant.ts
// KHÔNG có DELETED trong MEDIA_EVENTS!
```

`deleteMedia()` không emit event nào → search engine, notifications sẽ không biết media bị xóa.

---

### B.4 — Duplicate DTO Files (Phase 4 ❌)

**Files**:
- `dto/initiate-upload.dto.ts` — **đang được dùng** bởi controller và service
- `dto/request-upload.dto.ts` — **DEAD CODE**, định nghĩa `RequestUploadDto` không ai dùng

`request-upload.dto.ts` còn có inconsistency: `@Max(52428800)` (50MB) nhưng `initiate-upload.dto.ts` dùng `@Max(104857600)` (100MB). Hai file song song gây confuse.

---

### B.5 — `confirm-upload.dto.ts` Còn Commented-Out Dead Code (Phase 2 ⚠️)

**File**: `src/modules/media/dto/confirm-upload.dto.ts`

Phần dưới file có ~30 dòng code cũ đã bị comment out (old `mediaId` + `s3ETag` fields). Cần xóa hoàn toàn.

---

### B.6 — `MediaResponseDto` Thiếu Fields (Phase 4 ⚠️)

**File**: `src/modules/media/dto/media-response.dto.ts`

DTO chỉ có các fields cơ bản, thiếu:
- `thumbnailUrl` — cần cho frontend hiển thị preview
- `optimizedUrl` — mới thêm vào schema nhưng chưa vào DTO
- `processingError` — frontend cần biết lý do thất bại
- `width`, `height`, `duration` — metadata media

---

### B.7 — `MediaProgressGateway` Namespace Conflict (Phase 1 ⚠️)

**File**: `src/modules/media/gateways/media-progress.gateway.ts`

Gateway dùng namespace `/media-progress` riêng biệt. Theo `ARCHITECTURE.md`, tất cả Socket.IO realtime events nên đi qua gateway chung. Hiện tại:
- Frontend phải kết nối **2 WebSocket** (main gateway + `/media-progress`)
- Tốn 2 TCP connections trên mobile
- Upload progress không thể interleave với chat messages trong cùng connection

---

### B.8 — `SqsMediaQueueService` Thiếu Credential Config (Phase 3 ⚠️)

**File**: `src/modules/media/queues/sqs-media-queue.service.ts`

`SQSClient` được khởi tạo chỉ với `region` — không truyền credentials:
```typescript
this.client = new SQSClient({
  region: '...',
  // credentials: không có!
});
```

Điều này chỉ hoạt động khi chạy trên EC2 với IAM Role (instance profile). Nếu chạy local dev với `QUEUE_PROVIDER=sqs` (current `.env.development.local`), sẽ fail với `CredentialsProviderError` vì MinIO không phải AWS.

**Chú ý nghiêm trọng**: Hiện `.env.development.local` đang set `QUEUE_PROVIDER=sqs` — nghĩa là local dev đang cố kết nối SQS thật! Nếu dev không có IAM credentials configured trên máy, server sẽ crash khi start.

---

### B.9 — `s3.cleanup.service.ts` Giả Định HLS Segments

**File**: `src/modules/media/services/s3.cleanup.service.ts`

Service có logic cleanup cho HLS folder (`/hls/` path patterns):
```typescript
import * as path from 'path'; // Cần để parse đường dẫn HLS
```

HLS đã disabled (Phase 1), nhưng cleanup service vẫn có references đến HLS paths. Không gây lỗi nhưng là dead code.

---

### B.10 — Thiếu `@UseGuards(JwtAuthGuard)` trên Controller (Phase 2 ⚠️)

**File**: `src/modules/media/media.controller.ts`

Controller không có `@UseGuards(JwtAuthGuard)` ở class level. Phụ thuộc vào global guard (nếu có) trong `app.module.ts`. Nếu global guard không bao gồm media routes, endpoints sẽ public.

```typescript
@Controller('media')
export class MediaUploadController {
// ↑ Không có @UseGuards(JwtAuthGuard)!
```

---

## 🔍 CÁC VẤN ĐỀ MỚI PHÁT HIỆN (Ngoài Plan)

| # | Vấn đề | Mức độ | File |
|---|--------|--------|------|
| N.1 | Local dev vô tình connect SQS thật (`QUEUE_PROVIDER=sqs` trong dev.local) | **HIGH** | `.env.development.local` |
| N.2 | Consumer không truyền `userId` vào `sendProgress()` → broadcast leak | **HIGH** | `media.consumer.ts`, `sqs-media.consumer.ts` |
| N.3 | Hard delete thay vì soft delete | **MEDIUM** | `media-upload.service.ts` |
| N.4 | `media.deleted` event chưa có trong `MEDIA_EVENTS` constant | **MEDIUM** | `media.constant.ts` |
| N.5 | Duplicate DTO `request-upload.dto.ts` | LOW | `dto/` |
| N.6 | `MediaResponseDto` thiếu thumbnail/dimension fields | LOW | `dto/media-response.dto.ts` |
| N.7 | `InitiateUploadDto` regex không cho phép spaces trong tên file (nhưng có `\s`) | LOW | `dto/initiate-upload.dto.ts` |

---

## 📐 KIẾN TRÚC HIỆN TẠI — SƠ ĐỒ

```
HTTP Request                   Queue Layer                    Storage
──────────────                 ───────────────               ─────────
POST /media/upload/initiate    QUEUE_PROVIDER=bull           MinIO (dev)
  │ → InitiateUploadDto        ┌───────────────────┐        S3 (prod)
  │ → S3 presigned URL         │  IMediaQueueService│
  │ → DB record (PENDING)      │  (abstract token) │
  │                            ├───────────────────┤
POST /media/upload/confirm     │ Bull: Redis queue │
  │ → verify S3 exists         │ SQS:  AWS SQS     │
  │ → emit media.uploaded      └─────────┬─────────┘
  │ → enqueue processing                 │
  │                            Consumer polling
GET /media/:id                 ┌─────────┴─────────┐
  │ → MediaResponseDto         │ MediaConsumer      │
                               │ (Bull @Processor)  │
DELETE /media/:id              ├────────────────────┤
  │ → HARD delete (⚠️)        │ SqsMediaConsumer   │
                               │ (SQS long-poll)    │
WebSocket /media-progress      └─────────┬─────────┘
  │ → JWT auth ✅                       │
  │ → user room join ✅       ┌─────────┴─────────┐
  │ → sendProgress (⚠️ leak) │ ImageProcessor    │
                               │ VideoProcessor    │
                               │ FileValidation    │
                               └───────────────────┘
                                Events emitted:
                                 media.uploaded ✅
                                 media.processed ✅
                                 media.failed ✅
                                 media.deleted ❌
```

---

## 🚀 ROADMAP — PHASE 5: BUGS & HARDENING

Đây là những gì cần làm trong giai đoạn tiếp theo, theo thứ tự ưu tiên:

### P0 — Phải Fix Ngay

#### 5.1 Fix `QUEUE_PROVIDER` trong `.env.development.local`
**Vấn đề**: Hiện đang set `QUEUE_PROVIDER=sqs` → local dev cố kết nối SQS thật → crash nếu không có IAM credentials.  
**Fix**: Đổi lại `QUEUE_PROVIDER=bull` cho local dev.

```dotenv
# .env.development.local
QUEUE_PROVIDER=bull   # ← đổi lại
# SQS URLs để trong comment, chỉ bật khi deploy production
```

#### 5.2 Fix `sendProgress()` Privacy Leak
**File**: `media.consumer.ts` + `sqs-media.consumer.ts`  
Truyền `userId` vào tất cả `sendProgress()` call sites:

```typescript
// Sau khi fetch media:
this.progressGateway.sendProgress(
  payload.mediaId,
  { status: 'processing', progress: 10 },
  media.uploadedBy,  // ← ADD THIS
);
```

Xóa fallback `this.server.emit()` trong gateway.

---

### P1 — Nên Fix Sớm

#### 5.3 Soft Delete thay vì Hard Delete
**File**: `media-upload.service.ts`  
```typescript
// THAY:
await this.prisma.mediaAttachment.delete({ where: { id: mediaId } });

// BẰNG:
await this.prisma.mediaAttachment.update({
  where: { id: mediaId },
  data: {
    deletedAt: new Date(),
    deletedById: userId,
  },
});
// S3 cleanup sẽ được xử lý bởi S3CleanupService cron sau 30 ngày
```

#### 5.4 Add `media.deleted` Event
**Files**: `media.constant.ts` + `media-upload.service.ts`  
```typescript
// media.constant.ts
export const MEDIA_EVENTS = {
  UPLOADED: 'media.uploaded',
  PROCESSED: 'media.processed',
  FAILED: 'media.failed',
  DELETED: 'media.deleted',  // ← ADD
} as const;

// media-upload.service.ts → deleteMedia()
this.eventEmitter.emit(MEDIA_EVENTS.DELETED, { mediaId, userId });
```

#### 5.5 Cập nhật `MediaResponseDto`
Thêm các fields còn thiếu: `thumbnailUrl`, `optimizedUrl`, `processingError`, `width`, `height`, `duration`.

#### 5.6 Xóa `request-upload.dto.ts`
File dead code. Xóa hoàn toàn, đảm bảo không ai import nó.

#### 5.7 Xóa commented-out code trong `confirm-upload.dto.ts`

---

### P2 — Cải Thiện Dài Hạn

#### 5.8 Migrate `MediaProgressGateway` vào Main Gateway
Gộp `/media-progress` namespace vào gateway chính (`src/socket/`) để frontend chỉ cần 1 WebSocket connection.

#### 5.9 Add SQS Credentials Config cho Non-IAM Environments  
```typescript
// sqs-media-queue.service.ts
this.client = new SQSClient({
  region: this.configService.get('queue.sqs.region'),
  // Chỉ set credentials nếu có explicit key (dev mode with LocalStack/real SQS)
  ...(process.env.AWS_ACCESS_KEY_ID ? {
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    }
  } : {}),
});
```

#### 5.10 Add `@UseGuards(JwtAuthGuard)` vào `MediaUploadController`
Đảm bảo không phụ thuộc vào global guard.

#### 5.11 Add `media.deleted` Listener trong `search_engine` Module  
File `search-event.listener.ts` đã có `@OnEvent('media.uploaded')` handler. Thêm xử lý remove index khi media bị xóa.

---

### Phase 6 (Tương Lai Xa) — Production Readiness

| Item | Mô tả |
|------|-------|
| HLS Re-enable | Bật `TRANSCODING_ENABLED = true` khi có frontend HLS player |
| ClamAV opt-in | Bật scanning cho enterprise tier, dùng ECS container |
| Webhook cho SQS | Thay long-poll bằng AWS EventBridge + Lambda trigger (nếu scale) |
| CDN signed URLs | Thêm CloudFront signed URL generation cho private media |
| Rate limiting per file | Thêm per-user daily upload quota tracking |
| Media expiry | Tự động expire media cũ không được dùng trong message |

---

## 📁 INVENTORY — FILE STATUS

```
src/modules/media/
├── media.module.ts           ✅ Tốt — dual-provider, S3Cleanup enabled
├── media.controller.ts       ⚠️ Thiếu @UseGuards ở class level
│
├── dto/
│   ├── initiate-upload.dto.ts   ✅ Đang dùng
│   ├── confirm-upload.dto.ts    ⚠️ Còn dead code comment ~30 dòng
│   ├── request-upload.dto.ts    ❌ Dead code — xóa
│   ├── get-media.dto.ts         ✅ OK
│   └── media-response.dto.ts    ⚠️ Thiếu thumbnail/dimension fields
│
├── gateways/
│   └── media-progress.gateway.ts  ⚠️ sendProgress fallback broadcast leak
│
├── processors/
│   ├── image.processor.ts      ✅ OK
│   └── video.processor.ts      ✅ TRANSCODING_ENABLED=false đúng
│
├── queues/
│   ├── media-queue.interface.ts    ✅ IMediaQueueService + token
│   ├── media-queue.service.ts      ✅ Bull implementation
│   ├── media.consumer.ts           ⚠️ sendProgress leak (không truyền userId)
│   ├── sqs-media-queue.service.ts  ✅ SQS implementation
│   └── sqs-media.consumer.ts       ⚠️ sendProgress leak (không truyền userId)
│
└── services/
    ├── media-upload.service.ts  ⚠️ Hard delete; thiếu media.deleted event
    ├── file-validation.service.ts  ✅ OK (ClamAV disabled)
    ├── metrics.service.ts      ✅ 5-min cron, abstract token
    ├── s3.cleanup.service.ts   ✅ Re-enabled, daily @ 2AM
    └── s3.service.ts           ✅ OK (626 dòng nhưng chất lượng tốt)
```

---

## 🧪 CHECKLIST TRƯỚC KHI DEPLOY PRODUCTION

```
[ ] 1. Đổi QUEUE_PROVIDER=bull trong .env.development.local
[ ] 2. Fix sendProgress() - truyền userId qua tất cả call sites
[ ] 3. Tạo S3 Lifecycle Rule trên AWS Console (temp/ → expire 1 day)
[ ] 4. Verify IAM Role EC2 có quyền SQS (SendMessage, ReceiveMessage, DeleteMessage)
[ ] 5. Verify SQS DLQ đã cấu hình maxReceiveCount=3
[ ] 6. Chạy prisma migrate trên production DB
[ ] 7. Test upload → confirm → queue → process end-to-end
[ ] 8. Verify S3CleanupService cron chạy đúng (kiểm tra logs lúc 2AM)
[ ] 9. Verify MetricsService không timeout khi SQS có nhiều messages
[ ] 10. Set CLOUDFRONT_DOMAIN trong .env.production
```

---

## 📊 METRICS ĐÁNH GIÁ CHẤT LƯỢNG CODE

| Hạng mục | Điểm | Ghi chú |
|----------|------|---------|
| Architecture alignment | 8/10 | Event-driven ✅, gateway privacy ⚠️ |
| Security | 6/10 | JWT gate ✅, sendProgress leak ❌, hard delete ⚠️ |
| Testability | 7/10 | Abstract token DI tốt, TEST_MODE flag còn trong prod code |
| Maintainability | 8/10 | Dual-provider pattern sạch, dead code còn sót |
| Production readiness | 6/10 | QUEUE_PROVIDER config sai, missing events, soft delete |
| **Overall** | **7/10** | Nền tảng tốt, một số bugs quan trọng cần sửa trước go-live |

---

*Report được tạo tự động dựa trên phân tích toàn bộ source code, env files, docker compose, và prisma schema.*  
*Xem `MEDIA-MODULE-PLAN.md` để biết kế hoạch gốc, `MEDIA-MODULE-ASSESSMENT.md` để biết lý do các quyết định kiến trúc.*
