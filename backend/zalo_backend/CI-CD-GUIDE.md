# CI/CD Guide — Zero Manual SSH

Tài liệu này mô tả cách giải quyết 2 vấn đề CI/CD cần làm thủ công trên EC2:

| # | Vấn đề | Giải pháp |
|---|--------|-----------|
| 1 | `docker-compose.prod.yml`, `nginx.conf` không tự đồng bộ từ repo lên EC2 | **Cách A** — SCP trực tiếp từ GitHub Actions runner |
| 2 | `.env` quản lý thủ công, mỗi biến mới phải SSH vào sửa | **Cách X** — AWS SSM Parameter Store làm single source of truth |

---

## Cách A — SCP config files từ GitHub Actions

### Nguyên lý

GitHub Actions runner đã `checkout` code → dùng `appleboy/scp-action` copy thẳng file config lên EC2. Không cần git trên EC2, không cần clone repo.

```
push to main
  → runner checkout code
  → scp docker-compose.prod.yml → EC2 ~/zalo_backend/
  → scp nginx.conf              → EC2 ~/zalo_backend/
```

### Secrets cần thiết (đã có sẵn)

| Secret | Giá trị |
|--------|---------|
| `EC2_HOST` | `18.136.25.102` |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | Nội dung file `zalo_backend_key_pair.pem` |

> Không cần thêm secret mới — Cách A tận dụng 3 secrets SSH đã có.

### Không cần setup trên EC2

Đây là điểm mạnh của Cách A: file được đẩy từ ngoài vào, EC2 hoàn toàn bị động — không cần git, không cần credential gì thêm.

---

## Cách X — AWS SSM Parameter Store

### Tại sao SSM phù hợp với stack này?

EC2 đã gắn **IAM Instance Profile** để dùng S3 và SQS → `aws-cli` trên EC2 tự authenticate qua IAM, không cần key nào. SSM cùng hệ sinh thái → tận dụng luôn.

### Nguyên lý

```
push to main
  → CI/CD SSH vào EC2
  → EC2 tự gọi: aws ssm get-parameters-by-path /zalo/prod/ --with-decryption
  → Sinh ra file .env hoàn chỉnh
  → restart service
```

Khi muốn thêm/sửa env var: **vào AWS SSM Console → edit** → lần deploy tiếp theo tự áp dụng. Không cần SSH, không cần sửa workflow.

---

## Phần 1 — Setup một lần: IAM Policy cho SSM

### Bước 1.1 — Thêm SSM permission vào Instance Profile của EC2

Truy cập **AWS Console → EC2 → Instance → Security → IAM Role** → attach policy sau:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SSMReadZaloProd",
      "Effect": "Allow",
      "Action": [
        "ssm:GetParametersByPath",
        "ssm:GetParameter",
        "ssm:GetParameters"
      ],
      "Resource": "arn:aws:ssm:ap-southeast-1:825765428570:parameter/zalo/prod/*"
    },
    {
      "Sid": "KMSDecrypt",
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": "arn:aws:kms:ap-southeast-1:825765428570:key/*"
    }
  ]
}
```

> Thay `825765428570` bằng AWS Account ID thực của bạn nếu khác.  
> `kms:Decrypt` cần thiết để đọc `SecureString` parameters.

---

## Phần 2 — Setup một lần: Tạo SSM Parameters

Chạy các lệnh dưới đây trên **local machine** (cần AWS CLI + credentials có quyền SSM write).

### Convention đặt tên

```
/zalo/prod/<TÊN_BIẾN>
```

### Bước 2.1 — Kiểm tra aws-cli trên local

```bash
aws --version
aws sts get-caller-identity  # xác nhận đang dùng đúng account
```

### Bước 2.2 — Tạo parameters nhóm Database

```bash
REGION=ap-southeast-1

# String (không nhạy cảm)
aws ssm put-parameter --region $REGION --name "/zalo/prod/POSTGRES_USER"   --value "zalo_user"             --type String     --overwrite
aws ssm put-parameter --region $REGION --name "/zalo/prod/POSTGRES_DB"     --value "zalo_production"        --type String     --overwrite

# SecureString (nhạy cảm — mã hóa KMS)
aws ssm put-parameter --region $REGION --name "/zalo/prod/POSTGRES_PASSWORD" --value "YOUR_POSTGRES_PASSWORD" --type SecureString --overwrite
```

### Bước 2.3 — Redis

```bash
aws ssm put-parameter --region $REGION --name "/zalo/prod/REDIS_PASSWORD" --value "YOUR_REDIS_PASSWORD" --type SecureString --overwrite
```

### Bước 2.4 — JWT

```bash
aws ssm put-parameter --region $REGION --name "/zalo/prod/JWT_ACCESS_SECRET"    --value "YOUR_JWT_ACCESS_SECRET"    --type SecureString --overwrite
aws ssm put-parameter --region $REGION --name "/zalo/prod/JWT_REFRESH_SECRET"   --value "YOUR_JWT_REFRESH_SECRET"   --type SecureString --overwrite
aws ssm put-parameter --region $REGION --name "/zalo/prod/JWT_ACCESS_EXPIRES_IN"  --value "7d"   --type String --overwrite
aws ssm put-parameter --region $REGION --name "/zalo/prod/JWT_REFRESH_EXPIRES_IN" --value "100d" --type String --overwrite
```

### Bước 2.5 — AWS S3 / CloudFront

```bash
aws ssm put-parameter --region $REGION --name "/zalo/prod/S3_BUCKET_NAME"    --value "zalo-clone-media-production" --type String --overwrite
aws ssm put-parameter --region $REGION --name "/zalo/prod/AWS_REGION"         --value "ap-southeast-1"              --type String --overwrite
aws ssm put-parameter --region $REGION --name "/zalo/prod/CLOUDFRONT_DOMAIN"  --value "cdn.zaloclone.me"            --type String --overwrite
```

### Bước 2.6 — SQS

```bash
aws ssm put-parameter --region $REGION --name "/zalo/prod/QUEUE_PROVIDER"              --value "sqs" --type String --overwrite
aws ssm put-parameter --region $REGION --name "/zalo/prod/SQS_IMAGE_QUEUE_URL"         --value "https://sqs.ap-southeast-1.amazonaws.com/825765428570/zalo-media-image-queue" --type String --overwrite
aws ssm put-parameter --region $REGION --name "/zalo/prod/SQS_IMAGE_DLQ_URL"           --value "https://sqs.ap-southeast-1.amazonaws.com/825765428570/zalo-media-image-dlq"   --type String --overwrite
aws ssm put-parameter --region $REGION --name "/zalo/prod/SQS_VIDEO_QUEUE_URL"         --value "https://sqs.ap-southeast-1.amazonaws.com/825765428570/zalo-media-video-queue" --type String --overwrite
aws ssm put-parameter --region $REGION --name "/zalo/prod/SQS_VIDEO_DLQ_URL"           --value "https://sqs.ap-southeast-1.amazonaws.com/825765428570/zalo-media-video-dlq"   --type String --overwrite
aws ssm put-parameter --region $REGION --name "/zalo/prod/SQS_VISIBILITY_TIMEOUT_IMAGE" --value "120"  --type String --overwrite
aws ssm put-parameter --region $REGION --name "/zalo/prod/SQS_VISIBILITY_TIMEOUT_VIDEO" --value "900"  --type String --overwrite
aws ssm put-parameter --region $REGION --name "/zalo/prod/SQS_WAIT_TIME"                --value "20"   --type String --overwrite
```

### Bước 2.7 — WebRTC / TURN

```bash
aws ssm put-parameter --region $REGION --name "/zalo/prod/STUN_SERVER_URL"      --value "stun:stun.l.google.com:19302" --type String     --overwrite
aws ssm put-parameter --region $REGION --name "/zalo/prod/TURN_SERVER_URL"      --value "YOUR_TURN_SERVER_URL"         --type String     --overwrite
aws ssm put-parameter --region $REGION --name "/zalo/prod/TURN_SECRET"          --value "YOUR_TURN_SECRET"             --type SecureString --overwrite
aws ssm put-parameter --region $REGION --name "/zalo/prod/TURN_CREDENTIAL_TTL"  --value "43200"                        --type String     --overwrite
```

### Bước 2.8 — Firebase

> `FIREBASE_PRIVATE_KEY` chứa ký tự xuống dòng `\n` — dùng `file://` để tránh shell escape.

```bash
# Tạo file tạm chứa private key (copy từ Firebase Console → Service Account JSON)
cat > /tmp/firebase_key.txt << 'EOF'
-----BEGIN RSA PRIVATE KEY-----
YOUR_FIREBASE_PRIVATE_KEY_CONTENT
-----END RSA PRIVATE KEY-----
EOF

aws ssm put-parameter --region $REGION --name "/zalo/prod/FIREBASE_PROJECT_ID"   --value "YOUR_FIREBASE_PROJECT_ID"   --type String     --overwrite
aws ssm put-parameter --region $REGION --name "/zalo/prod/FIREBASE_CLIENT_EMAIL" --value "YOUR_FIREBASE_CLIENT_EMAIL" --type String     --overwrite
aws ssm put-parameter --region $REGION --name "/zalo/prod/FIREBASE_PRIVATE_KEY"  --value "$(cat /tmp/firebase_key.txt)" --type SecureString --overwrite

rm /tmp/firebase_key.txt
```

### Bước 2.9 — App config

```bash
aws ssm put-parameter --region $REGION --name "/zalo/prod/CORS_ORIGINS"               --value "https://zaloclone.me,https://www.zaloclone.me" --type String --overwrite
aws ssm put-parameter --region $REGION --name "/zalo/prod/FRONTEND_URL"               --value "https://zaloclone.me"  --type String --overwrite
aws ssm put-parameter --region $REGION --name "/zalo/prod/BCRYPT_ROUNDS"              --value "12"  --type String --overwrite
aws ssm put-parameter --region $REGION --name "/zalo/prod/LOG_LEVEL"                  --value "info" --type String --overwrite
aws ssm put-parameter --region $REGION --name "/zalo/prod/IMAGE_WORKER_CONCURRENCY"   --value "4"   --type String --overwrite
aws ssm put-parameter --region $REGION --name "/zalo/prod/VIDEO_WORKER_CONCURRENCY"   --value "2"   --type String --overwrite
```

### Bước 2.10 — Kiểm tra đã tạo đủ

```bash
aws ssm get-parameters-by-path \
  --path "/zalo/prod/" \
  --region ap-southeast-1 \
  --query "Parameters[*].Name" \
  --output table
# Phải thấy đủ ~27 parameters
```

---

## Phần 3 — Verify trên EC2 (một lần)

SSH vào EC2 và chạy thử script sinh `.env`:

```bash
ssh -i zalo_backend_key_pair.pem ubuntu@18.136.25.102

# Kiểm tra aws-cli có sẵn
aws --version

# Thử gọi SSM (nếu IAM đúng sẽ không báo lỗi)
aws ssm get-parameters-by-path \
  --path "/zalo/prod/" \
  --with-decryption \
  --region ap-southeast-1 \
  --output json \
  --query "Parameters[*].{Name:Name,Value:Value}" | \
python3 -c "
import json, sys
params = json.load(sys.stdin)
for p in params:
    key = p['Name'].split('/')[-1]
    val = p['Value'].replace('\n', '\\\\n')
    print(f'{key}={val}')
" | head -5
# Phải thấy 5 dòng KEY=value, không báo lỗi AccessDenied
```

Nếu gặp `AccessDenied` → kiểm tra lại IAM policy ở Phần 1.

---

## Phần 4 — GitHub Secrets cần thiết

Sau khi chuyển sang SSM, workflow **không cần** lưu secrets ứng dụng trong GitHub nữa.  
Chỉ giữ 3 secrets để SSH vào EC2:

| Secret | Mô tả |
|--------|-------|
| `EC2_HOST` | IP hoặc domain EC2 |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | Nội dung file `.pem` |

> Xóa (hoặc giữ nguyên nhưng không dùng nữa) các secrets cũ: `CLOUDFRONT_DOMAIN`, `SQS_IMAGE_QUEUE_URL`, v.v. Chúng đã được chuyển sang SSM.

---

## Phần 5 — Luồng CI/CD sau khi cập nhật

```
push to main (backend/** thay đổi)
  │
  ├─ Job 1: build-and-push
  │    └─ Build Dockerfile.prod → push trungmai965/zalo_backend:latest
  │
  └─ Job 2: deploy (needs build-and-push)
       │
       ├─ Step 1 [Checkout] — runner lấy code mới nhất
       │
       ├─ Step 2 [Cách A — SCP] — copy 2 file config lên EC2
       │    ├─ docker-compose.prod.yml → ~/zalo_backend/
       │    └─ nginx.conf             → ~/zalo_backend/
       │
       └─ Step 3 [Cách X — SSH] — EC2 tự làm phần còn lại
            ├─ aws ssm get-parameters-by-path /zalo/prod/ → sinh .env
            ├─ docker compose pull api
            ├─ prisma migrate deploy
            ├─ docker compose up -d --force-recreate api
            └─ curl health check
```

---

## Phần 6 — Workflow mới sau đây hoạt động ra sao

File `.github/workflows/backend-deploy.yml` đã được cập nhật:

- **Job `deploy`** thêm bước `actions/checkout@v4` để runner có file code
- **Step "Copy config files"**: dùng `appleboy/scp-action` thay thế cách cũ (git-based)
- **Step "Deploy"**: EC2 gọi SSM để sinh `.env` rồi mới restart — thay thế toàn bộ 2 bước upsert env cũ

---

## Phần 7 — Khi cần thêm env var mới

**Trước đây (thủ công):**
1. SSH vào EC2
2. `nano .env` → thêm dòng mới
3. Restart service

**Sau khi dùng SSM:**
1. Chạy 1 lệnh trên local (hoặc vào AWS Console):
   ```bash
   aws ssm put-parameter --region ap-southeast-1 \
     --name "/zalo/prod/TEN_BIEN_MOI" \
     --value "gia_tri" \
     --type String --overwrite
   ```
2. Push bất kỳ commit nào để trigger deploy (hoặc chạy workflow thủ công)

---

## Phần 8 — Troubleshooting

### SCP thất bại: `Permission denied`

```bash
# Kiểm tra EC2_USER có quyền ghi vào ~/zalo_backend/
ls -la ~/zalo_backend/
```

### SSM thất bại: `AccessDenied`

```bash
# Kiểm tra Instance Profile đang active
curl -s http://169.254.169.254/latest/meta-data/iam/security-credentials/
# Phải trả về tên role, không phải 404
```

### `.env` thiếu biến sau deploy

```bash
# Kiểm tra parameter đã tạo trong SSM chưa
aws ssm get-parameter --name "/zalo/prod/TEN_BIEN" --region ap-southeast-1
```

### Nginx config không áp dụng sau deploy

```bash
# Nginx container cần reload config
docker compose -f docker-compose.prod.yml exec nginx nginx -s reload
# Hoặc restart hoàn toàn
docker compose -f docker-compose.prod.yml restart nginx
```

> Lưu ý: workflow hiện tại chỉ `--force-recreate api`. Nếu `nginx.conf` thay đổi, cần restart nginx thủ công hoặc thêm step vào workflow.
