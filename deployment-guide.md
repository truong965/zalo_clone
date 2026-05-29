# Hướng Dẫn Deploy Thống Nhất: `zalo_clone` + `ai_zalo` Trên 1 EC2

Tài liệu này là hướng đi chính thức cho lần deploy hiện tại.

Mục tiêu duy nhất:

```text
Deploy backend, ai_zalo, database, redis và nginx trên cùng một EC2: zalo-backend-prod.
```

Không dùng hướng tách 2 EC2 nữa. Không dùng AWS SSM trong lần deploy đầu. Không nhập env thủ công từng biến trên AWS Console. Ta dùng một file `.env` local rồi copy lên EC2 bằng `scp`.

## Trạng Thái Hiện Tại

Bạn đã hoàn thành:

```text
Giai đoạn 1: Tạo EC2 backend.
Giai đoạn 2: SSH vào EC2.
Giai đoạn 3: Cài Docker trên EC2.
```

EC2 hiện tại:

```text
Instance: zalo-backend-prod
OS: Ubuntu Server 26.04 LTS
Instance type: c7i-flex.large
RAM: 4GB
Key pair: D:\HKII-2025-2026\zalo_backend_key_pair.pem
```

Từ giai đoạn tiếp theo, chỉ dùng EC2 này.

## Kiến Trúc Chốt

Trên EC2 `zalo-backend-prod` sẽ chạy:

```text
api             backend NestJS
postgres        database backend
redis           Redis backend
ai              ai_zalo NestJS
ai_postgres     database riêng của ai_zalo
ai_redis        Redis riêng của ai_zalo
nginx           reverse proxy public cho backend
```

Kết nối nội bộ trong Docker:

```text
api -> postgres:5432
api -> redis:6379
api -> ai:3001

ai -> api:3000
ai -> ai_postgres:5432
ai -> ai_redis:6379
```

Không mở các port nội bộ ra internet:

```text
3000
3001
5432
6379
```

Security Group EC2 chỉ cần:

```text
SSH    TCP 22   My IP
HTTP   TCP 80   0.0.0.0/0
HTTPS  TCP 443  0.0.0.0/0
```

Nếu sau này cần TURN/WebRTC relay thì mở thêm `3478`, nhưng bỏ qua trong lần deploy đầu.

## Giai Đoạn 4: Gắn Elastic IP Cho EC2

Vì bạn có domain ở Namecheap, backend production cần IP public ổn định. Hãy gắn Elastic IP vào EC2 `zalo-backend-prod`.

Trên AWS Console:

1. Vào `EC2`.
2. Menu trái chọn `Elastic IPs`.
3. Bấm `Allocate Elastic IP address`.
4. Region giữ `ap-southeast-1`.
5. Bấm `Allocate`.
6. Chọn Elastic IP vừa tạo.
7. Bấm `Actions -> Associate Elastic IP address`.
8. `Resource type`: chọn `Instance`.
9. `Instance`: chọn `zalo-backend-prod`.
10. `Private IP address`: chọn IP mặc định.
11. Bấm `Associate`.

Sau bước này, ghi lại Elastic IP mới. Từ giờ dùng Elastic IP đó để SSH và trỏ domain.

Ví dụ trong các lệnh bên dưới, thay:

```text
<BACKEND_ELASTIC_IP>
```

bằng Elastic IP thật của bạn.

SSH bằng Git Bash:

```bash
ssh -i /d/HKII-2025-2026/zalo_backend_key_pair.pem ubuntu@<BACKEND_ELASTIC_IP>
```

Nếu SSH báo host key changed vì IP từng dùng cho instance khác:

```bash
ssh-keygen -R <BACKEND_ELASTIC_IP>
ssh -i /d/HKII-2025-2026/zalo_backend_key_pair.pem ubuntu@<BACKEND_ELASTIC_IP>
```

## Giai Đoạn 5: Chuẩn Bị Thư Mục Deploy Trên EC2

SSH vào EC2:

```bash
ssh -i /d/HKII-2025-2026/zalo_backend_key_pair.pem ubuntu@<BACKEND_ELASTIC_IP>
```

Tạo thư mục deploy:

```bash
mkdir -p ~/zalo_stack
cd ~/zalo_stack
mkdir -p ssl backups
```

Kiểm tra Docker:

```bash
docker --version
docker compose version
docker ps
```

Nếu `docker ps` chạy được không cần `sudo`, Docker đã ổn.

## Giai Đoạn 6: Chuẩn Bị Domain Namecheap

Trong Namecheap, trỏ domain hoặc subdomain về Elastic IP.

Khuyến nghị dùng subdomain API:

```text
Type: A Record
Host: api
Value: <BACKEND_ELASTIC_IP>
TTL: Automatic
```

Nếu frontend dùng API qua:

```text
https://api.zaloclone.me
```

thì A record `api` phải trỏ về Elastic IP.

Nếu muốn root domain cũng trỏ về EC2:

```text
Type: A Record
Host: @
Value: <BACKEND_ELASTIC_IP>
TTL: Automatic
```

Sau khi cập nhật DNS, kiểm tra từ Git Bash:

```bash
ping api.zaloclone.me
```

DNS có thể mất vài phút đến vài chục phút để cập nhật.

## Giai Đoạn 7: Tạo File Env Production Local

Tạo một file local duy nhất:

```text
D:\HKII-2025-2026\prod.env
```

File này không commit lên GitHub.

Nội dung mẫu:

```env
# =========================================================
# App chung
# =========================================================
NODE_ENV=production
LOG_LEVEL=info

# =========================================================
# Backend API
# =========================================================
API_PORT=3000
PORT=3000

POSTGRES_USER=zalo_prod_user
POSTGRES_PASSWORD=CHANGE_ME_BACKEND_DB_PASSWORD
POSTGRES_DB=zalo_clone_prod_db
DATABASE_URL=postgresql://zalo_prod_user:CHANGE_ME_BACKEND_DB_PASSWORD@postgres:5432/zalo_clone_prod_db?schema=public

BACKEND_REDIS_PASSWORD=CHANGE_ME_BACKEND_REDIS_PASSWORD

JWT_ACCESS_SECRET=CHANGE_ME_LONG_ACCESS_SECRET
JWT_REFRESH_SECRET=CHANGE_ME_LONG_REFRESH_SECRET
JWT_ACCESS_EXPIRES_IN=7d
JWT_REFRESH_EXPIRES_IN=100d

BCRYPT_ROUNDS=12

# =========================================================
# AWS S3 / SQS
# =========================================================
AWS_REGION=ap-southeast-1
S3_BUCKET_NAME=zalo-clone-media-production
CLOUDFRONT_DOMAIN=

QUEUE_PROVIDER=sqs
SQS_IMAGE_QUEUE_URL=CHANGE_ME_IMAGE_QUEUE_URL
SQS_IMAGE_DLQ_URL=CHANGE_ME_IMAGE_DLQ_URL
SQS_VIDEO_QUEUE_URL=CHANGE_ME_VIDEO_QUEUE_URL
SQS_VIDEO_DLQ_URL=CHANGE_ME_VIDEO_DLQ_URL
SQS_VISIBILITY_TIMEOUT_IMAGE=120
SQS_VISIBILITY_TIMEOUT_VIDEO=900
SQS_WAIT_TIME=20

# =========================================================
# Frontend / CORS
# =========================================================
CORS_ORIGINS=https://YOUR_VERCEL_DOMAIN
FRONTEND_URL=https://YOUR_VERCEL_DOMAIN

# =========================================================
# Firebase
# =========================================================
FIREBASE_PROJECT_ID=CHANGE_ME
FIREBASE_CLIENT_EMAIL=CHANGE_ME
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nCHANGE_ME\n-----END PRIVATE KEY-----\n"

# =========================================================
# Daily.co
# =========================================================
DAILY_API_KEY=CHANGE_ME
DAILY_DOMAIN=CHANGE_ME

# =========================================================
# WebRTC / TURN
# =========================================================
STUN_SERVER_URL=stun:stun.l.google.com:19302
TURN_SERVER_URL=
TURN_SECRET=CHANGE_ME_TURN_SECRET
TURN_CREDENTIAL_TTL=43200
DEFAULT_ICE_TRANSPORT_POLICY=relay

# =========================================================
# Backend gọi ai_zalo
# =========================================================
AI_AGENT_ENABLED=true
AI_ZALO_URL=http://ai:3001
AI_UNIFIED_STREAM_ENABLED=false
INTERNAL_API_KEY=CHANGE_ME_SHARED_INTERNAL_API_KEY

# =========================================================
# ai_zalo app
# =========================================================
AI_PORT=3001
MAIN_APP_INTERNAL_URL=http://api:3000

AI_POSTGRES_USER=postgres
AI_POSTGRES_PASSWORD=CHANGE_ME_AI_DB_PASSWORD
AI_POSTGRES_DB=ai_zalo_db
AI_DATABASE_URL=postgresql://postgres:CHANGE_ME_AI_DB_PASSWORD@ai_postgres:5432/ai_zalo_db?schema=public

AI_REDIS_PASSWORD=CHANGE_ME_AI_REDIS_PASSWORD
AI_REDIS_HOST=ai_redis
AI_REDIS_PORT=6379
AI_REDIS_DB=0

# =========================================================
# Qdrant
# =========================================================
QDRANT_URL=CHANGE_ME
QDRANT_API_KEY=CHANGE_ME
QDRANT_COLLECTION_NAME=chat_messages
QDRANT_VECTOR_SIZE=768

# =========================================================
# Gemini
# =========================================================
GEMINI_API_KEY=CHANGE_ME
GEMINI_LLM_MODEL=gemini-2.5-flash
GEMINI_EMBED_MODEL=gemini-embedding-001
GEMINI_EMBED_OUTPUT_DIMENSION=768

# =========================================================
# OpenAI
# =========================================================
OPENAI_API_KEY=CHANGE_ME
OPENAI_ROUTER_MODEL=gpt-5-nano

# =========================================================
# Langfuse
# =========================================================
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=
LANGFUSE_BASE_URL=https://cloud.langfuse.com

# =========================================================
# Cohere / rerank
# =========================================================
COHERE_API_KEY=
COHERE_RERANK_MODEL=rerank-v3.5
RERANK_TOP_N=5
CONTEXT_COMPRESSION_THRESHOLD=1000
HYBRID_SEARCH_DENSE_WEIGHT=0.7
HYBRID_SEARCH_SPARSE_WEIGHT=0.3

# =========================================================
# Groq fallback
# =========================================================
GROQ_API_KEY=
GROQ_LLM_MODEL=llama-3.3-70b-versatile
DEFAULT_LLM_PROVIDER=gemini
FALLBACK_LLM_PROVIDER=groq

# =========================================================
# AI quality thresholds
# =========================================================
CRITIC_GROUNDEDNESS_THRESHOLD=0.7
CRITIC_HALLUCINATION_THRESHOLD=0.3
CRAG_RELEVANCE_THRESHOLD=0.7
CRAG_MAX_RETRIES=1

# =========================================================
# Media worker limits
# =========================================================
IMAGE_WORKER_CONCURRENCY=2
VIDEO_WORKER_CONCURRENCY=1
API_INTERNAL_URL=http://api:3000

MAX_IMAGE_SIZE_MB=10
MAX_VIDEO_SIZE_MB=100
MAX_AUDIO_SIZE_MB=20
MAX_DOCUMENT_SIZE_MB=25
MAX_VIDEO_DURATION_SECONDS=180
MAX_AUDIO_DURATION_SECONDS=600
MAX_IMAGE_DIMENSION=8192
MAX_VIDEO_DIMENSION=4096
STREAM_THRESHOLD_MB=100
UPLOAD_RATE_LIMIT_PER_MINUTE=10
MAX_OPTIMIZED_DIMENSION=2048
```

Giữ đúng các hostname Docker:

```text
api
postgres
redis
ai
ai_postgres
ai_redis
```

Không dùng `localhost` trong file production.

## Giai Đoạn 8: Sửa `ai_zalo/Dockerfile`

File `ai_zalo/Dockerfile` hiện cần copy thêm Prisma files để chạy migration và Prisma client production ổn định.

Sửa thành:

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm install

COPY . .
RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

EXPOSE 3001

CMD ["node", "dist/main"]
```

## Giai Đoạn 9: Tạo Compose Production Chung

Tạo file local:

```text
D:\HKII-2025-2026\zalo_stack\docker-compose.prod.yml
```

Nội dung:

```yaml
services:
  api:
    image: trungmai965/zalo_backend:latest
    container_name: zalo_api_prod
    restart: always
    environment:
      NODE_ENV: production
      PORT: 3000
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${BACKEND_REDIS_PASSWORD}
      REDIS_DB: 0
      JWT_ACCESS_SECRET: ${JWT_ACCESS_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      JWT_ACCESS_EXPIRES_IN: ${JWT_ACCESS_EXPIRES_IN}
      JWT_REFRESH_EXPIRES_IN: ${JWT_REFRESH_EXPIRES_IN}
      AWS_REGION: ${AWS_REGION}
      S3_BUCKET_NAME: ${S3_BUCKET_NAME}
      CLOUDFRONT_DOMAIN: ${CLOUDFRONT_DOMAIN}
      QUEUE_PROVIDER: ${QUEUE_PROVIDER}
      SQS_IMAGE_QUEUE_URL: ${SQS_IMAGE_QUEUE_URL}
      SQS_IMAGE_DLQ_URL: ${SQS_IMAGE_DLQ_URL}
      SQS_VIDEO_QUEUE_URL: ${SQS_VIDEO_QUEUE_URL}
      SQS_VIDEO_DLQ_URL: ${SQS_VIDEO_DLQ_URL}
      SQS_VISIBILITY_TIMEOUT_IMAGE: ${SQS_VISIBILITY_TIMEOUT_IMAGE}
      SQS_VISIBILITY_TIMEOUT_VIDEO: ${SQS_VISIBILITY_TIMEOUT_VIDEO}
      SQS_WAIT_TIME: ${SQS_WAIT_TIME}
      STUN_SERVER_URL: ${STUN_SERVER_URL}
      TURN_SERVER_URL: ${TURN_SERVER_URL}
      TURN_SECRET: ${TURN_SECRET}
      TURN_CREDENTIAL_TTL: ${TURN_CREDENTIAL_TTL}
      DEFAULT_ICE_TRANSPORT_POLICY: ${DEFAULT_ICE_TRANSPORT_POLICY}
      FIREBASE_PROJECT_ID: ${FIREBASE_PROJECT_ID}
      FIREBASE_CLIENT_EMAIL: ${FIREBASE_CLIENT_EMAIL}
      FIREBASE_PRIVATE_KEY: ${FIREBASE_PRIVATE_KEY}
      DAILY_API_KEY: ${DAILY_API_KEY}
      DAILY_DOMAIN: ${DAILY_DOMAIN}
      CORS_ORIGINS: ${CORS_ORIGINS}
      FRONTEND_URL: ${FRONTEND_URL}
      BCRYPT_ROUNDS: ${BCRYPT_ROUNDS}
      LOG_LEVEL: ${LOG_LEVEL}
      AI_AGENT_ENABLED: ${AI_AGENT_ENABLED}
      AI_ZALO_URL: ${AI_ZALO_URL}
      AI_UNIFIED_STREAM_ENABLED: ${AI_UNIFIED_STREAM_ENABLED}
      INTERNAL_API_KEY: ${INTERNAL_API_KEY}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      ai:
        condition: service_started
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  postgres:
    image: postgres:18.1-alpine
    container_name: zalo_postgres_prod
    restart: always
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:8.4-alpine
    container_name: zalo_redis_prod
    restart: always
    command: redis-server --requirepass ${BACKEND_REDIS_PASSWORD} --appendonly yes
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${BACKEND_REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  ai:
    image: trungmai965/ai_zalo:latest
    container_name: ai_zalo_app_prod
    restart: always
    environment:
      PORT: 3001
      NODE_ENV: production
      MAIN_APP_INTERNAL_URL: ${MAIN_APP_INTERNAL_URL}
      INTERNAL_API_KEY: ${INTERNAL_API_KEY}
      AI_UNIFIED_STREAM_ENABLED: ${AI_UNIFIED_STREAM_ENABLED}
      REDIS_HOST: ai_redis
      REDIS_PORT: 6379
      REDIS_PASSWORD: ${AI_REDIS_PASSWORD}
      REDIS_DB: ${AI_REDIS_DB}
      AI_DATABASE_URL: ${AI_DATABASE_URL}
      QDRANT_URL: ${QDRANT_URL}
      QDRANT_API_KEY: ${QDRANT_API_KEY}
      QDRANT_COLLECTION_NAME: ${QDRANT_COLLECTION_NAME}
      QDRANT_VECTOR_SIZE: ${QDRANT_VECTOR_SIZE}
      GEMINI_API_KEY: ${GEMINI_API_KEY}
      GEMINI_LLM_MODEL: ${GEMINI_LLM_MODEL}
      GEMINI_EMBED_MODEL: ${GEMINI_EMBED_MODEL}
      GEMINI_EMBED_OUTPUT_DIMENSION: ${GEMINI_EMBED_OUTPUT_DIMENSION}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
      OPENAI_ROUTER_MODEL: ${OPENAI_ROUTER_MODEL}
      LANGFUSE_PUBLIC_KEY: ${LANGFUSE_PUBLIC_KEY}
      LANGFUSE_SECRET_KEY: ${LANGFUSE_SECRET_KEY}
      LANGFUSE_BASE_URL: ${LANGFUSE_BASE_URL}
      COHERE_API_KEY: ${COHERE_API_KEY}
      COHERE_RERANK_MODEL: ${COHERE_RERANK_MODEL}
      RERANK_TOP_N: ${RERANK_TOP_N}
      CONTEXT_COMPRESSION_THRESHOLD: ${CONTEXT_COMPRESSION_THRESHOLD}
      HYBRID_SEARCH_DENSE_WEIGHT: ${HYBRID_SEARCH_DENSE_WEIGHT}
      HYBRID_SEARCH_SPARSE_WEIGHT: ${HYBRID_SEARCH_SPARSE_WEIGHT}
      GROQ_API_KEY: ${GROQ_API_KEY}
      GROQ_LLM_MODEL: ${GROQ_LLM_MODEL}
      DEFAULT_LLM_PROVIDER: ${DEFAULT_LLM_PROVIDER}
      FALLBACK_LLM_PROVIDER: ${FALLBACK_LLM_PROVIDER}
      CRITIC_GROUNDEDNESS_THRESHOLD: ${CRITIC_GROUNDEDNESS_THRESHOLD}
      CRITIC_HALLUCINATION_THRESHOLD: ${CRITIC_HALLUCINATION_THRESHOLD}
      CRAG_RELEVANCE_THRESHOLD: ${CRAG_RELEVANCE_THRESHOLD}
      CRAG_MAX_RETRIES: ${CRAG_MAX_RETRIES}
    depends_on:
      ai_postgres:
        condition: service_healthy
      ai_redis:
        condition: service_healthy

  ai_postgres:
    image: postgres:18.1-alpine
    container_name: ai_zalo_postgres_prod
    restart: always
    environment:
      POSTGRES_USER: ${AI_POSTGRES_USER}
      POSTGRES_PASSWORD: ${AI_POSTGRES_PASSWORD}
      POSTGRES_DB: ${AI_POSTGRES_DB}
    volumes:
      - ai_postgres_data:/var/lib/postgresql/data
    healthcheck:
      test:
        ["CMD-SHELL", "pg_isready -U ${AI_POSTGRES_USER} -d ${AI_POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5

  ai_redis:
    image: redis:8.4-alpine
    container_name: ai_zalo_redis_prod
    restart: always
    command: redis-server --requirepass ${AI_REDIS_PASSWORD} --appendonly yes
    volumes:
      - ai_redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${AI_REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  nginx:
    image: nginx:alpine
    container_name: zalo_nginx_prod
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
      - nginx_logs:/var/log/nginx
    depends_on:
      - api
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/health"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
  redis_data:
  ai_postgres_data:
  ai_redis_data:
  nginx_logs:
```

Giai đoạn đầu chưa đưa `media-worker` vào compose chung. Sau khi API + AI chạy ổn, thêm worker sau.

## Giai Đoạn 10: Build Và Push Docker Images

### Backend image

Từ máy local Git Bash:

```bash
cd /d/HKII-2025-2026/zalo_clone/backend/zalo_backend
docker build -f Dockerfile.prod -t trungmai965/zalo_backend:latest .
docker push trungmai965/zalo_backend:latest
```

### AI image

```bash
cd /d/HKII-2025-2026/ai_zalo
docker build -t trungmai965/ai_zalo:latest .
docker push trungmai965/ai_zalo:latest
```

Nếu Docker Hub yêu cầu login:

```bash
docker login
```

## Giai Đoạn 11: Copy File Lên EC2

Từ Git Bash local:

```bash
scp -i /d/HKII-2025-2026/zalo_backend_key_pair.pem \
  /d/HKII-2025-2026/prod.env \
  ubuntu@<BACKEND_ELASTIC_IP>:~/zalo_stack/.env
```

```bash
scp -i /d/HKII-2025-2026/zalo_backend_key_pair.pem \
  /d/HKII-2025-2026/zalo_stack/docker-compose.prod.yml \
  ubuntu@<BACKEND_ELASTIC_IP>:~/zalo_stack/docker-compose.prod.yml
```

Copy nginx config HTTP-only mới tạo cho lần deploy đầu:

```bash
scp -i /d/HKII-2025-2026/zalo_backend_key_pair.pem \
  /d/HKII-2025-2026/zalo_stack/nginx.conf \
  ubuntu@<BACKEND_ELASTIC_IP>:~/zalo_stack/nginx.conf
```

SSH vào EC2:

```bash
ssh -i /d/HKII-2025-2026/zalo_backend_key_pair.pem ubuntu@18.136.25.102
```

Trên EC2:

```bash
cd ~/zalo_stack
chmod 600 .env
ls -la
```

## Giai Đoạn 12: Chạy Database Và Redis Trước

Trên EC2:

```bash
cd ~/zalo_stack
docker compose -f docker-compose.prod.yml --env-file .env pull
docker compose -f docker-compose.prod.yml --env-file .env up -d postgres redis ai_postgres ai_redis
docker compose -f docker-compose.prod.yml --env-file .env ps
```

Kiểm tra log:

```bash
docker compose -f docker-compose.prod.yml --env-file .env logs --tail=50 postgres
docker compose -f docker-compose.prod.yml --env-file .env logs --tail=50 ai_postgres
docker compose -f docker-compose.prod.yml --env-file .env logs --tail=50 redis
docker compose -f docker-compose.prod.yml --env-file .env logs --tail=50 ai_redis
```

## Giai Đoạn 13: Chạy Migration

Backend migration:

```bash
docker compose -f docker-compose.prod.yml --env-file .env run --rm api npx prisma migrate deploy
```

AI migration:

```bash
docker compose -f docker-compose.prod.yml --env-file .env run --rm ai npx prisma migrate deploy
```

Nếu migration AI báo lỗi thiếu Prisma file, quay lại kiểm tra Dockerfile `ai_zalo` đã copy `prisma` và `prisma.config.ts` chưa.

## Giai Đoạn 14: Start App

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d api ai nginx
docker compose -f docker-compose.prod.yml --env-file .env ps
```

Kiểm tra log:

```bash
docker compose -f docker-compose.prod.yml --env-file .env logs --tail=100 api
docker compose -f docker-compose.prod.yml --env-file .env logs --tail=100 ai
docker compose -f docker-compose.prod.yml --env-file .env logs --tail=100 nginx
```

## Giai Đoạn 15: Kiểm Tra Health

Trên EC2:

```bash
curl -i http://localhost/health
curl -i http://localhost/api/v1/health
```

Từ máy local:

```bash
curl -i http://<BACKEND_ELASTIC_IP>/health
```

Nếu domain đã trỏ đúng:

```bash
curl -i http://api.zaloclone.me/health
```

HTTPS cần SSL cert. Nếu chưa có SSL, test HTTP trước.

## Giai Đoạn 16: Cấu Hình Vercel Frontend

Trong Vercel Project -> Settings -> Environment Variables -> Production:

```env
VITE_BACKEND_URL=https://api.zaloclone.me
VITE_SOCKET_URL=https://api.zaloclone.me

VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_MEASUREMENT_ID=...
VITE_VAPID_PUBLIC_KEY=...
VITE_AI_UNIFIED_STREAM_ENABLED=false
```

Nếu chưa có HTTPS, tạm dùng:

```env
VITE_BACKEND_URL=http://api.zaloclone.me
VITE_SOCKET_URL=http://api.zaloclone.me
```

Sau khi có SSL, đổi lại HTTPS.

Vercel build settings:

```text
Framework Preset: Vite
Root Directory: frontend/zalo_clone_web
Build Command: npm run build
Output Directory: dist
Install Command: npm install
Production Branch: main
```

Nếu Vercel đang bị skip deploy, kiểm tra:

```text
Project Settings -> Git -> Ignored Build Step
```

Xóa ignored build step trong lần deploy này.

## Giai Đoạn 17: Lệnh Deploy Lại Sau Này

Mỗi lần sửa code backend:

```bash
cd /d/HKII-2025-2026/zalo_clone/backend/zalo_backend
docker build -f Dockerfile.prod -t trungmai965/zalo_backend:latest .
docker push trungmai965/zalo_backend:latest
```

Mỗi lần sửa code AI:

```bash
cd /d/HKII-2025-2026/ai_zalo
docker build -t trungmai965/ai_zalo:latest .
docker push trungmai965/ai_zalo:latest
```

Trên EC2:

```bash
cd ~/zalo_stack
docker compose -f docker-compose.prod.yml --env-file .env pull
docker compose -f docker-compose.prod.yml --env-file .env up -d --force-recreate api ai
docker compose -f docker-compose.prod.yml --env-file .env logs --tail=100 api
docker compose -f docker-compose.prod.yml --env-file .env logs --tail=100 ai
```

Nếu có migration:

```bash
docker compose -f docker-compose.prod.yml --env-file .env run --rm api npx prisma migrate deploy
docker compose -f docker-compose.prod.yml --env-file .env run --rm ai npx prisma migrate deploy
```

## Giai Đoạn 18: Checklist Trước Khi Nói Là Deploy Thành Công

- [ ] EC2 `zalo-backend-prod` đang running.
- [ ] Elastic IP đã gắn vào EC2.
- [ ] Namecheap A record trỏ về Elastic IP.
- [ ] Security Group mở `22`, `80`, `443`.
- [ ] Docker chạy được không cần `sudo`.
- [ ] `~/zalo_stack/.env` đã có trên EC2.
- [ ] `~/zalo_stack/docker-compose.prod.yml` đã có trên EC2.
- [ ] Backend image push thành công.
- [ ] AI image push thành công.
- [ ] `postgres`, `redis`, `ai_postgres`, `ai_redis` healthy.
- [ ] Backend migration chạy xong.
- [ ] AI migration chạy xong.
- [ ] `api`, `ai`, `nginx` running.
- [ ] `curl http://localhost/health` trả về OK.
- [ ] Frontend Vercel trỏ đúng backend URL.

## Ghi Chú Quan Trọng

Không commit các file này:

```text
prod.env
.env
*.pem
```

Không dùng `localhost` trong production compose cho service-to-service. Dùng Docker service name:

```text
postgres
redis
ai
api
ai_postgres
ai_redis
```

Không dùng SSM trong lần deploy đầu. Sau khi hệ thống chạy ổn, có thể chuyển `.env` sang SSM sau.
