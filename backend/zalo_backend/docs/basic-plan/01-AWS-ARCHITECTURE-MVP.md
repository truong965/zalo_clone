# AWS Architecture - Chat App MVP (10K Users, Budget $200/6 months)

**Version**: 1.0  
**Target**: 10,000 users, 3,000 concurrent  
**Budget**: $200 AWS credits over 6 months (~$33/month)  
**Timeline**: 6 months to reach 10K users  
**Philosophy**: **COST-FIRST, SINGLE INSTANCE, SCALE LATER**

---

## 🎯 EXECUTIVE SUMMARY

### Core Principle: **Start Simple, Scale Incrementally**

```
MVP (Month 1-3):
  ├─ 1 EC2 instance (t3.medium)
  ├─ 1 RDS PostgreSQL (db.t3.micro)
  ├─ 1 ElastiCache Redis (cache.t3.micro)
  ├─ S3 for media storage
  ├─ SQS for background jobs
  └─ CloudWatch for basic monitoring

Cost: ~$30-35/month (fits in budget)
```

### Why This Works for 10K Users:
- **Messages**: 200 msg/user/day × 10K users = 2M messages/day ≈ 23 msg/sec (easily handled)
- **Concurrent**: 3K online users = manageable with 1 instance
- **Storage**: 1TB media over 6 months = ~5.5GB/day upload (S3 handles this)
- **Database**: 20M messages ≈ 10-15GB (db.t3.micro can handle)

---

## 📐 ARCHITECTURE DIAGRAM (Text-Based)

```
┌─────────────────────────────────────────────────────────────────┐
│                         USERS (Mobile/Web)                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │ HTTPS/WSS
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    AWS REGION: ap-southeast-1                     │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │           EC2: t3.medium (NestJS App + Socket.IO)          │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │ │
│  │  │   HTTP API   │  │  Socket.IO   │  │ Bull Worker  │     │ │
│  │  │  (REST/GQL)  │  │   Gateway    │  │  Processor   │     │ │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │ │
│  └─────────┼──────────────────┼──────────────────┼────────────┘ │
│            │                  │                  │               │
│            │                  │                  │               │
│  ┌─────────▼──────────────────▼──────────────────▼────────────┐ │
│  │                ElastiCache Redis (cache.t3.micro)           │ │
│  │  • Session storage                                          │ │
│  │  • User presence (online/offline)                           │ │
│  │  • Socket.IO adapter (multi-instance ready)                │ │
│  │  • Cache (user profiles, permissions)                      │ │
│  │  • Redis Streams (chat sync, typing indicators)            │ │
│  │  • Pub/Sub (realtime events)                               │ │
│  └─────────┬─────────────────────────────────────────────────┘ │
│            │                                                     │
│  ┌─────────▼─────────────────────────────────────────────────┐ │
│  │          RDS PostgreSQL (db.t3.micro, 20GB storage)        │ │
│  │  • All persistent data (users, messages, media metadata)  │ │
│  │  • Single instance (no replica for MVP)                   │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    SQS (Standard Queue)                     │ │
│  │  • Media processing jobs (resize, thumbnail)               │ │
│  │  • Push notifications (FCM)                                │ │
│  │  • Background cleanup tasks                                │ │
│  └────────┬───────────────────────────────────────────────────┘ │
│           │                                                       │
│           │ (Worker polls from same EC2 instance)                │
│           │                                                       │
│  ┌────────▼───────────────────────────────────────────────────┐ │
│  │                      S3 Bucket                              │ │
│  │  • Raw uploads: s3://chat-app-media/uploads/               │ │
│  │  • Processed: s3://chat-app-media/processed/               │ │
│  │  • Thumbnails: s3://chat-app-media/thumbnails/             │ │
│  │  • Lifecycle: Delete temp uploads after 24h                │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    CloudWatch Logs                          │ │
│  │  • Application logs (retention: 7 days)                    │ │
│  │  • Error tracking                                          │ │
│  │  • Basic metrics (CPU, memory, DB connections)             │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

---

## 💰 COST BREAKDOWN (Monthly)

### EC2 - t3.medium (2 vCPU, 4GB RAM)
```
Instance: t3.medium
Cost: $0.0416/hour × 730 hours = ~$30.37/month

Why t3.medium?
  ✅ Enough for NestJS + Socket.IO + Bull worker on 1 instance
  ✅ 4GB RAM handles 3K concurrent websocket connections
  ✅ Can upgrade to t3.large later when traffic grows
  ❌ Too small? t3.small (2GB RAM) not enough for everything
  ❌ Too big? t3.large ($60/month) wastes money for MVP
```

### RDS PostgreSQL - db.t3.micro (1 vCPU, 1GB RAM)
```
Instance: db.t3.micro
Storage: 20GB GP3
Cost: 
  - Instance: $0.017/hour × 730 = ~$12.41/month
  - Storage: 20GB × $0.115/GB = $2.30/month
  - Backup: 20GB × $0.095/GB = $1.90/month
Total: ~$16.61/month

Storage Growth Estimate:
  Month 1: 2GB (1K users)
  Month 3: 6GB (5K users)
  Month 6: 12GB (10K users, 20M messages)
  → 20GB lasts through MVP
```

### ElastiCache Redis - cache.t3.micro (0.5GB RAM)
```
Instance: cache.t3.micro
Cost: $0.017/hour × 730 = ~$12.41/month

Redis Memory Usage:
  • Sessions: 3K users × 2KB = 6MB
  • Presence: 10K users × 100 bytes = 1MB
  • Cache (profiles, permissions): ~50MB
  • Socket.IO adapter: ~20MB
  • Streams buffer: ~50MB
Total: ~127MB → 0.5GB is enough
```

### S3 Storage
```
Storage: $0.023/GB/month
  Month 1: 50GB × $0.023 = $1.15
  Month 3: 300GB × $0.023 = $6.90
  Month 6: 1TB × $0.023 = $23.55

Requests:
  PUT: 1M uploads/month × $0.005/1K = $5.00
  GET: 10M fetches/month × $0.0004/1K = $4.00

Month 6 Total: $23.55 + $5 + $4 = ~$32.55/month
```

### SQS
```
Standard Queue (free tier: 1M requests/month)
Estimate: 500K jobs/month (media processing + notifications)
Cost: FREE (under 1M limit)

Month 6 estimate: 2M requests/month
Cost: (2M - 1M free) × $0.40/1M = $0.40/month
```

### CloudWatch Logs
```
Ingestion: 5GB/month × $0.50/GB = $2.50
Storage: 7 days retention (auto-delete)
Cost: ~$2.50/month
```

### Data Transfer
```
OUT to internet:
  Month 1: 100GB × $0.09/GB = $9.00
  Month 6: 500GB × $0.09/GB = $45.00

(First 100GB/month FREE, then $0.09/GB)
Month 6: (500GB - 100GB) × $0.09 = $36.00
```

### 📊 TOTAL MONTHLY COST PROJECTION

| Month | Users | Cost   | Notes |
|-------|-------|--------|-------|
| 1     | 1K    | $70    | Setup costs, low traffic |
| 2     | 3K    | $75    | Growing |
| 3     | 5K    | $85    | S3 storage growing |
| 4     | 7K    | $100   | Need to optimize |
| 5     | 9K    | $120   | Data transfer increasing |
| 6     | 10K   | $140   | Near capacity |

**6-Month Total**: ~$590  
**Budget**: $200  
**⚠️ PROBLEM**: Budget is too tight!

---

## 🚨 BUDGET REALITY CHECK

### The Hard Truth:
**$200 for 6 months is NOT ENOUGH for 10K users with current architecture.**

### Options to Fit Budget:

#### Option A: **Reduce Scope** (Recommended for True MVP)
```
Target: 2-3K users in 6 months instead of 10K

Monthly costs:
  - EC2 t3.small: $15/month
  - RDS db.t3.micro: $17/month
  - Redis cache.t2.micro: $12/month
  - S3: $10/month
  - Data transfer: $15/month
Total: ~$69/month × 6 = $414

Still over budget, BUT:
  - Use AWS free tier first 12 months:
    • RDS: 750 hours/month FREE (1 year)
    • ElastiCache: Not in free tier
    • EC2: 750 hours/month t2.micro FREE
  
Revised cost with free tier:
  - EC2: $0 (use t2.micro free tier)
  - RDS: $0 (free tier)
  - ElastiCache: $12/month
  - S3: $10/month
  - Data transfer: $5/month
Total: ~$27/month × 6 = $162 ✅ FITS BUDGET
```

#### Option B: **Self-Hosted Everything** (Harder to manage)
```
1 EC2 t3.medium ($30/month):
  - Run Postgres on EC2 (not RDS)
  - Run Redis on EC2 (not ElastiCache)
  - Run RabbitMQ on EC2
  
Pros: Only pay for 1 EC2 instance
Cons: 
  - No managed backups
  - You manage everything
  - Higher risk of data loss
  - More DevOps work
```

#### Option C: **Hybrid Approach** (My Recommendation)
```
MVP Phase 1 (Month 1-3): Free Tier + Minimal Paid
  - EC2 t2.micro (free tier)
  - RDS db.t3.micro (free tier)
  - Self-hosted Redis on EC2 (save $12/month)
  - S3 (pay as you go)
  - SQS (free tier)
Cost: ~$15/month × 3 = $45

MVP Phase 2 (Month 4-6): Upgrade as Needed
  - EC2 t3.medium ($30/month) when hitting limits
  - RDS db.t3.micro (now paid ~$17/month)
  - ElastiCache Redis ($12/month) when self-hosted becomes pain
Cost: ~$60/month × 3 = $180

Total: $45 + $180 = $225
→ Slightly over, but manageable with optimization
```

---

## 🎯 MY RECOMMENDATION: **Modified Hybrid Approach**

### Month 1-3 (Target: 3K users)

```yaml
Architecture:
  compute:
    - EC2 t2.micro (free tier)
    - Self-hosted Redis on same instance
    - Self-hosted Postgres (wait, no! Use RDS free tier)
  
  database:
    - RDS db.t3.micro (free tier for 12 months)
  
  storage:
    - S3 (pay as you go)
  
  queue:
    - SQS (free tier: 1M requests/month)
  
  monitoring:
    - CloudWatch (basic, free tier)

Actual Cost: ~$5-10/month (only S3 + data transfer)
```

### Month 4-6 (Target: 7-10K users)

```yaml
When to upgrade:
  - EC2 CPU > 70% sustained: upgrade to t3.small ($15/month)
  - Redis OOM: move to ElastiCache cache.t3.micro ($12/month)
  - DB connections exhausted: upgrade RDS or add read replica

Expected cost: ~$30-40/month
```

---

## 🏗️ TECHNICAL IMPLEMENTATION DETAILS

### 1. EC2 Instance Setup (Single Instance)

```yaml
Instance: t2.micro (free tier) → t3.medium (when scaling)

Services Running on Same Instance:
  ├─ NestJS HTTP API (port 3000)
  ├─ Socket.IO Gateway (port 3000, same process)
  ├─ Bull Worker (background jobs, same process)
  └─ Redis (self-hosted, port 6379) - Month 1-3 only

Why Everything on 1 Instance?
  ✅ Simplest deployment
  ✅ No network latency between services
  ✅ Lowest cost
  ❌ Single point of failure (OK for MVP)
  ❌ Resource contention (monitor closely)
```

### 2. Database Strategy

```yaml
RDS PostgreSQL db.t3.micro:
  vCPU: 1
  RAM: 1GB
  Storage: 20GB GP3 (upgradeable to 64TB)
  Connections: ~150 max

Connection Pooling:
  - Use Prisma default pool: 10 connections
  - Monitor with CloudWatch
  - If hitting limits: add PgBouncer later

Backup:
  - Automated daily backups (7 days retention)
  - Point-in-time recovery
  - Cost: Included in free tier

Multi-AZ: NO (costs 2x, not needed for MVP)
Read Replica: NO (add when read load > 70%)
```

### 3. Redis Strategy

```yaml
Phase 1 (Month 1-3): Self-hosted on EC2
  - Install Redis on EC2: sudo apt install redis-server
  - Config: maxmemory 512mb, maxmemory-policy allkeys-lru
  - Persistence: RDB snapshot every 5 minutes
  - Cost: $0 (included in EC2)

Phase 2 (Month 4+): Migrate to ElastiCache
  - When to migrate:
    • Redis crashes due to OOM
    • Need HA/replication
    • Team size > 1 (managed service easier)
  
  - Migration: Zero downtime
    • Spin up ElastiCache
    • Update Redis URL in .env
    • Restart app
    • Decommission self-hosted Redis
```

### 4. Storage Architecture

```yaml
S3 Bucket Structure:
  chat-app-media/
    ├─ uploads/temp/{uploadId}/{filename}     # Presigned URL uploads
    ├─ uploads/final/{userId}/{messageId}/    # Confirmed uploads
    ├─ processed/images/{messageId}/          # Resized images
    ├─ processed/thumbnails/{messageId}/      # Thumbnails
    └─ processed/videos/{messageId}/          # Future: transcoded videos

S3 Lifecycle Rules:
  - Delete /uploads/temp/* after 24 hours (uncompleted uploads)
  - Transition /uploads/final/* to Glacier after 1 year
  - Delete soft-deleted media after 30 days

Security:
  - Block public access
  - Use presigned URLs (expiry: 15 minutes for upload, 1 hour for download)
  - Server-side encryption: AES-256 (free)
```

### 5. Queue Architecture

```yaml
SQS Queues:

1. media-processing.fifo
   - Image resize/thumbnail
   - Video metadata extraction
   - Retry: 3 attempts, exponential backoff
   - DLQ: media-processing-dead-letter.fifo

2. notifications.fifo
   - Push notifications (FCM)
   - Retry: 5 attempts
   - DLQ: notifications-dead-letter.fifo

3. cleanup-jobs (standard queue)
   - Delete expired temp uploads
   - Purge soft-deleted messages
   - Cron: daily

Processing:
  - Bull library consumes from SQS
  - Worker runs on same EC2 instance (for now)
  - Concurrency: 5 jobs at a time
  - If overloaded: add dedicated worker instance later
```

---

## 🔄 SCALING PATH (Post-MVP)

### When You Outgrow Single Instance:

```
Stage 1: Vertical Scaling (easier)
  ├─ EC2: t3.medium → t3.large → t3.xlarge
  ├─ RDS: db.t3.micro → db.t3.small → db.t3.medium
  └─ Redis: cache.t3.micro → cache.t3.small

Stage 2: Horizontal Scaling (necessary at 50K users)
  ├─ Add ALB (Application Load Balancer)
  ├─ 2-3 EC2 instances behind ALB
  ├─ RDS: Add read replica
  ├─ Redis: Use ElastiCache cluster mode
  └─ Separate worker instances for background jobs

Stage 3: Microservices (if needed at 100K+ users)
  ├─ Extract: Media service, Notification service
  ├─ Use: ECS Fargate or EKS
  └─ Database: Consider sharding
```

---

## 📊 CAPACITY PLANNING

### Current Limits (Single t3.medium + db.t3.micro):

```
Users:
  - Total: 10,000 users
  - Concurrent: 3,000 online
  - Headroom: Can handle up to 5K concurrent before issues

Messages:
  - Throughput: ~100 messages/second
  - Daily: 2M messages/day (200 msg/user × 10K users)
  - Peak: ~500 msg/sec (sustainable with caching)

Database:
  - Storage: 20GB (enough for 20M messages + metadata)
  - Connections: 150 max (10 from app, leaves buffer)
  - Query latency: <50ms (with proper indexes)

WebSocket Connections:
  - Max: 5,000 concurrent connections (4GB RAM)
  - Current: 3,000 (comfortable)

Media:
  - Storage: 1TB (10K users × 100MB average)
  - Upload: ~5GB/day (30% of 2M messages have media)
  - Processing: ~5K images/day (resize queue depth manageable)
```

### Bottleneck Analysis:

| Resource | Current | Limit | Action When Hit |
|----------|---------|-------|-----------------|
| EC2 CPU | 40% | 80% | Upgrade to t3.large |
| EC2 RAM | 60% | 85% | Upgrade or add instance |
| DB Connections | 20 | 150 | Add PgBouncer |
| DB Storage | 12GB | 20GB | Resize to 40GB |
| Redis Memory | 200MB | 512MB | Migrate to ElastiCache |
| S3 Storage | 500GB | Unlimited | Monitor cost |

---

## 🛡️ DISASTER RECOVERY & BACKUPS

### Backup Strategy (MVP):

```yaml
Database (RDS):
  - Automated daily backups: 7 days retention
  - Point-in-time recovery: Last 7 days
  - Manual snapshot: Before major migrations
  
Redis (Self-hosted):
  - RDB snapshot: Every 5 minutes
  - AOF: Disabled (too slow for MVP)
  - Snapshot to S3: Daily at 2 AM (cron job)
  
Application:
  - Code: GitHub (source of truth)
  - Env vars: AWS Systems Manager Parameter Store
  - Configs: Version controlled in repo

Media (S3):
  - Versioning: Disabled (costs extra)
  - Cross-region replication: NO (not needed for MVP)
  - Lifecycle: Archive to Glacier after 1 year
```

### Recovery Scenarios:

| Scenario | RPO | RTO | Recovery Steps |
|----------|-----|-----|----------------|
| EC2 instance failure | 0 | 10 min | Launch new EC2, deploy from GitHub, restore Redis from S3 snapshot |
| RDS failure | 5 min | 10 min | Restore from automated backup |
| Entire region failure | 24h | 2h | Unacceptable for MVP; add multi-region in Phase 2 |
| Accidental deletion | 24h | 1h | Restore from S3 versioning (if enabled) or backup |

---

## 🔒 SECURITY HARDENING (MVP)

```yaml
Network:
  - VPC: Default VPC is OK for MVP
  - Security Groups:
    • EC2: Allow 443 (HTTPS), 80 (HTTP redirect), 22 (SSH from your IP only)
    • RDS: Allow 5432 only from EC2 security group
    • Redis (ElastiCache): Allow 6379 only from EC2 security group
  - IAM Roles:
    • EC2 role: S3 full access, SQS full access, CloudWatch logs
    • Least privilege: No root credentials in code

Application:
  - Rate limiting: 100 req/min per IP (NestJS throttler)
  - JWT tokens: 15 min access, 7 day refresh
  - Password: bcrypt with salt rounds = 12
  - OTP: 6-digit, expires in 5 minutes

Data:
  - At rest:
    • RDS: Enable encryption (free)
    • S3: Enable SSE-S3 (free)
    • ElastiCache: Enable encryption in-transit
  - In transit:
    • HTTPS only (use Let's Encrypt for SSL cert)
    • WSS for websockets

Monitoring:
  - CloudWatch alarms:
    • EC2 CPU > 80%
    • RDS storage > 80%
    • Error rate > 1%
  - Logs: Retain 7 days, auto-delete
```

---

## 📈 MONITORING DASHBOARD

### Key Metrics to Track:

```yaml
Application:
  - API latency (p95): Target < 200ms
  - WebSocket latency: Target < 50ms
  - Error rate: Target < 0.1%
  - Active connections: Current vs max capacity

Infrastructure:
  - EC2 CPU: < 70%
  - EC2 Memory: < 80%
  - EC2 Network: Monitor for saturation
  - RDS CPU: < 60%
  - RDS Storage: < 80%
  - RDS Connections: < 100
  - Redis Memory: < 80%
  - Redis Evictions: Should be 0

Business:
  - Daily active users (DAU)
  - Messages sent/day
  - Media uploads/day
  - Average session duration

Cost:
  - Daily cost tracking
  - Alert if monthly projection > $40
```

### Alerting Rules:

```yaml
Critical (Page immediately):
  - RDS CPU > 90% for 5 minutes
  - EC2 CPU > 90% for 5 minutes
  - Error rate > 5% for 2 minutes
  - No healthcheck success for 5 minutes

Warning (Slack notification):
  - RDS storage > 80%
  - DB connections > 100
  - Redis memory > 80%
  - Daily cost > $2
```

---

## 🚀 DEPLOYMENT CHECKLIST

### Before First Deploy:

- [ ] Setup AWS account (use student email for credits)
- [ ] Create IAM user (not root)
- [ ] Setup billing alerts ($10, $20, $30, $40)
- [ ] Launch RDS db.t3.micro (free tier)
- [ ] Launch EC2 t2.micro (free tier)
- [ ] Create S3 bucket with lifecycle rules
- [ ] Create SQS queues
- [ ] Setup CloudWatch log groups
- [ ] Configure security groups
- [ ] Setup GitHub Actions for CI/CD
- [ ] Document all passwords in password manager

### Ongoing:

- [ ] Daily: Check cost dashboard
- [ ] Weekly: Review CloudWatch metrics
- [ ] Monthly: Optimize unused resources
- [ ] Before scaling: Load test with Artillery

---

## 💡 COST OPTIMIZATION TIPS

1. **Use Free Tier Aggressively**
   - EC2 t2.micro: 750 hours/month (1 instance 24/7)
   - RDS db.t3.micro: 750 hours/month
   - S3: 5GB storage, 20K GET, 2K PUT requests
   - CloudWatch: 10 custom metrics, 5GB logs

2. **Stop Dev Resources**
   - Stop EC2/RDS when not developing (nights/weekends)
   - Use CloudWatch Events to auto-stop at 6 PM, start at 8 AM

3. **Optimize S3**
   - Enable S3 Intelligent-Tiering (auto move to cheaper storage)
   - Delete incomplete multipart uploads after 1 day
   - Compress images before upload (client-side)

4. **Right-Size Instances**
   - Start small (t2.micro)
   - Monitor metrics
   - Upgrade only when hitting 80% consistently

5. **Use Reserved Instances (Phase 2)**
   - 1-year commitment: 40% discount
   - Only when traffic is stable

---

## 📚 NEXT STEPS

See companion documents:
- `02-DATABASE-OPTIMIZATION.md` - Schema tweaks, indexes
- `03-DEPLOYMENT-GUIDE.md` - Step-by-step AWS setup
- `04-COST-MONITORING.md` - Budget tracking automation
- `05-SCALING-PLAYBOOK.md` - When & how to scale each component

---

**Document Status**: Draft v1.0  
**Last Updated**: Based on your requirements  
**Review**: Please validate assumptions before implementation
