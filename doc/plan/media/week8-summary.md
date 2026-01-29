# Week 8 Implementation Summary: Background Processing Workers

## 🎯 What We Built

### Core Components

1. **Image Processor** (`image.processor.ts`)
   - Thumbnail generation (150x150px WebP)
   - Optimized version for large images (2048px max)
   - Sharp-based processing with quality optimization
   - ~50-200ms processing time per image

2. **Video Processor** (`video.processor.ts`)
   - Thumbnail extraction (1s timestamp)
   - HLS transcoding (adaptive bitrate)
   - 480p/720p quality presets
   - ~30-120s processing time per video

3. **Queue System** (`media-queue.service.ts` + `media.consumer.ts`)
   - Bull-based job queue on Redis
   - Separate priorities for images/videos
   - Retry logic with exponential backoff
   - Job retention policies (7 days completed, 30 days failed)

4. **WebSocket Gateway** (`media-progress.gateway.ts`)
   - Real-time progress updates to clients
   - Per-user subscription model
   - Event format: `progress:${mediaId}` → `{ status, progress, thumbnailUrl }`

5. **Metrics Service** (`metrics.service.ts`)
   - Queue statistics (waiting, active, failed)
   - Processing rate calculation
   - Automated alerting on thresholds
   - Weekly cleanup cron job

## 📊 Architecture Flow

```
Client Upload → API (confirmUpload)
                  ↓
              Validation (Week 7)
                  ↓
              Enqueue Job → Bull Queue (Redis)
                  ↓
              Worker Process (Separate Container)
                  ↓
              Image/Video Processor
                  ↓
              Update DB + Notify WebSocket
                  ↓
              Client Receives Progress Update
```

## 🔧 Key Technical Decisions

### 1. **Hybrid Processing Model**
- **Small files** (< 100MB): Download to Buffer → Process in RAM
- **Large files** (> 100MB): Stream to temp file → Process on disk
- **Rationale**: Prevents OOM on worker nodes

### 2. **Separate Worker Containers**
- API container: Handles HTTP requests only
- Worker container: Runs Bull consumers
- **Rationale**: Isolate CPU-intensive tasks, enable independent scaling

### 3. **WebP for Thumbnails**
- 25-35% smaller than JPEG at same quality
- Native browser support (98%+ global)
- **Tradeoff**: Slight CPU overhead during generation

### 4. **HLS Over Progressive MP4**
- Adaptive bitrate streaming
- Better mobile experience
- **Tradeoff**: More complex (multiple files), slower processing

### 5. **Queue Priority System**
- Images: Priority 0 (highest)
- Videos: Priority 1 (lower)
- **Rationale**: Don't let long videos block fast image ops

## 📈 Performance Benchmarks (Expected)

### Image Processing
- Small (< 1MB): **50-100ms**
- Medium (1-5MB): **100-300ms**
- Large (5-10MB): **300-800ms**

### Video Processing
- Short (< 30s): **10-30s**
- Medium (30-120s): **30-90s**
- Long (> 120s): **90-180s**

### Queue Throughput
- Images: **50-100 jobs/sec** (with 4 workers)
- Videos: **5-10 jobs/sec** (with 2 workers)

## 🧪 Testing Strategy

### Unit Tests
- ImageProcessorService: Mock Sharp, test thumbnail dimensions
- VideoProcessorService: Mock FFmpeg, test HLS output
- MediaQueueService: Test job enqueueing logic

### Integration Tests
- E2E upload flow with real files
- WebSocket connection and progress updates
- Queue retry logic on failures

### Load Tests (Artillery)
- Ramp up to 50 concurrent uploads/sec
- Measure P95/P99 latency
- Verify error rate < 5%

## 🚀 Deployment Steps

### Phase 1: Staging Validation (Day 1-2)
1. Deploy worker container to staging
2. Run E2E tests with sample images/videos
3. Verify WebSocket events received
4. Check queue metrics in logs

### Phase 2: Gradual Production Rollout (Day 3-4)
1. Enable background processing for 10% of users
2. Monitor error rates and processing times
3. Increase to 50% if metrics are healthy
4. Full rollout to 100%

### Phase 3: Optimization (Day 5+)
1. Tune worker concurrency based on CPU usage
2. Adjust job timeouts based on P99 latency
3. Enable CloudFront caching for thumbnails
4. Setup autoscaling for worker nodes

## 📋 Post-Week 8 Backlog

### Immediate Next Steps (Week 9)
- [ ] Implement CDN purge on file deletion
- [ ] Add admin UI for queue management
- [ ] Setup Prometheus + Grafana dashboards
- [ ] Configure Slack alerts for failures

### Future Enhancements
- [ ] Multi-resolution thumbnails (small/medium/large)
- [ ] Face detection for smart cropping
- [ ] Video subtitle extraction (if present)
- [ ] Audio waveform generation
- [ ] Image EXIF stripping (privacy)
- [ ] Duplicate detection via perceptual hashing

## 🎓 Lessons Learned

### What Went Well
✅ Clean separation of concerns (validation vs processing)  
✅ Idempotent job handlers (safe retries)  
✅ Comprehensive error handling with rollback  
✅ Real-time client feedback via WebSocket

### What Could Be Improved
⚠️ FFmpeg error messages are cryptic (need better parsing)  
⚠️ Sharp memory usage can spike (need periodic worker restarts)  
⚠️ No graceful degradation if workers are down (should queue and process later)

### Production Gotchas
🔥 Always test with **real-world files** (corrupted, edge cases)  
🔥 Monitor **temp disk space** closely (can fill up fast)  
🔥 Use **strong S3 consistency** to avoid race conditions  
🔥 Implement **circuit breakers** for external services (S3, ClamAV)

## 📚 Reference Documentation

- Bull Queue Docs: https://docs.bullmq.io/
- Sharp API: https://sharp.pixelplumbing.com/api-resize
- FFmpeg HLS Guide: https://trac.ffmpeg.org/wiki/StreamingGuide
- Socket.IO Events: https://socket.io/docs/v4/emitting-events/
- NestJS WebSockets: https://docs.nestjs.com/websockets/gateways

---

**Status**: Week 8 implementation complete ✅  
**Next**: Week 9 - Message Delivery System & Real-time Chat  
**Estimated Effort**: 40 hours (5 days × 8 hours)
. Luồng chung (Common Phase) - Áp dụng cho tất cả
Mọi file đều bắt đầu giống nhau để đảm bảo UX nhanh nhất cho Client:

Initiate: Client gọi API lấy Presigned URL. Server tạo record PENDING trong DB.

Upload: Client upload trực tiếp lên S3 (vào folder temp/).

Confirm: Client gọi API confirm. Server kiểm tra file có tồn tại trên S3 không (Retry check để tránh lỗi Eventual Consistency).

Tại đây, flow rẽ nhánh thành 2 đường:

2. Nhóm Audio & Document (Xử lý Đồng bộ / Inline)
Lý do: File nhạc và tài liệu thường không cần transcode nặng (như video) hay resize nhiều bản (như ảnh). Việc xử lý ngay lập tức giúp User nhận kết quả nhanh mà không cần chờ Worker.

Tại MediaUploadService.confirmUpload:

Download Temp: Server tải file từ S3 temp/ về thư mục tạm trên Disk (downloadToLocalTemp).

Validate & Security Scan:

Check Magic Bytes (để chống đổi đuôi file .exe thành .pdf).

Check ClamAV (Quét virus/malware cho PDF/DOC).

Check FFprobe (Kiểm tra header file Audio thực sự).

Move to Permanent: Nếu file sạch, gọi S3 CopyObject sang folder permanent/ và xóa file temp/.

Finish: Update DB thành READY ngay lập tức. Trả về kết quả cho Client.

Bỏ qua Queue: Không bắn Job vào Redis.

3. Nhóm Image & Video (Xử lý Bất đồng bộ / Worker)
Lý do: Xử lý ảnh (resize) và Video (HLS, transcode) rất tốn CPU và RAM. Nếu làm Inline sẽ treo Server API. Phải dùng Worker.

Tại MediaUploadService.confirmUpload:

Update DB: Chuyển trạng thái sang PROCESSING.

Enqueue: Đẩy Job vào Redis Queue (media-processing).

Response: Trả về 200 OK (Processing) cho Client ngay lập tức để Client không phải chờ.

Tại MediaConsumer (Worker):

Receive Job: Worker nhận việc từ Redis.

Validate & Move (Bước quan trọng):

Worker tải file temp về.

Chạy validateAndMoveMedia: Check Magic Bytes, check FFprobe (Video integrity).

Di chuyển file sang permanent/.

Specific Processing:

IMAGE: Dùng Sharp để tạo Thumbnail và file Optimized (WebP).

VIDEO: Dùng FFmpeg để cắt Thumbnail và Transcode ra HLS (m3u8) để stream mượt mà.

Finish: Update DB thành READY kèm theo URL của Thumbnail/HLS. Bắn Socket thông báo cho Client (nếu có).

Tóm tắt Bảo mật (Security Layer)
Flow của bạn hiện tại có 3 lớp bảo vệ chắc chắn:

Lớp 1 (S3 Presigned): Chỉ cho phép upload đúng Content-Type và Content-Length đã đăng ký.

Lớp 2 (Magic Bytes): FileValidationService đọc binary header để xác định loại file thật (không tin vào đuôi file).

Lớp 3 (Deep Scan):

Document: Quét virus bằng ClamAV.

Media: Dùng FFmpeg/Sharp đọc thử metadata. Nếu file lỗi hoặc giả mạo -> Reject ngay.