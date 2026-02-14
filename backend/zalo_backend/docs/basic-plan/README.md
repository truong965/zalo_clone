# 📚 Chat App Architecture Documentation - Complete Guide

**Tạo ngày**: February 12, 2026  
**Scope**: MVP cho 10,000 users với budget $200/6 tháng  
**Status**: ✅ Ready for implementation  

---

## 🎯 TÓM TẮT EXECUTIVE

Bạn đang xây dựng một **chat app realtime** giống Zalo/WhatsApp với:
- **Tính năng**: 1v1 chat, group chat, voice/video call, media sharing, block, privacy
- **Target**: 10,000 users, 3,000 concurrent trong 6 tháng
- **Budget**: $200 AWS student credits
- **Tech stack**: NestJS + Socket.IO + PostgreSQL + Redis + S3

**Kiến trúc hiện tại**: Single instance MVP (đơn giản, rẻ) → Scale sau khi có traffic thực tế

---

## 📁 CÁC FILES TRONG PACKAGE NÀY

### 1️⃣ **ARCHITECTURE.md** (File chính - ĐỌC ĐẦU TIÊN)
**Nội dung**: Kiến trúc tổng thể cho MVP
- Philosophy: Start simple, scale incrementally
- Architecture diagram (text-based)
- Module structure (event-driven monolith)
- Database, Redis, S3, SQS architecture
- Socket.IO real-time strategy
- Security, monitoring, scaling roadmap
- 1,200+ lines, chi tiết từ A-Z

**Khi nào đọc**: 
- ✅ Ngay bây giờ để hiểu big picture
- ✅ Khi cần làm rõ "tại sao lại thiết kế như vậy?"
- ✅ Khi team mới join cần onboarding

**Thay thế**: File `backend/zalo_backend/ARCHITECTURE.md` cũ (quá phức tạp cho MVP)

---

### 2️⃣ **01-AWS-ARCHITECTURE-MVP.md**
**Nội dung**: Chi tiết về AWS infrastructure
- EC2, RDS, ElastiCache, S3, SQS setup
- Cost breakdown từng service (chi tiết đến $)
- Budget analysis: $200 có đủ không? (Spoiler: KHÔNG, nhưng có solution!)
- Free tier optimization strategies
- Scaling triggers và capacity planning
- Disaster recovery, backups

**Khi nào đọc**:
- ✅ Khi setup AWS lần đầu
- ✅ Khi cần estimate costs chính xác
- ✅ Khi quyết định upgrade instance

**Action items**:
- Đọc section "BUDGET REALITY CHECK" → chọn deployment option phù hợp
- Setup billing alerts NGAY (critical!)
- Bookmark CloudWatch metrics

---

### 3️⃣ **02-DATABASE-OPTIMIZATION.md**
**Nội dung**: Tối ưu Prisma schema và queries
- Storage estimation: 20M messages = bao nhiêu GB?
- **CRITICAL**: MessageReceipts table optimization (saves 75% storage)
- Index optimization (remove redundant indexes)
- Query patterns (N+1 problem, pagination)
- Full-text search optimization
- Data cleanup strategies

**Khi nào đọc**:
- ✅ Ngay bây giờ (có 1 issue CRITICAL cần fix!)
- ✅ Khi query chậm (> 200ms)
- ✅ Khi database storage gần đầy

**Action items**:
- [ ] Implement MessageReceipts JSONB refactor (HIGH PRIORITY)
- [ ] Audit indexes với pg_stat_user_indexes
- [ ] Setup slow query logging
- [ ] Add Redis caching cho unread counts

---

### 4️⃣ **03-DEPLOYMENT-GUIDE.md**
**Nội dung**: Hướng dẫn deploy lên AWS từ A-Z (cho người mới)
- AWS account setup (IAM, billing alerts)
- RDS PostgreSQL setup (step-by-step screenshots)
- EC2 instance setup (SSH, install dependencies)
- App deployment (PM2, Nginx, SSL)
- S3 + SQS setup
- Testing & verification
- Troubleshooting common issues

**Khi nào đọc**:
- ✅ Khi sẵn sàng deploy lần đầu
- ✅ Khi team member mới cần deploy
- ✅ Khi gặp lỗi deployment

**Thời gian hoàn thành**: 6-8 giờ (nếu follow guide)

**Checklist**: 
- [ ] Có AWS account + billing alerts
- [ ] Đã có domain/subdomain (optional)
- [ ] Đã push code lên GitHub
- [ ] Đã backup .env files

---

### 5️⃣ **copilot-instructions.md**
**Nội dung**: Instructions cho GitHub Copilot
- Big picture của project
- Module structure và conventions
- Database schema overview
- Redis, S3, SQS usage
- Real-time architecture
- Development workflow
- Cost management tips
- Scaling triggers

**Khi nào dùng**:
- ✅ Copy vào `.github/copilot-instructions.md`
- ✅ Copilot sẽ tự động đọc và follow conventions
- ✅ Update khi architecture thay đổi

**Lợi ích**:
- Copilot suggest code đúng patterns
- Không cần nhắc lại context mỗi lần
- New team members có context ngay

---

## 🚀 HƯỚNG DẪN SỬ DỤNG DOCUMENTS

### Step 1: Đọc & Hiểu Architecture (1-2 giờ)

```bash
# Đọc theo thứ tự:
1. ARCHITECTURE.md (Executive Summary + Architecture Diagram)
2. 01-AWS-ARCHITECTURE-MVP.md (Section: BUDGET REALITY CHECK)
3. Quay lại ARCHITECTURE.md (đọc hết phần còn lại)
```

**Mục tiêu**: 
- Hiểu tại sao chọn single instance MVP
- Hiểu event-driven architecture
- Hiểu data flow patterns

---

### Step 2: Optimize Database (2-3 giờ)

```bash
# Đọc:
02-DATABASE-OPTIMIZATION.md

# Implement:
1. MessageReceipts refactor (CRITICAL)
2. Remove redundant indexes
3. Setup slow query logging
```

**Mục tiêu**:
- Giảm 75% storage của MessageReceipts table
- Queries nhanh hơn 2-3x
- Database ready cho production

---

### Step 3: Deploy to AWS (6-8 giờ)

```bash
# Follow:
03-DEPLOYMENT-GUIDE.md (từng bước một)

# Checklist:
□ AWS account + billing alerts
□ RDS instance running
□ EC2 instance with dependencies
□ App deployed via PM2
□ S3 + SQS configured
□ SSL certificate (optional)
□ Monitoring setup
```

**Mục tiêu**:
- App chạy trên production URL
- Có thể truy cập từ mobile/web
- Monitoring hoạt động

---

### Step 4: Setup Copilot (15 phút)

```bash
# Copy copilot-instructions.md vào project
cp copilot-instructions.md backend/zalo_backend/.github/

# Hoặc nếu muốn share với cả frontend:
cp copilot-instructions.md .github/

# Test Copilot
# Mở VSCode, hỏi Copilot Chat:
"How should I structure a new module in this project?"
# Copilot sẽ reference instructions và answer correctly
```

---

### Step 5: Monitor & Optimize (Ongoing)

```bash
# Hàng ngày:
- Check CloudWatch cost dashboard
- Review PM2 logs: pm2 logs zalo-backend
- Monitor RDS connections/CPU

# Hàng tuần:
- Review slow queries
- Check S3 storage growth
- Test backup restore

# Hàng tháng:
- Optimize costs (delete unused resources)
- Review scaling triggers
- Update documentation
```

---

## ⚠️ CRITICAL ISSUES CẦN FIX NGAY

### 1. MessageReceipts Table (HIGH PRIORITY)

**Vấn đề**: 
- Hiện tại: 1 message trong group 30 người = 30 rows trong MessageReceipts
- 20M messages × 2 receipts = 40M rows (50% database size!)

**Giải pháp**:
```sql
-- Thay vì 30 rows, chỉ cần 1 row với JSONB:
{
  "messageId": 123,
  "groupReceipts": {
    "userId1": {"status": "SEEN", "timestamp": "..."},
    "userId2": {"status": "DELIVERED", "timestamp": "..."}
  },
  "seenCount": 1,
  "deliveredCount": 1,
  "totalRecipients": 30
}
```

**Impact**:
- Storage: 4GB → 1GB (75% reduction)
- Query speed: 2-3x faster
- Cost savings: ~$0.35/month

**Xem chi tiết**: 02-DATABASE-OPTIMIZATION.md (Section 1)

---

### 2. Budget Thực Tế (CRITICAL)

**Vấn đề**: 
- $200 cho 6 tháng = $33/month
- Nhưng actual cost ≈ $85/month (sau free tier hết)
- ❌ Budget KHÔNG ĐỦ!

**Giải pháp**: 
Chọn 1 trong 3 options:

**Option A: Giảm scope** (Recommended)
- Target 2-3K users thay vì 10K
- Use free tier tối đa
- Cost: ~$27/month ✅

**Option B: Self-host everything**
- Chạy Postgres + Redis trên EC2 (không dùng RDS/ElastiCache)
- Cost: ~$30/month ✅
- Risk: No managed backups, phức tạp hơn

**Option C: Hybrid** (My recommendation)
- Month 1-3: Free tier + self-hosted Redis (~$15/month)
- Month 4-6: Upgrade khi cần (~$60/month)
- Total: $45 + $180 = $225 (hơi vượt budget)

**Xem chi tiết**: 01-AWS-ARCHITECTURE-MVP.md (Section: BUDGET REALITY CHECK)

---

## 💰 COST TRACKING

### Expected Costs (Với Free Tier)

| Month | Users | Cost | Notes |
|-------|-------|------|-------|
| 1-3   | 0-5K  | $10-15 | Free tier EC2+RDS, only pay S3+transfer |
| 4-6   | 5-10K | $60-85 | Free tier expires, upgrade to t3.medium |

### Monthly Breakdown (Month 6)

| Service | Instance | Cost |
|---------|----------|------|
| EC2 | t3.medium | $30 |
| RDS | db.t3.micro | $17 |
| Redis | Self-hosted | $0 |
| S3 | 1TB storage | $25 |
| SQS | <1M requests | $0 |
| Data Transfer | 500GB/month | $36 |
| CloudWatch | Basic | $3 |
| **Total** | | **~$111** |

**Cách tiết kiệm**:
- Stop EC2/RDS khi không dev (nights/weekends) → save 50%
- Use S3 Intelligent-Tiering → save 10-20%
- Compress images before upload → save bandwidth
- Delete temp uploads daily → save storage

---

## 📊 SCALING TRIGGERS

**Khi nào cần scale?**

| Metric | Current | Threshold | Action |
|--------|---------|-----------|--------|
| EC2 CPU | 40% | > 70% | Upgrade to t3.large |
| EC2 Memory | 60% | > 80% | Upgrade instance |
| RDS Connections | 20 | > 100 | Add PgBouncer |
| RDS Storage | 12GB | > 18GB | Resize to 40GB |
| Redis Memory | 200MB | > 400MB | Migrate to ElastiCache |
| Socket Connections | 3K | > 4K | Add 2nd instance + ALB |

**Scaling path**:
```
Now: Single instance
  ↓ (when > 10K users)
Phase 2: ALB + 2-3 instances
  ↓ (when > 50K users)
Phase 3: Microservices + Kubernetes
```

---

## 🔒 SECURITY CHECKLIST

**Before going live**:

- [ ] Change all default passwords
- [ ] Enable RDS encryption
- [ ] Enable S3 encryption (SSE-S3)
- [ ] Setup security groups correctly
- [ ] Use IAM roles (not access keys in code)
- [ ] Enable CloudWatch logs (7 days retention)
- [ ] Setup billing alerts
- [ ] Test backup restore
- [ ] Run security scan (npm audit)
- [ ] Setup HTTPS (Let's Encrypt)
- [ ] Rate limiting enabled
- [ ] Input validation on all endpoints

---

## 🎓 LEARNING RESOURCES

### AWS
- **Free Tier**: https://aws.amazon.com/free/
- **EC2**: https://docs.aws.amazon.com/ec2/
- **RDS**: https://docs.aws.amazon.com/rds/
- **S3**: https://docs.aws.amazon.com/s3/
- **Cost Calculator**: https://calculator.aws/

### NestJS
- **Docs**: https://docs.nestjs.com/
- **Event Emitter**: https://docs.nestjs.com/techniques/events
- **Bull Queue**: https://docs.nestjs.com/techniques/queues

### Database
- **Prisma**: https://www.prisma.io/docs/
- **Postgres Indexes**: https://www.postgresql.org/docs/current/indexes.html
- **Connection Pooling**: https://www.prisma.io/docs/guides/performance-and-optimization/connection-management

### Real-time
- **Socket.IO**: https://socket.io/docs/
- **Redis Adapter**: https://socket.io/docs/v4/redis-adapter/
- **WebRTC**: https://webrtc.org/getting-started/overview

---

## 🆘 TROUBLESHOOTING

### Common Issues

**1. "Cannot connect to RDS"**
```bash
# Check security group
# RDS should allow 5432 from EC2 security group

# Test connection
psql -h RDS_ENDPOINT -U postgres -d zalo_chat
```

**2. "Out of memory on EC2"**
```bash
# Check memory
free -h

# Check processes
pm2 list
pm2 monit

# Solution: Upgrade to t3.medium
```

**3. "S3 upload fails"**
```bash
# Check IAM permissions
aws s3 ls s3://your-bucket

# Check presigned URL expiry (15 minutes)
```

**4. "Database queries slow"**
```bash
# Enable slow query log
ALTER SYSTEM SET log_min_duration_statement = 1000;

# Check slow queries
SELECT query, mean_exec_time FROM pg_stat_statements 
ORDER BY mean_exec_time DESC LIMIT 10;

# Add missing indexes
```

**5. "Redis out of memory"**
```bash
# Check Redis memory
redis-cli INFO memory

# Clear cache
redis-cli FLUSHDB

# Increase maxmemory in redis.conf
```

---

## 📞 NEXT STEPS & SUPPORT

### Immediate Actions (This Week)

1. **Đọc tất cả documents** (4-5 giờ)
2. **Fix MessageReceipts optimization** (2-3 giờ)
3. **Setup AWS account + billing alerts** (30 phút)
4. **Deploy to AWS** (6-8 giờ theo guide)
5. **Setup Copilot instructions** (15 phút)
6. **Load testing với Artillery** (2 giờ)

### Week 2-4: Feature Completion

- [ ] Complete Call module (WebRTC)
- [ ] Complete Contact sync
- [ ] Complete Notifications (FCM)
- [ ] Write e2e tests
- [ ] Security hardening
- [ ] Performance optimization

### Month 2-3: Beta Launch

- [ ] User testing (50-100 users)
- [ ] Bug fixes
- [ ] Monitoring & alerting
- [ ] Documentation for users
- [ ] Marketing materials

### Month 4-6: Scale to 10K

- [ ] Optimize costs
- [ ] Scale infrastructure as needed
- [ ] Add missing features
- [ ] Improve performance
- [ ] Plan for Phase 2

---

## 📝 DOCUMENT UPDATES

**Khi nào cần update documents?**

- Architecture changes (new services, modules)
- Cost structure changes (new pricing, free tier expires)
- Scaling thresholds change (after load testing)
- New team members join (update conventions)
- Production incidents (add to troubleshooting)

**How to update**:
```bash
# 1. Edit markdown files
# 2. Commit to git
git add .
git commit -m "docs: update architecture for Phase 2"

# 3. Update Copilot instructions
cp ARCHITECTURE.md .github/copilot-instructions.md

# 4. Notify team
```

---

## ✅ FINAL CHECKLIST

**Trước khi bắt đầu code:**

- [ ] Đã đọc ARCHITECTURE.md (hiểu big picture)
- [ ] Đã đọc 01-AWS-ARCHITECTURE-MVP.md (hiểu costs)
- [ ] Đã đọc 02-DATABASE-OPTIMIZATION.md (biết issues cần fix)
- [ ] Đã chọn deployment option (A, B, hoặc C)
- [ ] Đã setup AWS billing alerts
- [ ] Đã copy copilot-instructions.md vào project
- [ ] Team đã đồng ý với architecture decisions

**Trước khi deploy production:**

- [ ] Đã follow 03-DEPLOYMENT-GUIDE.md hoàn toàn
- [ ] Đã test locally với 1000+ concurrent users
- [ ] Đã implement MessageReceipts optimization
- [ ] Đã setup monitoring & alerts
- [ ] Đã test backup restore
- [ ] Security checklist hoàn thành
- [ ] Team biết cách troubleshoot common issues

---

## 🎉 YOU'RE READY!

Bạn đã có:
- ✅ Complete architecture design
- ✅ Detailed cost breakdown
- ✅ Step-by-step deployment guide
- ✅ Database optimization strategies
- ✅ Copilot instructions for team
- ✅ Scaling roadmap
- ✅ Security best practices
- ✅ Troubleshooting guide

**Next action**: Đọc ARCHITECTURE.md và bắt đầu implement! 🚀

**Questions?** Review documents hoặc search "AWS NestJS deployment" với specific keywords từ documents.

**Good luck!** 💪

---

**Document Package Version**: 1.0  
**Created**: February 12, 2026  
**Total Pages**: ~100+ pages of detailed documentation  
**Estimated Reading Time**: 4-6 hours  
**Estimated Implementation Time**: 2-3 weeks for MVP  
