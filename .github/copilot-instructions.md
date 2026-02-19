
# Copilot Instructions - zalo_clone

## Big picture
- Monorepo with backend NestJS app in [backend/zalo_backend](backend/zalo_backend) and frontend Vite/React app in [frontend/zalo_clone_web](frontend/zalo_clone_web).
- Backend architecture is a modular monolith with event-driven boundaries; modules own domains and communicate via events/listeners instead of direct imports. See [backend/zalo_backend/ARCHITECTURE.md](backend/zalo_backend/docs/basic-plan/ARCHITECTURE.md) for more details.
- Realtime flows go through Socket.IO in [backend/zalo_backend/src/socket](backend/zalo_backend/src/socket) with Redis adapter for multi-instance broadcast.

## Backend structure and conventions
- Domain modules live in [backend/zalo_backend/src/modules](backend/zalo_backend/src/modules); keep business logic inside each module and use events/listeners for cross-module reactions.
- Cross-cutting, non-business utilities go in [backend/zalo_backend/src/common](backend/zalo_backend/src/common); infrastructure services (Redis, queue, storage, logger) live in [backend/zalo_backend/src/shared](backend/zalo_backend/src/shared).
- Data model and migrations are in [backend/zalo_backend/prisma/schema.prisma](backend/zalo_backend/prisma/schema.prisma) and [backend/zalo_backend/prisma/migrations](backend/zalo_backend/prisma/migrations).
- Search engine module is a concrete example of module layering, caching, and repo/service split: [backend/zalo_backend/src/modules/search_engine](backend/zalo_backend/src/modules/search_engine) (see its README for endpoints, caching, ranking, pagination, and Postgres full-text search setup).
- Socket event handlers live in [backend/zalo_backend/src/socket/events](backend/zalo_backend/src/socket/events); keep realtime message/call/presence logic there instead of in HTTP controllers.

## Integration points
- PostgreSQL + Prisma for source of truth; Redis for cache/pubsub; Bull queue for background jobs; S3-compatible storage (MinIO in dev). See [backend/zalo_backend/docker-compose.yml](backend/zalo_backend/docker-compose.yml).
- Media/background workers run via the worker compose overlay in [backend/zalo_backend/docker-compose.workers.yml](backend/zalo_backend/docker-compose.workers.yml).
- Local infra defaults: Postgres on 5433, Redis requires a password, MinIO bucket is created by the compose init container.

## Key workflows (backend)
- Install/build: `npm install`, `npm run build` in [backend/zalo_backend](backend/zalo_backend).
- Dev server: `npm run start:dev` (alias `npm run dev`). Debug: `npm run start:debug`.
- Prisma: `npm run prisma:generate`, `npm run prisma:migrate`, `npm run prisma:studio` (all read env from `.env.development.local`).
- Tests: `npm run test` (Vitest), `npm run test:e2e`, load tests via `npm run test:load` (Artillery scenarios in test/load-tests).
- Local infra: `docker compose up` from [backend/zalo_backend](backend/zalo_backend); include workers with `docker compose -f docker-compose.yml -f docker-compose.workers.yml up`.

## Frontend notes
- Vite + React 19 app in [frontend/zalo_clone_web](frontend/zalo_clone_web) with Tailwind, React Router 7, TanStack Query, Zustand, Ant Design, and Socket.IO client (see package.json).
- Run with `npm run dev`, build with `npm run build` from [frontend/zalo_clone_web](frontend/zalo_clone_web).
- React Compiler is enabled (see [frontend/zalo_clone_web/README.md](frontend/zalo_clone_web/README.md)), so expect dev/build performance tradeoffs.

## AI agent conventions
- For React refactors, follow composition patterns in [ .agents/skills/vercel-composition-patterns](.agents/skills/vercel-composition-patterns).
- For React performance work, follow the rules in [ .agents/skills/vercel-react-best-practices](.agents/skills/vercel-react-best-practices).
