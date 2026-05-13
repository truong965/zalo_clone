# 06 - Overall Architecture (Mermaid)

Đây là sơ đồ Mermaid (cleaned) thể hiện ranh giới giữa Frontend, Backend (modular monolith), Media Worker và AI system. Bao gồm `Internal API` và `Event Bus`.

```mermaid
flowchart TD---
id: 0f363f79-d485-4088-b506-a6eda32eb033
---
flowchart LR
  %% === Groups & Boundaries ===
  subgraph CLIENTS[Clients - External]
    Web["Web App\n(Vite + React)"]
    Mobile["Mobile App\n(React Native)"]
  end

  subgraph EDGE[Edge Layer - External]
    CDN["CDN / CloudFront"]
    NGINX["NGINX / API Gateway"]
  end

  subgraph ZALO_BACKEND[Backend - zalo_backend (Inside)]
    API["API Server\n(NestJS - public API / HTTP)"]
    SOCKET["Socket.IO Gateway\n(real-time gateway)"]
    MODULES["Modules\n(IAM, Conversation, Message, Media, Call, Search, Admin)"]
    EVENTBUS["Event Bus\n(EventEmitter + Redis Pub/Sub)"]
    INTERNALAPI["Internal API\n(protected routes)"]
    DB["PostgreSQL (Prisma)"]
    CACHE["Redis (cache, pub/sub)"]
  end

  subgraph WORKER[Media Worker - Outside/Adjacent]
    MW["zalo_media_worker\n(SQS consumer, FFmpeg/Sharp)"]
  end

  subgraph AI_SYSTEM[AI System - Outside]
    AI["ai_zalo\n(LangChain, Router, Agents)"]
    LLM["External LLM\n(Gemini / OpenAI)"]
    QDR["QDRANT (vector DB)"]
    AI_DB["Postgres (ai sessions)"]
  end

  subgraph INFRA[Shared Infra - Outside]
    S3["S3 / MinIO (object storage)"]
    SQS["SQS / Queue"]
    COTURN["CotTURN (TURN/STUN)"]
    DAILY["Daily.co (Group calls / SFU)"]
    FCM["Firebase FCM"]
    TELE["Telegram / SMS Provider"]
  end

  %% Client -> Edge -> Backend
  Web -->|HTTPS| CDN
  Mobile -->|HTTPS| CDN
  CDN -->|HTTPS| NGINX
  NGINX -->|HTTPS| API
  Web -->|WS/Socket.IO| SOCKET
  Mobile -->|WS/Socket.IO| SOCKET

  %% Internal flows
  API -->|Read/Write| DB
  API -->|Cache/Presence| CACHE
  SOCKET -->|Pub/Sub| CACHE
  MODULES -->|emit/subscribe| EVENTBUS
  EVENTBUS -->|broadcast| MODULES
  API -->|call| INTERNALAPI
  INTERNALAPI -->|protected HTTP| API

  %% Message flow
  API -.->|send message| MODULES
  MODULES -->|save message| DB
  MODULES -->|emit MESSAGE_SENT| EVENTBUS
  EVENTBUS -->|notify socket| SOCKET
  SOCKET -->|deliver| Web
  EVENTBUS -->|offline store| CACHE

  %% Media flow
  API -->|request presign| S3
  Web -->|upload direct| S3
  API -->|confirm upload -> enqueue| SQS
  SQS -->|job pulled| MW
  MW -->|process (transcode)| S3
  MW -->|callback| INTERNALAPI
  INTERNALAPI -->|update| DB
  INTERNALAPI -->|emit MEDIA_UPLOADED| EVENTBUS
  EVENTBUS -->|notify| SOCKET
  S3 -->|serve| CDN

  %% Call flow
  API -->|create call record| DB
  API -->|get TURN creds| COTURN
  API -->|signal (offer/answer)| SOCKET
  SOCKET -->|relay signaling| Web
  Web -->|P2P media| Web
  API -->|create room| DAILY
  Participants["Participants"] -->|media| DAILY
  API -->|save call history| DB
  EVENTBUS -->|CALL_ENDED| MODULES

  %% AI flow
  API -->|POST /chat -> proxy| INTERNALAPI
  INTERNALAPI -->|HTTP| AI
  AI -->|vector search| QDR
  AI -->|fetch context| DB
  AI -->|call LLM| LLM
  AI -->|save session| AI_DB
  AI -->|callback/stream| INTERNALAPI
  INTERNALAPI -->|broadcast| EVENTBUS
  EVENTBUS -->|deliver| SOCKET

  %% External integrations summary
  API --> FCM
  API --> TELE
  API --> DAILY
  API --> COTURN
  MW --> S3
  AI --> QDR

  classDef outside fill:#f8f9fb,stroke:#aaa,stroke-dasharray: 5 3
  class CLIENTS,EDGE,WORKER,AI_SYSTEM,INFRA outside

  click INTERNALAPI "#" "Internal API: protected HTTP endpoints"
```
