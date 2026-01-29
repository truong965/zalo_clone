# Week 8: Critical Production Risks & Mitigations

## 🔥 HIGH-SEVERITY RISKS

### 1. **Memory Leaks in Sharp/FFmpeg**
**Risk**: Long-running workers accumulate memory, eventually causing OOM crashes.

**Mitigation**:
- Restart workers every 24 hours: `maxJobsPerWorker: 1000`
- Monitor memory via Prometheus
- Set Docker memory limits (2GB hard cap)
- Use `sharp.cache(false)` to disable internal caching

```typescript
// In ImageProcessorService constructor
sharp.cache(false);
sharp.simd(true); // Enable SIMD for performance
```

### 2. **FFmpeg Zombie Processes**
**Risk**: Failed FFmpeg jobs leave orphan processes consuming CPU.

**Mitigation**:
- Always use `.on('error')` handler
- Implement job timeout (10 min for videos)
- Kill process tree on failure:

```typescript
import { exec } from 'child_process';

// In VideoProcessorService error handler
private killFFmpegProcesses() {
  exec('pkill -9 ffmpeg', (error) => {
    if (error) this.logger.error('Failed to kill FFmpeg', error);
  });
}
```

### 3. **S3 Eventual Consistency Issues**
**Risk**: `moveObjectAtomic()` may fail if source file not yet visible after upload.

**Current Mitigation**: `waitForFileExistence()` with exponential backoff (3 retries).

**Additional Safeguard**:
- Add 500ms delay before first S3 operation
- Use S3 Strong Consistency (enabled by default in AWS since Dec 2020)

### 4. **Queue Starvation (Videos Blocking Images)**
**Risk**: Long-running video jobs block fast image processing.

**Mitigation**:
- Separate queues: `media-image` and `media-video`
- Dedicated worker containers per queue
- Priority ordering: Images = 0 (high), Videos = 1 (low)

```typescript
// In queue.config.ts
export const IMAGE_QUEUE = 'media-image';
export const VIDEO_QUEUE = 'media-video';
```

### 5. **Disk Space Exhaustion**
**Risk**: Temp files not cleaned up → `/tmp` fills up → worker crashes.

**Mitigation**:
- Always use `finally` block to delete temp files
- Mount `/tmp` as tmpfs (RAM-backed, auto-clears)
- Cron job to clean stale files:

```bash
# In docker-compose.workers.yml
volumes:
  - type: tmpfs
    target: /tmp
    tmpfs:
      size: 1G  # 1GB RAM-backed temp storage
```

## ⚡ PERFORMANCE BOTTLENECKS

### 1. **Sharp CPU Bottleneck**
**Symptom**: Image processing queue backs up during peak hours.

**Solution**:
- Increase `IMAGE_WORKER_CONCURRENCY` to 6-8
- Enable Sharp SIMD: `sharp.simd(true)`
- Use libvips threading: Set `VIPS_CONCURRENCY=2`

### 2. **Redis Connection Pool Exhaustion**
**Symptom**: `Error: All connections in use` during high load.

**Solution**:
```typescript
// In queue.config.ts
redis: {
  host: '...',
  maxRetriesPerRequest: 3,
  enableOfflineQueue: false,
  // Connection pool
  lazyConnect: true,
  showFriendlyErrorStack: true,
}
```

### 3. **Database Connection Saturation**
**Symptom**: Workers stall waiting for DB connections.

**Solution**:
- Use connection pooling: `connection_limit=20` in DATABASE_URL
- Batch DB updates (e.g., update 10 jobs in 1 query)
- Use read replicas for status checks

## 🛡️ RESILIENCE PATTERNS

### 1. **Circuit Breaker for S3**
If S3 is down, don't retry indefinitely:

```typescript
import CircuitBreaker from 'opossum';

const s3Breaker = new CircuitBreaker(this.s3Service.uploadFile, {
  timeout: 30000,      // 30s timeout
  errorThresholdPercentage: 50,
  resetTimeout: 60000, // 1-minute cooldown
});

s3Breaker.fallback(() => {
  throw new Error('S3 service unavailable');
});
```

### 2. **Graceful Shutdown**
Finish in-flight jobs before restart:

```typescript
// In main.ts
process.on('SIGTERM', async () => {
  await app.close();
  await queueService.pauseQueue();
  // Wait for active jobs to finish (max 2 minutes)
  await new Promise(resolve => setTimeout(resolve, 120000));
  process.exit(0);
});
```

### 3. **Dead Letter Queue**
Move failed jobs (after 3 retries) to DLQ for manual review:

```typescript
// In MediaConsumer
@OnQueueFailed()
async onFailed(job: Job, error: Error) {
  if (job.attemptsMade >= 3) {
    await this.dlqService.addJob(job.data, error);
  }
}
```

## 📊 MONITORING ALERTS (Production)

### Critical Alerts (PagerDuty)
- Queue failure rate > 10% (last 5 min)
- Worker container restart loop
- S3 error rate > 5%

### Warning Alerts (Slack)
- Queue backlog > 100 jobs
- Avg processing time > 5 min
- Disk usage > 80%

### Info Alerts (Email)
- Daily processing stats
- Weekly cost report (S3 bandwidth)

## 🔍 DEBUGGING TIPS

### Issue: Jobs stuck in "active" state
**Diagnosis**:
```bash
# Check worker logs
docker logs zalo_media_worker | grep ERROR

# Inspect Redis
redis-cli
> KEYS bull:media-processing:active
> HGETALL bull:media-processing:<job_id>
```

**Fix**: Restart worker, job will auto-retry.

### Issue: HLS segments missing
**Diagnosis**: FFmpeg incomplete transcode.

**Fix**: Check job timeout (increase to 15 min for long videos).

### Issue: Thumbnails not generated
**Diagnosis**: Sharp WASM initialization failure.

**Fix**: Ensure `sharp` is compiled for correct platform:
```bash
npm rebuild sharp --platform=linux --arch=x64
```