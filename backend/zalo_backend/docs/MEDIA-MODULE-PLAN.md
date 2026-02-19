# Media Module — Implementation Plan (MVP)

> **Architecture decisions already locked:**
> - **Queue**: Bull/Redis (local dev) → **AWS SQS** (production). Free tier, built-in DLQ, no Redis DB-1 dependency.
> - **Storage**: MinIO (local dev only, zero code change) → **AWS S3** (production, just swap env vars).
> - **Transcoding**: HLS disabled for MVP. Only thumbnail + metadata extraction via `ffprobe`.
> - **Virus scan**: `CLAMAV_ENABLED=false` everywhere for MVP. ClamAV container removed from compose.
> - **Workers**: In-process (same NestJS process, same EC2 t3.medium). No separate worker containers.

---

## TODO List

### Phase 0 — Deprecated Cleanup
- [x] Remove `clamav` service from `docker-compose.yml`
- [x] Fix `S3_ENDPOINT` in `.env.development.local` → `http://localhost:9000`
- [x] Remove duplicate `MAX_IMAGE_SIZE_MB`, `MAX_VIDEO_SIZE_MB`, `MAX_VIDEO_DURATION_SECONDS` entries in `.env.*`
- [x] Remove `BULL_REDIS_HOST` / `BULL_REDIS_PORT` from `.env.*` (queue uses `REDIS_HOST` via `queue.config.ts`)
- [x] Remove dead commented-out block (~50 lines) from `.env.development.local` and `.env.test`
- [x] Fix `CORS_ORIGIN` → `CORS_ORIGINS` in `.env.test` (match app usage)
- [x] Rewrite `docker-compose.workers.yml` — remove separate worker containers (MVP = in-process)
- [x] Rewrite `.env.example` as complete template for new developers
- [x] Remove `RUN apk add --no-cache ffmpeg` from `Dockerfile` worker stage (HLS disabled; `ffmpeg-static` npm package handles thumbnail/probe)

### Phase 1 — Critical Fixes (P0)
- [x] Disable HLS transcoding in `video.processor.ts` — guard with `shouldTranscode = false` constant
- [x] Add `EventEmitterModule` to `media.module.ts` imports
- [x] Emit `media.uploaded`, `media.processed`, `media.failed` events from `media.service.ts`
- [ ] Configure S3 Lifecycle Rule on AWS console: `temp/` prefix → expire after 1 day (manual AWS console step)
- [x] Fix `MediaProgressGateway`: authenticate via JWT middleware before allowing subscription
- [x] Fix `MediaProgressGateway.sendProgress()`: use `this.server.to(userId).emit(...)` not `this.server.emit(...)`

### Phase 2 — Security & Stability (P1)
- [x] Fix double S3 download in `media.consumer.ts` — download file once, reuse buffer
- [x] Add `GET /media/:id` endpoint to `media.controller.ts` (query own media)
- [x] Add `DELETE /media/:id` endpoint with soft-delete + S3 cleanup call
- [x] Rename `confirm-upload.dto.ts.ts` → `confirm-upload.dto.ts` and `request-upload.dto.ts.ts` → `request-upload.dto.ts` (typo in filenames)
- [x] `PrismaService` already provided directly in `media.module.ts` — no separate PrismaModule needed

### Phase 3 — Queue Migration: Bull → SQS (P0 for production)
- [ ] Create two SQS queues on AWS: `media-image-queue` and `media-video-queue` (+ DLQ variants)
- [ ] Replace `@nestjs/bull` with `@aws-sdk/client-sqs` in `media.module.ts`
- [ ] Rewrite `MediaQueueService` to use `SQS.sendMessage()` instead of `Bull.add()`
- [ ] Rewrite `MediaConsumer` to use `SQS.receiveMessage()` + `SQS.deleteMessage()` polling loop
- [ ] Update `queue.config.ts` to expose `SQS_IMAGE_QUEUE_URL` and `SQS_VIDEO_QUEUE_URL`
- [ ] Add SQS env vars to `.env.development.local`, `.env.example`
- [ ] Enable DLQ with `maxReceiveCount: 3` on AWS console

### Phase 4 — Cleanup, Metrics & Polish (P2)
- [ ] Uncomment / enable `S3CleanupService` cron job (delete orphan `temp/` files older than 24h)
- [ ] Reduce `MediaMetricsService` cron from 1 min to 5 min (`0 */5 * * * *`)
- [ ] Add `optimizedS3Key` column to `Media` schema in `prisma/schema.prisma`
- [ ] Add `prisma migration` for `optimizedS3Key`
- [ ] Deduplicate `CreateMediaDto` and `MediaResponseDto` — remove any duplicate DTO files
- [ ] Remove `VIDEO_WORKER_CONCURRENCY` env var (HLS disabled, video concurrency = 1)

---

## Phase 0 — Deprecated Infrastructure Cleanup

**Goal**: Remove all config and Docker artifacts that are incompatible with the MVP architecture decisions made above.

### 0.1 — `docker-compose.yml`
**Remove**: The entire `clamav` service block (image `clamav/clamav:latest`, 1.5GB RAM limit, port 3310, healthcheck).  
**Keep**: `postgres`, `redis`, `minio`, `minio-init`.  
**Why**: `CLAMAV_ENABLED=false` everywhere; running a 1.5GB service for a disabled feature is waste.

### 0.2 — `docker-compose.workers.yml`
**Replace entire file** with a short note explaining the MVP decision.  
**Remove**: `media-worker` container (2GB RAM, ClamAV=true, MinIO, Bull, separate container networking).  
**Remove**: `video-worker` container (3GB RAM, cpus=3.0, HLS transcoding assumption).  
**Why**: MVP workers run in-process inside the main NestJS app — no separate container needed. This file was only needed for a horizontally-scaled architecture not appropriate for single t3.medium instance.

### 0.3 — `.env.development.local`
**Fix**:
- `S3_ENDPOINT=http://minio:9000` → `S3_ENDPOINT=http://localhost:9000`  
  (Container name `minio` is only reachable inside Docker network; for host-side dev server, use localhost)

**Remove duplicates** (keep first occurrence in each group):
- `MAX_IMAGE_SIZE_MB=10` appears twice
- `MAX_VIDEO_SIZE_MB=500` (first) and `MAX_VIDEO_SIZE_MB=100` (second) — keep `100` (matches `upload.config.ts`)
- `MAX_VIDEO_DURATION_SECONDS=180` appears twice

**Remove unused vars**:
- `BULL_REDIS_HOST=localhost` — queue config reads from `REDIS_HOST`
- `BULL_REDIS_PORT=6379` — queue config reads from `REDIS_PORT`
- `VIDEO_WORKER_CONCURRENCY=2` — HLS disabled, single video proc path

**Remove**: Entire commented-out block (~50 lines) containing old AWS alt vars, NGINX, FFmpeg CPU limit, duplicate MINIO vars, duplicate CLEANUP vars — these were from an earlier design draft and are actively confusing.

### 0.4 — `.env.test`
Same removals as 0.3 above, plus:  
**Fix**: `CORS_ORIGIN=` → `CORS_ORIGINS=` (the app reads plural form; this causes CORS to silently fail in tests).

### 0.5 — `.env.example`
**Rewrite from scratch** as a proper template. Current file has only 2 lines and is useless for onboarding.  
Sections needed: App, JWT, Database, Redis, S3/MinIO (dev), SQS (production), Upload limits, ClamAV toggle.

### 0.6 — `Dockerfile` worker stage
**Remove**: `RUN apk add --no-cache ffmpeg` from the `worker` stage.  
**Why**: HLS transcoding is disabled for MVP. Thumbnail generation and video metadata extraction use `fluent-ffmpeg` + `ffmpeg-static` npm package — no system FFmpeg required. Removing saves ~70MB from the worker image layer.  
**Keep**: `libc6-compat` in `base` stage (Sharp requires it).

---

## Phase 1 — Critical Fixes (P0)

**Goal**: Make the module production-safe. These are blockers before any deployment.

### 1.1 — Disable HLS Transcoding

**File**: `src/modules/media/processors/video.processor.ts`  

**Problem**: HLS transcoding generates multi-segment `.m3u8`/`.ts` files. For MVP we have no HLS player on the frontend, no CDN path for HLS segments, and insufficient EC2 RAM for ffmpeg forks. Running it would silently produce files that are never read and fill the S3 bucket with junk.

**Solution**: Add a `TRANSCODING_ENABLED = false` constant guard at the top of the processor. When false, skip the ffmpeg HLS pipeline entirely and fall through directly to thumbnail generation + `ffprobe` metadata extraction. The processor should still update the `Media` record status to `PROCESSED` after thumbnail/metadata work completes.

**Important**: Clean up any residual HLS segment files from S3 if they were written before the guard existed.

### 1.2 — Wire EventEmitter in MediaModule

**File**: `src/modules/media/media.module.ts`

**Problem**: The assessment found `EventEmitter2` is used in `MediaService` but `EventEmitterModule` is missing from `media.module.ts` imports. Events like `media.uploaded`, `media.processed`, `media.failed` silently go nowhere — no other module (messaging, notification) can react to them.

**Solution**:
1. Add `EventEmitterModule` to `media.module.ts` imports (import from the root `app.module.ts` registration if using global, or register forFeature).
2. Confirm `MediaService` emits these three events at the correct lifecycle points:
   - `media.uploaded` → after S3 presigned upload succeeds and `Media` record is created
   - `media.processed` → after `MediaConsumer` finishes processing (thumbnail done, metadata extracted)
   - `media.failed` → after queue job exhausts all retries

### 1.3 — Fix MediaProgressGateway Security

**File**: `src/modules/media/gateways/media-progress.gateway.ts`

**Problem A**: `server.emit('media:progress', data)` broadcasts to **all connected clients**. Any user can see any other user's upload progress — a critical privacy leak.

**Problem B**: No authentication check before a client can subscribe to progress events. An unauthenticated socket can receive upload status.

**Solution**:
1. Apply the existing `WsJwtGuard` (or equivalent JWT middleware used in other gateways) to validate the socket connection on handshake.
2. On successful auth, join the socket to a user-specific room: `socket.join(`user:${userId}`)`.
3. Change all `sendProgress()` calls from `this.server.emit(...)` to `this.server.to(`user:${userId}`).emit(...)`.
4. The gateway only needs the `userId` from the validated JWT payload — no extra round trip needed.

### 1.4 — Configure S3 Lifecycle Rule

**Environment**: AWS Console (one-time manual setup per environment)

**Problem**: Uploaded files go to `temp/` prefix first (presigned URL target). If the client never calls the confirm endpoint (network drop, user abort, frontend bug), the file stays in S3 forever. This is unbounded S3 storage growth.

**Solution**: Create an S3 Lifecycle Rule on the production bucket:
- **Prefix filter**: `temp/`
- **Action**: Expire objects after **1 day**
- This mirrors the MinIO `minio-init` service's `mc ilm add --expiry-days 1` which already handles dev

**Note**: The `S3CleanupService` cron (Phase 4) provides application-level cleanup but the lifecycle rule is the safety net — it works even if the NestJS process is down.

---

## Phase 2 — Security & Stability (P1)

**Goal**: Fix known bugs that cause incorrect behavior or silent failures.

### 2.1 — Fix Double S3 Download in MediaConsumer

**File**: `src/modules/media/consumers/media.consumer.ts`

**Problem**: The consumer downloads the file from S3 twice — once for image/video processing and again for ClamAV scanning. On a 50MB video this is 100MB of unnecessary S3 GET traffic per job and doubles processing latency.

**Solution**:
1. Download the file from S3 **once** at the start of `processJob()` into a `Buffer` or temp file path.
2. Pass that buffer/path to both the processor and the (currently disabled) scanner.
3. Delete the temp file/buffer after processing completes (success or failure).

### 2.2 — Add GET /media/:id and DELETE /media/:id

**File**: `src/modules/media/media.controller.ts`

**Problem**: The controller has `POST /media/upload` for initiating uploads and `POST /media/:id/confirm` for confirming them, but no way to:
- Query the status/metadata of a specific media item (needed by frontend to poll for `PROCESSING → PROCESSED`)
- Delete a media item (needed for message edit/delete flows)

**Solution**:
- `GET /media/:id` — return the `Media` record including `status`, `thumbnailUrl`, `metadata`, `optimizedS3Key`. Guard with ownership check (`userId` from JWT must match `media.uploadedById`).
- `DELETE /media/:id` — soft-delete the `Media` record (`deletedAt` timestamp), call `S3Service.deleteObject()` for the original key and optimized key. Guard with ownership check.

### 2.3 — Fix DTO Filename Typo

**File**: `src/modules/media/dto/create-media.dto.ts.ts`

**Problem**: The file is named `create-media.dto.ts.ts` — double `.ts` extension. NestJS/TypeScript will still compile it but the filename is incorrect and will cause confusion in imports.

**Solution**: Rename to `create-media.dto.ts`. Update any import paths that reference the old filename.

---

## Phase 3 — Queue Migration: Bull/Redis → AWS SQS

**Goal**: Eliminate the Bull + Redis-DB-1 dependency in production. SQS is free tier (1M requests/month), has native DLQ support, and requires no extra infrastructure on EC2.

### 3.1 — Architecture Overview

```
Upload Request
     │
     ▼
MediaService.initiateUpload()
 → SQS.sendMessage({ jobType: 'image'|'video', mediaId, s3Key })
 
MediaConsumer (polling loop, 1 SQS consumer per type)
 ← SQS.receiveMessage({ QueueUrl, WaitTimeSeconds: 20 })  // long poll
 → process job
 → SQS.deleteMessage() on success
 → leave in queue on failure (→ DLQ after maxReceiveCount: 3)
```

**Long-polling** (`WaitTimeSeconds: 20`) reduces empty-receive API calls to near-zero cost.

### 3.2 — SQS Queue Setup (AWS Console)

Create 4 queues:
| Queue Name | Type | Purpose |
|---|---|---|
| `zalo-media-image-queue` | Standard | Image jobs |
| `zalo-media-image-dlq` | Standard | Image DLQ (maxReceive: 3) |
| `zalo-media-video-queue` | Standard | Video jobs |
| `zalo-media-video-dlq` | Standard | Video DLQ (maxReceive: 3) |

Settings:
- **Visibility timeout**: 5 minutes for images, 15 minutes for video (prevents concurrent duplicate processing)
- **Message retention**: 4 days (default)
- **Redrive policy**: image/video queues → their respective DLQ after 3 failures

### 3.3 — Code Changes

**`queue.config.ts`** — add SQS URL config:
```
sqs: {
  imageQueueUrl: process.env.SQS_IMAGE_QUEUE_URL,
  videoQueueUrl: process.env.SQS_VIDEO_QUEUE_URL,
  region: process.env.AWS_REGION || 'ap-southeast-1',
}
```

**`media.module.ts`** — remove `BullModule.registerQueueAsync`, add `SqsModule` or manual SQS client provider.

**`MediaQueueService`** — replace `Bull.add(jobName, data, opts)` with `SQSClient.send(new SendMessageCommand({ QueueUrl, MessageBody: JSON.stringify(data) }))`.

**`MediaConsumer`** — replace `@Process()` Bull decorator with a `setInterval`/`onModuleInit` polling loop:
1. `ReceiveMessageCommand` with `MaxNumberOfMessages: 10`, `WaitTimeSeconds: 20`
2. For each message: parse body, call existing process method, then `DeleteMessageCommand`
3. On error: do NOT delete → message becomes visible again → eventually hits DLQ

**`app.module.ts`** — remove `BullModule.forRootAsync` registration (or gate it behind `process.env.QUEUE_PROVIDER !== 'sqs'` for local dev compatibility).

### 3.4 — Local Dev Fallback

For local development, keep Bull/Redis as default. Gate with `QUEUE_PROVIDER=sqs|bull` env var.  
When `QUEUE_PROVIDER=bull` (default in `.env.development.local`), existing Bull wiring applies.  
When `QUEUE_PROVIDER=sqs`, SQS consumer activates.

This avoids breaking local dev while enabling production SQS path.

---

## Phase 4 — Cleanup, Metrics & Polish (P2)

**Goal**: Operational hygiene — enable the pieces that were built but turned off, reduce noise, fix schema.

### 4.1 — Enable S3CleanupService

**File**: `src/modules/media/services/s3-cleanup.service.ts`

The service exists but the cron job is commented out or the service is not registered. Enable it:
- Cron schedule: `0 2 * * *` (2 AM daily — low traffic)
- Action: List all `Media` records with `status=PENDING` and `createdAt < now - 24h`, call `S3Service.deleteObject()` for their `s3Key`, then delete the DB record.
- This catches any uploads that were never confirmed (presigned URL used but confirm endpoint never called).

### 4.2 — Reduce MetricsService Cron Frequency

**File**: `src/modules/media/services/media-metrics.service.ts`

Current cron runs every 1 minute — this is excessive for a metrics collection job that writes to DB. On t3.medium with Postgres, this creates 1440 DB writes per day just for metrics.

**Solution**: Change cron expression from `* * * * *` (every minute) to `0 */5 * * *` (every 5 minutes). This reduces writes by 80% with no meaningful loss of metrics granularity.

### 4.3 — Add `optimizedS3Key` to Prisma Schema

**File**: `prisma/schema.prisma`, `Media` model

The `MediaConsumer` saves an optimized version of images (WebP conversion via Sharp) to S3 under a different key, but there's no column to store that key. The optimized URL is therefore never returned to clients.

**Solution**:
```
optimizedS3Key  String?   // S3 key for processed/optimized file (e.g., WebP)
optimizedUrl    String?   // Derived URL (set after processing)
```

Then run `prisma migrate dev --name add_optimized_s3_key`.

### 4.4 — Deduplicate DTOs

**Files**: `src/modules/media/dto/`

Audit for duplicate DTO definitions (there may be two versions of `CreateMediaDto` or `MediaResponseDto` from when the module was refactored). Keep one canonical version per DTO class, remove the other, update all import references.

---

## Environment Variables Reference (MVP)

| Variable | Dev value | Prod value | Notes |
|---|---|---|---|
| `S3_ENDPOINT` | `http://localhost:9000` | _(unset — uses AWS SDK default)_ | MinIO for dev |
| `S3_BUCKET_NAME` | `zalo-clone-media-dev` | `zalo-clone-media-prod` | |
| `S3_FORCE_PATH_STYLE` | `true` | `false` or unset | MinIO needs path style |
| `AWS_ACCESS_KEY_ID` | `minioadmin` | IAM role (EC2 instance profile) | |
| `AWS_SECRET_ACCESS_KEY` | `minioadmin` | IAM role (EC2 instance profile) | |
| `CLOUDFRONT_DOMAIN` | _(empty)_ | `d1xxxx.cloudfront.net` | Optional for MVP |
| `QUEUE_PROVIDER` | `bull` | `sqs` | Phase 3 gate |
| `SQS_IMAGE_QUEUE_URL` | _(unset for bull mode)_ | `https://sqs.ap-southeast-1.amazonaws.com/...` | Phase 3 |
| `SQS_VIDEO_QUEUE_URL` | _(unset for bull mode)_ | `https://sqs.ap-southeast-1.amazonaws.com/...` | Phase 3 |
| `CLAMAV_ENABLED` | `false` | `false` | Disabled for MVP |
| `MAX_IMAGE_SIZE_MB` | `10` | `10` | |
| `MAX_VIDEO_SIZE_MB` | `100` | `100` | |
| `MAX_AUDIO_SIZE_MB` | `20` | `20` | |
| `MAX_DOCUMENT_SIZE_MB` | `25` | `25` | |
| `MAX_VIDEO_DURATION_SECONDS` | `180` | `180` | |
| `UPLOAD_RATE_LIMIT_PER_MINUTE` | `10` | `10` | |
| `PRESIGNED_URL_EXPIRY` | `600` | `600` | 10 min |
| `IMAGE_WORKER_CONCURRENCY` | `4` | `4` | In-process |

---

## Notes

- **No timeline** is set for phases — each phase is a discrete deliverable that can be started independently (except Phase 3 depends on Phase 1 being stable).
- **Phase 3 (SQS)** is the only phase requiring AWS console setup outside of code. All other phases are pure code changes.
- **Phase 0 cleanup** (this document's companion edits) must happen before committing Phase 1 changes to avoid config drift.
