# 1. Base Stage: Cài đặt môi trường Node.js cơ bản
FROM node:25-alpine AS base
WORKDIR /app
# Cài đặt các thư viện hệ thống cần thiết cho Sharp và build tools
RUN apk add --no-cache libc6-compat

# 2. Dependencies Stage: Cài đặt node_modules
FROM base AS deps
COPY package.json package-lock.json ./
# Dùng ci để cài chính xác version trong lock file
RUN npm ci

# 3. Builder Stage: Build source code NestJS
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client (Bắt buộc để code chạy được)
RUN npx prisma generate

# Build code ra thư mục /dist
RUN npm run build

# 4. Runner Stage (Cho API Server chính - nếu cần dùng sau này)
FROM base AS runner
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/src/main.js"]

# 5. Worker Stage (Target for Media Worker — used by docker-compose.workers.yml when scaled out)
# For MVP, workers run in-process in the main app. This stage is kept for future use.
# ffmpeg-static npm package provides ffprobe/ffmpeg binaries — no system install needed.
# HLS transcoding is disabled for MVP, so the system ffmpeg package is not required.
FROM base AS worker

# Copy source đã build
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
# Tạo thư mục temp để worker tải file về xử lý
RUN mkdir -p /tmp/media-worker && chmod 777 /tmp/media-worker

# Chạy worker (NestJS application mode)
# Worker dùng chung code với App, nhưng logic xử lý nằm ở MediaConsumer
CMD ["node", "dist/src/main.js"]