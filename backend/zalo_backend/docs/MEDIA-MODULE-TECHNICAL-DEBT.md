# Media Module — Technical Debt Report

> Audited: 2026-02-19  
> Scope: `src/modules/media/**`, `src/config/{upload,queue,s3}.config.ts`, `src/common/constants/media.constant.ts`, `src/socket/socket.gateway.ts`, `docker-compose.yml`, `.env.development.local`  
> Severity legend: 🔴 High · 🟡 Medium · 🟢 Low

---

## Table of Contents
1. [Architecture — Socket Namespace](#1-architecture--socket-namespace)
2. [Duplicated Interfaces (Type Pollution)](#2-duplicated-interfaces-type-pollution)
3. [Interfaces in Wrong Files](#3-interfaces-in-wrong-files)
4. [Config / Env Fragmentation](#4-config--env-fragmentation)
5. [Hardcoded Magic Values](#5-hardcoded-magic-values)
6. [Filename Bugs](#6-filename-bugs)
7. [Module Setup Issues](#7-module-setup-issues)
8. [Naming Inconsistencies](#8-naming-inconsistencies)
9. [Dead / Orphaned Code](#9-dead--orphaned-code)
10. [Security Issues](#10-security-issues)
11. [Dependency Direction Violations](#11-dependency-direction-violations)
12. [SQS Client Duplication](#12-sqs-client-duplication)
13. [Summary Table](#13-summary-table)
14. [Recommended Refactor Map](#14-recommended-refactor-map)

---

## 1. Architecture — Socket Namespace

### 🔴 TD-01 — `MediaProgressGateway` is a second parallel WebSocket stack

`MediaProgressGateway` is decorated with `@WebSocketGateway({ namespace: '/media-progress' })`.  
`SocketGateway` is decorated with `@WebSocketGateway({ namespace: '/socket.io' })`.

This creates **two independent Socket.IO connections** per client. Every frontend must maintain both connections, adding latency, memory, and connection quota overhead.

The main gateway already has:
- Per-user rooms: `user:${userId}` managed via `SocketStateService`
- `emitToUser(userId, event, data)` utility that routes to all the user's sockets

**`MediaProgressGateway` is entirely redundant.** The `sendProgress()` method can be replaced by calling `socketGateway.emitToUser(userId, 'progress:{mediaId}', update)` directly. The gateway and its module registration should be deleted.

### 🔴 TD-02 — `MediaProgressGateway` re-implements JWT authentication

`private async authenticateClient(client: Socket)` in `media-progress.gateway.ts` duplicates `SocketAuthService.authenticateSocket()`.  
Two independent JWT verification code paths will diverge over time (e.g., when token shape, expiry logic, or refresh handling changes).

### 🟡 TD-03 — `namespace: '/socket.io'` is the Socket.IO internal endpoint

Using `/socket.io` as a business namespace conflicts with the Socket.IO handshake path (`/socket.io/socket.io.js`, `/socket.io/?EIO=...`). The main gateway should use a clean namespace such as `/` (default) or `/ws`.

---

## 2. Duplicated Interfaces (Type Pollution)

### 🔴 TD-04 — `ImageProcessingJob` defined twice with different shapes

| Location | Shape |
|---|---|
| `queues/media-queue.interface.ts:19` | Extends `FileProcessingJob` (`mediaId`, `s3Key`, + image fields) |
| `processors/image.processor.ts:21` | Standalone (`mediaId`, `s3Key`, `originalWidth`, `originalHeight`) |

Consumers import from both locations at the same time and cast with `as unknown as ImageProcessingJob` to bridge the gap — this is an unsafe cast that silently swallows shape mismatches.

### 🔴 TD-05 — `VideoProcessingJob` defined twice with different shapes

Same problem as TD-04:
- `queues/media-queue.interface.ts:26` — extends `FileProcessingJob`
- `processors/video.processor.ts:31` — standalone with `duration`, `width`, `height`

The canonical definition should live in `media-queue.interface.ts` (the contract layer). Processor files should import from there; the `as unknown as` casts should be removed.

---

## 3. Interfaces in Wrong Files

### 🟡 TD-06 — Domain event interfaces live in a constants file

`src/common/constants/media.constant.ts` exports both pure constants (`MIME_TO_EXTENSION`, `MEDIA_EVENTS`, `RETRY_CONFIG`, `ERROR_MESSAGES`) **and four typed event interfaces** (`MediaUploadedEvent`, `MediaProcessedEvent`, `MediaFailedEvent`, `MediaDeletedEvent`).

Interfaces are contracts, not constants. They should live in a dedicated `events/` or `interfaces/` file (e.g., `src/modules/media/events/media.events.ts`), or in `src/shared/events/contracts/`. Mixing them with plain value maps makes the file dual-purpose and harder to tree-shake or type-export.

### 🟡 TD-07 — `AwsError` interface exported from a service file

`export interface AwsError` is defined in `media-upload.service.ts` and then imported by `s3.service.ts`. This creates a **reverse dependency**: an infrastructure service (`S3Service`) depends on a domain service file for a shared type. `AwsError` should live in `src/shared/types/aws.types.ts` or alongside `s3.service.ts`.

### 🟢 TD-08 — `ProgressUpdate` interface exported from the gateway

`ProgressUpdate` is a DTO/contract type exported directly from `media-progress.gateway.ts`. If the gateway is deleted (see TD-01), this type must move. Even independently, types exported from gateway files leak implementation details.

### 🟢 TD-09 — `FileExistenceResult`, `CleanupResult`, `SqsMessage` are private-ish but module-scoped

These local interfaces (`s3.service.ts:33`, `s3.cleanup.service.ts:13`, `sqs-media.consumer.ts:52`) are used only within their file but are declared at the module top-level without `/** @internal */` or structural isolation. Not blocking, but adds noise.

---

## 4. Config / Env Fragmentation

### 🔴 TD-10 — AWS credentials read via both `ConfigService` and raw `process.env`

In `SqsMediaQueueService` and `SqsMediaConsumer` constructors:
```typescript
const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID')
    ?? process.env.AWS_ACCESS_KEY_ID;
```
`configService.get('AWS_ACCESS_KEY_ID')` will return `undefined` because `AWS_ACCESS_KEY_ID` is not a registered namespace key in `queue.config.ts` — it falls through to `process.env`. The `ConfigService` call is therefore dead code that gives the false impression of using the config system. The actual source is `s3Config`, which already reads these credentials correctly. Solution: both SQS classes should inject `s3Config` or a dedicated `awsConfig` to get credentials from the single registered source.

### 🟡 TD-11 — Queue provider flag evaluated at module-load time

```typescript
// media.module.ts top-level
const IS_SQS = process.env.QUEUE_PROVIDER === 'sqs';
const IS_TEST = process.env.TEST_MODE === 'e2e_client';
```
These are evaluated when the module file is first imported by Node.js — before NestJS's `ConfigModule` has processed `.env.*` files via `dotenv`. It works by coincidence (NestJS's `ConfigModule.forRoot({ envFilePath })` runs `dotenv` synchronously during `AppModule` construction, which happens before module providers are resolved). But it bypasses the config system entirely and will break if `ConfigModule` is ever changed to async loading. These flags should be resolved via a `ConfigService` factory inside the provider declarations.

### 🟡 TD-12 — `RETRY_CONFIG` in `media.constant.ts` duplicates config

`RETRY_CONFIG.DB_FETCH.MAX_ATTEMPTS = 5` and `RETRY_CONFIG.S3_CHECK.MAX_ATTEMPTS = 5` are hardcoded in `media.constant.ts`. These tuning parameters logically belong in `upload.config.ts` (or a dedicated `media.config.ts`) so they are env-configurable. Having them in a constants file means operators cannot change retry behavior without a code deploy.

### 🟡 TD-13 — `streamThresholdBytes`, `maxImageDimension`, `maxVideoDimension` are not env-configurable

In `upload.config.ts`:
```typescript
streamThresholdBytes: 100 * 1024 * 1024, // not from env
maxImageDimension: 8192,                  // not from env
maxVideoDimension: 4096,                  // not from env
```
Unlike the other limit fields, these are hardcoded inline. Since they affect memory usage and security boundaries, they should have env fallbacks.

### 🟢 TD-14 — `queue.config.ts` has a `provider` field that is never injected

`queue.config.ts:provider: process.env.QUEUE_PROVIDER || 'bull'` registers the provider string inside the config namespace, but `media.module.ts` reads `process.env.QUEUE_PROVIDER` directly (see TD-11) rather than going through `configService.get('queue.provider')`. The config field is dead.

---

## 5. Hardcoded Magic Values

### 🟡 TD-15 — Cleanup thresholds hardcoded in `S3CleanupService`

```typescript
private readonly TEMP_FILE_MAX_AGE_HOURS = 24;
private readonly FAILED_UPLOAD_MAX_AGE_DAYS = 7;
private readonly SOFT_DELETED_MAX_AGE_DAYS = 30;
private readonly BATCH_SIZE = 100;
private readonly CONCURRENT_BATCHES = 5;
```
These constants control data retention policies. Retention periods are business decisions, not code constants. They should be env-configurable (via `upload.config.ts` or a new `cleanup.config.ts`).

### 🟡 TD-16 — Image processing thresholds hardcoded in `ImageProcessorService`

```typescript
private readonly THUMBNAIL_SIZES = {
    small: { width: 150, height: 150 },
    medium: { width: 480, height: 480 },
    large: { width: 1024, height: 1024 },
};
private readonly MAX_OPTIMIZED_DIMENSION = 2048;
```
These are configurable product decisions. They should be injectable from `upload.config.ts` (or a processor-specific config namespace).

### 🟡 TD-17 — `MetricsService` cron expression is a raw string literal

```typescript
@Cron('0 */5 * * * *')
```
This should use `CronExpression.EVERY_5_MINUTES` from `@nestjs/schedule/dist/enums` for readability and maintainability, or at minimum be extracted to a named constant.

### 🟢 TD-18 — `enqueueFileProcessing` in `MediaQueueService` hardcodes retry values

```typescript
attempts: 3,
backoff: { type: 'exponential' as const, delay: 2000 },
```
`enqueueImageProcessing` and `enqueueVideoProcessing` use `this.config.retry.*`, but `enqueueFileProcessing` hardcodes its own values that differ from the config.

---

## 6. Filename Bugs

### 🔴 TD-19 — `s3.config.ts.ts` — double extension

`src/config/s3.config.ts.ts` has a double `.ts` extension. The file was likely created or renamed incorrectly. Every import uses the path including the extra `.ts`:
```typescript
import s3Config from 'src/config/s3.config.ts';
```
This works in TypeScript because the import drops the extension, but it is confusing, breaks tools that glob `*.ts` (they pick it up twice), and the `.ts` in the import path is non-standard.  
The file should be `src/config/s3.config.ts` and all imports updated.

---

## 7. Module Setup Issues

### 🟡 TD-20 — `media.module.ts` re-imports `EventEmitterModule`

```typescript
EventEmitterModule, // Global module — re-imported here for explicit documentation
```
`EventEmitterModule.forRoot()` is a global module registered once in `AppModule`. Re-importing it in a feature module is a no-op at best; at worst it can create a second emitter instance depending on NestJS version. The import should be removed.

### 🟡 TD-21 — `JwtModule.register({})` in `MediaModule` is redundant

`MediaModule` registers `JwtModule.register({})` with an empty config. The JWT secret is injected per-call via `jwtConfig.KEY`. This empty registration only exists to satisfy the `JwtService` dependency in `MediaProgressGateway` — which itself should be deleted (TD-01). If retained, a named JWT registration with the correct secret should be used.

### 🟡 TD-22 — `ThrottlerModule.forRoot` in `MediaModule` creates a conflicting local throttler

If the application already has a global `ThrottlerModule.forRoot` in `AppModule`, registering a second one in `MediaModule` creates a local override in scope. This is rarely intentional and means the upload throttling limits are configured in a different place than all other limits.

### 🟡 TD-23 — `PrismaService` re-provided in `MediaModule`

`PrismaService` appears in `MediaModule.providers`. If `PrismaService` is already a global provider (registered in a `DatabaseModule` with `@Global()`), re-providing it creates a second scope. Check whether `PrismaService` is `@Global()` — if so, remove it from `MediaModule.providers`.

### 🟢 TD-24 — Concrete class exported alongside abstract token

```typescript
exports: [
    MediaUploadService,
    S3Service,
    MEDIA_QUEUE_PROVIDER,
    ...(IS_SQS ? [SqsMediaQueueService] : [MediaQueueService]),
]
```
Exporting both the abstract token `MEDIA_QUEUE_PROVIDER` and the concrete class breaks the abstraction. External modules that inject the concrete class bypass the provider strategy entirely. Only `MEDIA_QUEUE_PROVIDER` should be exported.

---

## 8. Naming Inconsistencies

### 🟡 TD-25 — `ImageProcessorService` / `VideoProcessorService` — "Service" suffix is misleading

The files are named `image.processor.ts` / `video.processor.ts` (NestJS Processor convention), but the classes are `ImageProcessorService` / `VideoProcessorService`. NestJS processors are normally named `ImageProcessor` / `VideoProcessor`. The inconsistency makes it unclear whether these are services (stateless, injectable business logic) or processors (queue workers). They are called by consumers; they are not queue processors themselves. Rename to `ImageProcessor` / `VideoProcessor` or keep `Service` suffix and rename files to `image-processor.service.ts` / `video-processor.service.ts`.

### 🟡 TD-26 — Controller comment has wrong file path

`media.controller.ts` has header comment:
```typescript
// src/modules/media/controllers/media-upload.controller.ts
```
Actual path is `src/modules/media/media.controller.ts`. No `controllers/` subdirectory exists.

### 🟢 TD-27 — `s3.cleanup.service.ts` — the filename comment says `s3-cleanup.service.ts`

```typescript
// src/modules/media/services/s3-cleanup.service.ts
```
But the actual filename is `s3.cleanup.service.ts` (dots, not dashes). Pick one convention and stick to it — NestJS convention is kebab-case: `s3-cleanup.service.ts`.

### 🟢 TD-28 — `MediaUploadController` vs `MediaController`

The controller handles not just uploads but also `GET :id` and `DELETE :id`. A more accurate name is `MediaController` in a file named `media.controller.ts` — which is already the filename but not the class name.

---

## 9. Dead / Orphaned Code

### 🟡 TD-29 — `GetMediaDto` is defined but never used

`dto/get-media.dto.ts` defines `GetMediaDto` with `status` and `conversationId` filter fields. No controller endpoint currently uses this DTO. It maps to a list endpoint that was either removed or never implemented.

### 🟢 TD-30 — `confirm-upload.dto.ts` has orphaned commented code at the bottom

```typescript
//     required: false,
//   })
//   @IsString()
//   @IsOptional()
//   checksum?: string;
// }
```
Leftover commented snippet from a prior version. Should be removed.

### 🟢 TD-31 — `THUMBNAIL_SIZES.medium` and `THUMBNAIL_SIZES.large` are never used

`ImageProcessorService.THUMBNAIL_SIZES` defines `medium` and `large` but only `small` is referenced in `processImage()`. Dead configurations increase maintenance burden.

### 🟢 TD-32 — `VIDEO_PRESETS` and `HLS_SEGMENT_DURATION` in `VideoProcessorService` are dead

`TRANSCODING_ENABLED = false` is a permanent flag. `VIDEO_PRESETS` and `HLS_SEGMENT_DURATION` exist only for "future use" — but they are real class fields, not comments. Until HLS is re-enabled, they should either be removed or placed behind a `// TODO: re-enable with HLS task` block.

---

## 10. Security Issues

### 🔴 TD-33 — Real AWS Account ID in version-controlled `.env.development.local`

```dotenv
SQS_IMAGE_QUEUE_URL=https://sqs.ap-southeast-1.amazonaws.com/825765428570/...
```
A real AWS account ID (`825765428570`) is committed in `.env.development.local`. If this file is not in `.gitignore`, this leaks infra identifiers. Additionally, production SQS URLs have no business being in a *development* env file — they should only exist in a separate `.env.production.local` or secrets manager.

### 🔴 TD-34 — `docker-compose.yml` hardcodes weak credentials inline

- `POSTGRES_PASSWORD: 1234` — weak password not using env substitution
- Redis password `password123` hardcoded in the `command:` line (not `${REDIS_PASSWORD}`)
- MinIO credentials `minioadmin/minioadmin` not using env substitution

Docker Compose supports `${VAR}` syntax reading from `.env`. All secrets should use this pattern to keep the compose file credential-free and consistent with the application's `.env.*` files.

### 🟡 TD-35 — `JWT_ACCESS_EXPIRES_IN=100d` in `.env.development.local`

A 100-day JWT expiry is unreasonably long even for development. Stolen dev tokens remain valid for over 3 months. `1d` or `7d` is the appropriate development ceiling.

---

## 11. Dependency Direction Violations

### 🟡 TD-36 — `S3Service` imports `AwsError` from `media-upload.service.ts`

```typescript
// s3.service.ts
import { AwsError } from './media-upload.service';
```
`S3Service` is infrastructure; `MediaUploadService` is a domain service that *uses* `S3Service`. The dependency arrow is reversed. `AwsError` should be defined in `s3.service.ts` (or a shared types file) and re-exported from there.

### 🟢 TD-37 — `media.consumer.ts` imports `ImageProcessingJob` from the processor, not the interface

```typescript
import { ImageProcessingJob, ImageProcessorService } from '../processors/image.processor';
```
Consumers are part of the queue layer. They should import types from `media-queue.interface.ts` (the queue contract), not from processors (the processing layer). This creates a queue→processor coupling instead of processor→queue (which is the correct direction: the processor should conform to the queue's interface).

---

## 12. SQS Client Duplication

### 🟡 TD-38 — `SQSClient` is constructed independently in two places

`SqsMediaQueueService` (sender) and `SqsMediaConsumer` (receiver) each build their own `SQSClient`:
```typescript
// duplicated verbatim in both constructors:
const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID')
    ?? process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = ...
this.client = new SQSClient({ region, credentials: ... });
```
An `SqsClientFactory` (injectable `@Injectable()` class) should construct one `SQSClient` and be shared. This simplifies credential management and allows connection pooling config to be centralized.

---

## 13. Summary Table

| ID | File(s) | Issue | Severity |
|---|---|---|---|
| TD-01 | `media-progress.gateway.ts`, `socket.gateway.ts` | Parallel WebSocket stack — second redundant namespace | 🔴 |
| TD-02 | `media-progress.gateway.ts` | Duplicated JWT auth logic | 🔴 |
| TD-03 | `socket.gateway.ts` | Namespace `/socket.io` conflicts with internal endpoint | 🟡 |
| TD-04 | `image.processor.ts`, `media-queue.interface.ts` | `ImageProcessingJob` defined twice | 🔴 |
| TD-05 | `video.processor.ts`, `media-queue.interface.ts` | `VideoProcessingJob` defined twice | 🔴 |
| TD-06 | `media.constant.ts` | Event interfaces mixed with constants | 🟡 |
| TD-07 | `media-upload.service.ts`, `s3.service.ts` | `AwsError` in wrong file, reverse import | 🟡 |
| TD-08 | `media-progress.gateway.ts` | `ProgressUpdate` exported from gateway | 🟢 |
| TD-09 | Various | Private interfaces at module scope | 🟢 |
| TD-10 | `sqs-media-queue.service.ts`, `sqs-media.consumer.ts` | Credentials via dead ConfigService path + raw process.env | 🔴 |
| TD-11 | `media.module.ts` | `IS_SQS` / `IS_TEST` bypass config system | 🟡 |
| TD-12 | `media.constant.ts` | `RETRY_CONFIG` not env-configurable | 🟡 |
| TD-13 | `upload.config.ts` | `streamThresholdBytes` etc. not env-configurable | 🟡 |
| TD-14 | `queue.config.ts` | `provider` field dead — never consumed | 🟢 |
| TD-15 | `s3.cleanup.service.ts` | Retention thresholds hardcoded | 🟡 |
| TD-16 | `image.processor.ts` | Thumbnail sizes not configurable | 🟡 |
| TD-17 | `metrics.service.ts` | Raw cron string | 🟢 |
| TD-18 | `media-queue.service.ts` | `enqueueFileProcessing` hardcodes retry ignoring config | 🟢 |
| TD-19 | `s3.config.ts.ts` | Double `.ts` extension in filename | 🔴 |
| TD-20 | `media.module.ts` | Re-imports global `EventEmitterModule` | 🟡 |
| TD-21 | `media.module.ts` | Empty `JwtModule.register({})` | 🟡 |
| TD-22 | `media.module.ts` | Local `ThrottlerModule.forRoot` conflicts with global | 🟡 |
| TD-23 | `media.module.ts` | `PrismaService` re-provided if already global | 🟡 |
| TD-24 | `media.module.ts` | Concrete class exported alongside abstract DI token | 🟢 |
| TD-25 | `image.processor.ts`, `video.processor.ts` | `*ProcessorService` naming inconsistency | 🟡 |
| TD-26 | `media.controller.ts` | Wrong path in file-header comment | 🟢 |
| TD-27 | `s3.cleanup.service.ts` | Filename dots vs dashes inconsistency | 🟢 |
| TD-28 | `media.controller.ts` | `MediaUploadController` class name mismatches scope | 🟢 |
| TD-29 | `dto/get-media.dto.ts` | `GetMediaDto` never used | 🟡 |
| TD-30 | `confirm-upload.dto.ts` | Orphaned commented code | 🟢 |
| TD-31 | `image.processor.ts` | `THUMBNAIL_SIZES.medium/large` unused | 🟢 |
| TD-32 | `video.processor.ts` | Dead `VIDEO_PRESETS` + `HLS_SEGMENT_DURATION` | 🟢 |
| TD-33 | `.env.development.local` | Real AWS account ID committed | 🔴 |
| TD-34 | `docker-compose.yml` | Hardcoded weak credentials | 🔴 |
| TD-35 | `.env.development.local` | 100-day JWT expiry in dev | 🟡 |
| TD-36 | `s3.service.ts` | Imports from domain service — reverse dependency | 🟡 |
| TD-37 | `media.consumer.ts` | Queue layer imports from processor layer | 🟢 |
| TD-38 | `sqs-media-queue.service.ts`, `sqs-media.consumer.ts` | `SQSClient` constructed twice | 🟡 |

**Totals: 7 🔴 High · 18 🟡 Medium · 13 🟢 Low**

---

## 14. Recommended Refactor Map

### Phase A — Security (do immediately)
1. Rotate or remove the AWS account ID from `.env.development.local` (TD-33)
2. Fix `docker-compose.yml` to use `${POSTGRES_PASSWORD}` / `${REDIS_PASSWORD}` env vars (TD-34)
3. Set `JWT_ACCESS_EXPIRES_IN=7d` in dev (TD-35)

### Phase B — File/Name hygiene
4. Rename `s3.config.ts.ts` → `s3.config.ts`, update all imports (TD-19)
5. Rename `s3.cleanup.service.ts` → `s3-cleanup.service.ts` / fix header comment (TD-27)
6. Rename processors: decide `ImageProcessor` or `ImageProcessorService`, make file name match (TD-25)
7. Fix controller class name and comment (TD-26, TD-28)

### Phase C — Interface / type cleanup
8. Merge `ImageProcessingJob` / `VideoProcessingJob` — single canonical definition in `media-queue.interface.ts`, processors import from there; remove `as unknown as` casts (TD-04, TD-05, TD-37)
9. Move `AwsError` to `src/shared/types/aws.types.ts` or into `s3.service.ts` (TD-07, TD-36)
10. Move event interfaces out of `media.constant.ts` → `src/modules/media/events/media.events.ts` (TD-06)
11. Delete `GetMediaDto` until a list endpoint exists (TD-29)
12. Remove leftover commented code from `confirm-upload.dto.ts` (TD-30)

### Phase D — Config / env consolidation
13. Add `RETRY_DB_MAX_ATTEMPTS`, `RETRY_S3_MAX_ATTEMPTS` to `upload.config.ts`; remove `RETRY_CONFIG` from `media.constant.ts` (TD-12)
14. Add env vars for `streamThresholdBytes`, `maxImageDimension`, `maxVideoDimension` in `upload.config.ts` (TD-13)
15. Add retention env vars (`TEMP_FILE_MAX_AGE_HOURS`, `SOFT_DELETED_MAX_AGE_DAYS` etc.) and inject into `S3CleanupService` (TD-15)
16. Add thumbnail size + max-dimension env vars, inject into `ImageProcessorService` (TD-16)
17. Fix `queue.config.ts:provider` to be the single consumed source; remove the top-level `IS_SQS` from `media.module.ts` (TD-11, TD-14)
18. Fix AWS credential reading: both SQS classes must use `s3Config` or a shared `awsConfig` token instead of dead `configService.get('AWS_ACCESS_KEY_ID')` (TD-10)

### Phase E — Module wiring
19. Extract `SQSClient` construction into a shared `SqsClientFactory` module (TD-38)
20. Remove `EventEmitterModule` re-import from `MediaModule` (TD-20)
21. Remove empty `JwtModule.register({})` (TD-21)
22. Move `ThrottlerModule.forRoot` to `AppModule` only; use `@SkipThrottle` / `@Throttle` decorator overrides at controller level (TD-22)
23. Confirm `PrismaService` global status; remove from `MediaModule.providers` if global (TD-23)
24. Remove concrete queue class from `MediaModule.exports` — export only `MEDIA_QUEUE_PROVIDER` (TD-24)
25. Remove `enqueueFileProcessing` hardcoded retry values; use `this.config.retry.*` (TD-18)
26. Use `CronExpression.EVERY_5_MINUTES` in `MetricsService` (TD-17)

### Phase F — WebSocket consolidation (largest refactor)
27. Delete `MediaProgressGateway` entirely (TD-01, TD-02, TD-08)
28. Replace `progressGateway.sendProgress(mediaId, update, userId)` calls in both consumers with `socketGateway.emitToUser(userId, \`progress:${mediaId}\`, update)`
29. Rename main gateway namespace from `/socket.io` to `/` or `/ws` (TD-03)
30. Remove `JwtModule` from `MediaModule` once gateway is gone (TD-21 consequence)
31. Remove `MediaProgressGateway` from `MediaModule` providers/exports

### Phase G — Dead code
32. Remove `THUMBNAIL_SIZES.medium/large` from `ImageProcessorService` (TD-31)
33. Remove `VIDEO_PRESETS` and `HLS_SEGMENT_DURATION` or move to a `// future-work` comment block (TD-32)
