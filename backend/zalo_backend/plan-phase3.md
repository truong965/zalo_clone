# lựa chọn công nghệ
1. Infrastructure Decisions
A. File Storage

Recommendation / Choice

File Storage: AWS S3

CDN: AWS CloudFront (bắt buộc)

Context / Constraint

Có $200 AWS free credit khi tạo tài khoản mới

Rationale

CloudFront tăng tốc tải ảnh

Giảm chi phí Data Transfer Out so với truy cập trực tiếp S3

Free tier của CloudFront hào phóng hơn

Setup Flow

S3 Bucket (Private)

CloudFront (OAI)

User access qua CDN

B. Media Processing
Image Resize / Thumbnail

Recommendation / Choice

Sharp + Bull Queue (Background Job)

Processing Flow

Upload API

Lưu file gốc vào S3

Push job vào Redis

Worker tải file → resize → upload thumbnail lên S3

Update DB

Rationale

Không resize on-the-fly để tránh block CPU của Node.js main thread

Video Transcoding

Recommendation / Choice

FFmpeg chạy trên worker EC2

Why not AWS MediaConvert

MediaConvert tính phí theo phút → không phù hợp budget nhỏ

Rationale

EC2 đã trả tiền sẵn, dùng CPU để xử lý FFmpeg là hợp lý

Chỉ convert sang MP4 (H.264/AAC) để đảm bảo tương thích

Không cần HLS/DASH cho chat app MVP

File Size Limits

Recommendation

Image: 10MB

Video: 50MB

Giới hạn độ dài video: < 3 phút

C. Current Deployment
Backend

Recommendation / Choice

Deploy trên EC2 t3.small

Quản lý bằng Docker Compose

Không dùng Kubernetes / EKS

Rationale

EKS tốn $70/tháng control plane → không phù hợp

Database (Postgres)

Recommendation / Choice

AWS RDS (db.t3.micro)

Rationale

Tự động backup, patch

Dễ setup

Free tier 12 tháng / chi phí thấp

Tránh self-host DB nếu không mạnh về Sysadmin

Redis

Recommendation / Choice

Self-hosted Redis (Docker)

Chạy chung EC2 backend hoặc EC2 riêng t3.micro

Rationale

AWS ElastiCache quá đắt ($15–20/tháng tối thiểu)

Không đáng cho giai đoạn hiện tại

2. Feature Priority
A. Media Upload (Phase 3 – Must Have)

Recommendation / Choice

Upload qua HTTP (POST /upload)

Why not WebSocket

WebSocket phù hợp message nhỏ, real-time

Upload binary lớn qua WS gây nghẽn message flow

Advanced Technique

S3 Presigned URL

Client xin URL từ server

Client upload trực tiếp lên S3

Backend không gánh tải file

UX Requirements

Image: Thumbnail

Video: Poster frame

Player: HTML5 native

B. Voice / Video Call (Phase 4)

Recommendation / Choice

1-on-1 WebRTC P2P

Server chỉ làm Signaling (Socket.IO)

Scope Decisions

Không support Group Call

Không Recording

Rationale

P2P miễn phí, chất lượng cao

Recording tốn storage & phức tạp stream handling

C. Push Notifications (Phase 4)

Recommendation / Choice

Firebase Cloud Messaging (FCM) cho Android, iOS, Web

Design Decisions

Không cần Notification History riêng

Chat history đã đủ

Chỉ lưu riêng System Notifications nếu cần

UX

Rich Notification (avatar, preview message)

D. Search System (Phase 5)

Recommendation / Choice

Postgres Full-text Search (pg_trgm / tsvector)

Why not Elasticsearch

ES cần nhiều RAM (Java heap)

EC2 t3.small không chạy ES ổn định

Postgres search đủ tốt cho < vài triệu records

Scope

Messages

Users

Performance Optimization

Frontend debounce 300ms (as-you-type search)

E. Social Features (Phase 5)

Recommendation / Choice

SQL relational logic cơ bản

Entities

User

FriendRequest

Block

Rationale

Không có rào cản kỹ thuật lớn

F. Admin Dashboard (Phase 6)

Recommendation / Choice

Low-code tools (React Admin)

Why

Tránh tốn thời gian code frontend admin thuần

Metrics

Message volume

S3 storage usage

3. Technical Deep-Dive
A. Database

Partitioning

Chưa cần

Postgres xử lý tốt 10–20M rows

Khi cần → partition theo created_at (monthly)

Sharding

Không làm (Premature Optimization)

Read Replica

Không có (budget ~$33)

Analytics chạy giờ thấp điểm

B. Caching (Redis)

Conversation List

Không cache

Dễ stale khi message liên tục

Query DB + index là đủ

User Profile

Cache avatar, display name, config

Online Status

Redis Bitmap hoặc Set

Heartbeat 30s

TTL key = 40s → auto offline

C. Performance

Current Result

Load test pass 28K connections

Reality Check

EC2 t3.small bottleneck ở CPU (JSON / SSL)

Production Target

5000 concurrent users

Multi-Region

Không

DB master 1 region

Deploy Singapore (ap-southeast-1) cho user VN

D. Security

Virus Scanning

Dùng ClamAV (Docker) nếu cho upload exe/zip/pdf

Rate Limiting

Bắt buộc (NestJS ThrottlerGuard)

Upload: 10 files / phút

Chat: 60 messages / phút

End-to-End Encryption

Không làm

Signal Protocol quá phức tạp

Scope hiện tại:

TLS (HTTPS/WSS)

Encryption at Rest (AWS disk encryption)

# Risk Mitigation Strategies
Risk 1: Storage Cost Explosion
Problem: User spam uploads, forgotten files
Mitigation:
typescript// S3 Lifecycle Policy (Terraform/CloudFormation)
{
  "Rules": [{
    "Id": "Delete unlinked media after 30 days",
    "Filter": {
      "Prefix": "originals/"
    },
    "Status": "Enabled",
    "Expiration": {
      "Days": 30
    }
  }]
}

// Database cleanup job (daily cron)
DELETE FROM media_attachments
WHERE message_id IS NULL
  AND created_at < NOW() - INTERVAL '7 days';
Risk 2: Processing Queue Backup
Problem: Video processing too slow, queue grows
Mitigation:

Limit video duration to 3 minutes
Set Bull job timeout: 5 minutes
Scale workers horizontally if queue > 100 jobs
Monitoring: Queue size alerts (CloudWatch)

Risk 3: S3 Presigned URL Abuse
Problem: URL leaked, used by unauthorized users
Mitigation:

Short expiry: 5 minutes
One-time use tracking (Redis cache)
Rate limit: 10 requests/min per user
CORS policy: Only allow from app domain

Risk 4: Malicious File Upload
Problem: Virus, malware, executable disguised as image
Mitigation:
typescript// ClamAV scan in worker (optional)
import NodeClam from 'clamscan';

const clam = new NodeClam().init({
  clamdscan: {
    host: 'clamav',
    port: 3310,
  },
});

const { isInfected, viruses } = await clam.scanStream(buffer);
if (isInfected) {
  throw new Error(`Virus detected: ${viruses.join(', ')}`);
}
Risk 5: EC2 Instance Crash
Problem: Worker process crashes, jobs lost
Mitigation:

Bull persistence: Redis AOF enabled
Process manager: PM2 with auto-restart
Health checks: ALB monitors /health
Auto Scaling Group (if budget allows)


# Security Checklist

 S3 bucket: Private ACL
 CloudFront: HTTPS only
 Presigned URLs: 5-minute expiry
 Rate limiting: 10 uploads/min
 File validation: MIME type + extension
 Virus scanning: ClamAV (for executables)
 CORS: Restrict to app domain
 CDN: Signed URLs for sensitive media
 IAM: Least privilege for S3 access
 Logging: CloudTrail for S3 events

 # ✅ Phase 3 Deliverables
Week 7: Infrastructure + Upload Flow

 AWS S3 bucket + CloudFront setup
 Prisma schema migration
 S3Service + CloudFrontService
 MediaUploadService (request + confirm)
 Upload API endpoints
 Rate limiting guards

Week 8: Processing Workers

 Bull Queue setup
 ImageProcessor (Sharp thumbnails)
 VideoProcessor (FFmpeg thumbnails)
 Worker monitoring dashboard
 Error handling + retries

Week 9: Integration + Testing

 Update MessageService for media
 WebSocket events for media upload progress
 E2E tests (upload → process → send message)
 Load testing (Artillery)
 Documentation + deployment guide



 # kế hoạch cơ bản 

 Proposed Phase 3 Roadmap (Pending Your Input)
Option A: Media-First Approach
Week 7-9: Media Upload & File Management

File upload service (multipart, resumable)
S3/MinIO integration
Image processing (Sharp - resize, compress)
Video thumbnail generation (FFmpeg)
Media message types (IMAGE, VIDEO, FILE)
Download/streaming endpoints
Storage quota management

Pros:

Complete messaging feature set
High user value (people love sharing media)
Performance optimization opportunity

Cons:

Complex infrastructure (S3, processing workers)
Storage costs consideration


Option B: Social-First Approach
Week 7-9: Friend System & Social Graph

Friend request flow (send, accept, decline)
Block system implementation
Privacy settings enforcement
Contact sync (phone book matching)
User discovery (search by phone)
Friend list with online status

Pros:

Lower infrastructure complexity
Schema already exists
Critical for user growth (network effects)

Cons:

Less "wow" factor than media
Requires careful privacy handling


Option C: Notification-First Approach
Week 7-9: Push Notification System

FCM integration (Android/iOS)
Web Push (Service Worker)
Notification service architecture
Device token management
Notification templates
Mute/unmute logic
Badge count management

Pros:

Critical for user retention
Re-engagement mechanism
Relatively straightforward

Cons:

Requires mobile app development in parallel
Complex testing (real devices needed)