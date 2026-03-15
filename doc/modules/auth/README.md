# Module: Authentication

> **Cập nhật lần cuối:** 12/03/2026 (fix B1–B8)
> **Nguồn sự thật:** `src/modules/auth/`
> **Swagger:** `/api/docs` → tag `Authentication`

---

## 1. Tổng quan

### Chức năng chính

Module Auth chịu trách nhiệm:

- Xác thực danh tính người dùng bằng số điện thoại + mật khẩu
- Phát hành và quản lý cặp token (access JWT stateless + refresh JWT lưu DB)
- Xoay vòng refresh token với cơ chế **token family reuse detection**
- Quản lý session đa thiết bị (mỗi `deviceId` có một session độc lập)
- Xác thực kết nối WebSocket (Socket.IO handshake)

### Danh sách Use Case

| # | Use Case |
|---|---|
| UC-1 | Đăng nhập bằng số điện thoại + mật khẩu |
| UC-2 | Làm mới access token (refresh rotation) |
| UC-3 | Đăng xuất khỏi thiết bị hiện tại |
| UC-4 | Xem danh sách session đang hoạt động |
| UC-5 | Đăng xuất từ xa thiết bị khác |
| UC-6 | Xem hồ sơ cá nhân (`/auth/me`) |
| UC-7 | Xác thực WebSocket handshake |

### Phụ thuộc vào module khác

| Module | Vai trò |
|---|---|
| `UsersModule` | Tra cứu user theo số điện thoại, đăng ký user mới, lấy profile |
| `ConfigModule` (jwtConfig) | Secret keys, thời hạn token, cookie options |
| `EventEmitterModule` | Emit `user.logged_out` khi đăng xuất (CallModule lắng nghe) |
| `IdempotencyModule` | Dùng trong `SecurityEventHandler` (xử lý `auth.security.revoked`) |
| `PrismaService` | Lưu trữ `UserToken` (refresh token family) |

---

## 2. API

> Xem chi tiết Request/Response tại Swagger UI: `/api/docs` → tag `Authentication`

| Method | Endpoint | Mô tả | Auth |
|--------|----------|-------|------|
| `POST` | `/auth/register` | Đăng ký tài khoản mới | Public |
| `POST` | `/auth/login` | Đăng nhập — trả accessToken trong body, refreshToken qua cookie | Public |
| `POST` | `/auth/refresh` | Xoay vòng token — đọc refreshToken từ cookie | Public + `JwtRefreshGuard` |
| `POST` | `/auth/logout` | Đăng xuất thiết bị hiện tại — xoá session + cookie | `JwtAuthGuard` |
| `GET` | `/auth/me` | Lấy hồ sơ người dùng hiện tại (kèm role + permissions) | `JwtAuthGuard` |
| `GET` | `/auth/sessions` | Danh sách session đang hoạt động của user | `JwtAuthGuard` |
| `DELETE` | `/auth/sessions/:deviceId` | Đăng xuất từ xa một thiết bị cụ thể | `JwtAuthGuard` |

**Ghi chú endpoint:**
- `POST /auth/register` delegates toàn bộ logic sang `UsersService.register()`.
- `POST /auth/logout` trả về `204 No Content`.
- `DELETE /auth/sessions/:deviceId` trả về `204 No Content`.
- Refresh token **không bao giờ** xuất hiện trong response body — chỉ qua `HttpOnly` cookie.

---

## 3. Activity Diagram

### 3.1 — Luồng đăng nhập (Login + Token Issuance)

```mermaid
flowchart TD
    A([POST /auth/login]) --> B[DeviceFingerprintService\nextractDeviceInfo\nSHA-256 hash từ UA + headers]
    B --> C[UsersService.findByPhoneNumber\nPrisma: user.findUnique]
    C --> D{User tồn tại?}
    D -- Không --> ERR1[401 Invalid credentials]
    D -- Có --> G{user.status\n=== ACTIVE?}
    G -- Không --> ERR1
    G -- Có --> E[isValidPassword\nbcrypt.compare async]
    E --> F{Mật khẩu đúng?}
    F -- Không --> ERR1
    F -- Đúng --> H[TokenService.revokeDeviceSession\nPrisma updateMany UserToken\nisRevoked=true cho deviceId này]
    H --> I[TokenService.createAccessToken\njwtService.sign\npayload: sub + type:access + pwdVer]
    I --> J[TokenService.createRefreshToken\ncrypto.randomBytes 32 bytes\nSHA-256 hash\nPrisma: insert UserToken\njwtService.sign refresh JWT]
    J --> K[res.cookie refreshToken\nHttpOnly, Secure, SameSite]
    K --> L([200 accessToken + user info\nRefresh token chỉ trong cookie])

    ERR1 --> Z([Kết thúc])
    L --> Z
```

### 3.2 — Chuỗi guard xác thực JWT (HTTP Request)

```mermaid
flowchart TD
    REQ([HTTP Request]) --> TH[ThrottlerGuard\nKiểm tra rate limit]
    TH --> RL{Vượt giới hạn?}
    RL -- Có --> R429[429 Too Many Requests]
    RL -- Không --> GJ[JwtAuthGuard\nGlobal - áp dụng mọi route]
    GJ --> PUB{Route có\n@Public?}

    PUB -- Có, không có token --> GUEST[request.user = null\nPassthrough]
    PUB -- Có, có token --> STR[JwtStrategy.validate\nExtract Bearer token]
    PUB -- Không --> STR

    STR --> SIG{JWT signature\nhợp lệ?}
    SIG -- Không --> U401[401 Unauthorized]
    SIG -- Có --> TTYPE{payload.type\n=== access?}
    TTYPE -- Không --> U401
    TTYPE -- Có --> CACHE{Redis cache?\nAUTH:USER_PROFILE:sub}
    CACHE -- Cache hit --> VALID[Validate status + pwdVer\ntừ dữ liệu cached]
    CACHE -- Cache miss --> DB[Prisma: findUnique user\ninclude role + permissions]
    DB --> EXISTS{User tồn tại?}
    EXISTS -- Không --> U401
    EXISTS -- Có --> SETC[Redis SETEX TTL=300s\nJSON.stringify user]
    SETC --> VALID
    VALID --> OK{Hợp lệ?}
    OK -- Không --> U401
    OK -- Có --> SET[request.user = UserEntity\ncls.set userId\nHide passwordHash, passwordVersion]
    SET --> CTRL[Controller Handler]
    GUEST --> CTRL
    CTRL --> RES([Response])

    R429 --> END([Kết thúc])
    U401 --> END
    RES --> END
```

---

## 4. Sequence Diagram

### 4.1 — POST /auth/login (Happy path + Error paths)

```mermaid
sequenceDiagram
    actor Client
    participant AC as AuthController
    participant DF as DeviceFingerprintService
    participant AS as AuthService
    participant US as UsersService
    participant TS as TokenService
    participant DB as PostgreSQL

    Client->>AC: POST /auth/login {phoneNumber, password}
    AC->>DF: extractDeviceInfo(req)
    DF-->>AC: DeviceInfo {deviceId, userAgent, ip, ...}
    AC->>AS: login(loginDto, deviceInfo)
    AS->>US: findByPhoneNumber(phoneNumber)
    US->>DB: user.findUnique WHERE phoneNumber=?
    DB-->>US: User | null

    alt User không tồn tại
        US-->>AS: null
        AS-->>Client: 401 "Invalid credentials"
    else Tài khoản không ACTIVE (kiểm tra trước mật khẩu)
        US-->>AS: User
        Note over AS: user.status !== ACTIVE
        AS-->>Client: 401 "Invalid credentials"
    else Mật khẩu sai
        US-->>AS: User (status ACTIVE)
        AS->>US: isValidPassword(password, passwordHash)
        US-->>AS: false
        AS-->>Client: 401 "Invalid credentials"
    else Happy path
        US-->>AS: User (status ACTIVE)
        AS->>US: isValidPassword → true
        AS->>TS: revokeDeviceSession(userId, deviceId)
        TS->>DB: updateMany UserToken SET isRevoked=true WHERE deviceId=?
        AS->>TS: createAccessToken(user)
        Note over TS: jwtService.sign {sub, type:'access', pwdVer}
        TS-->>AS: accessToken JWT
        AS->>TS: createRefreshToken(user, deviceInfo)
        TS->>TS: crypto.randomBytes(32) → SHA-256
        TS->>DB: INSERT UserToken {hash, deviceId, expiresAt}
        Note over TS: jwtService.sign {sub, type:'refresh', pwdVer, deviceId, tokenId}
        TS-->>AS: {token: refreshJWT, tokenId}
        AS-->>AC: {accessToken, refreshToken, expiresIn, user}
        AC->>Client: Set-Cookie: refreshToken (HttpOnly, Secure)
        AC-->>Client: 200 {accessToken, expiresIn, tokenType, user}
    end
```

### 4.2 — POST /auth/refresh — Token Rotation với Reuse Detection

```mermaid
sequenceDiagram
    actor Client
    participant AC as AuthController
    participant AS as AuthService
    participant TS as TokenService
    participant DB as PostgreSQL

    Client->>AC: POST /auth/refresh (Cookie: refreshJWT)
    Note over AC: JwtRefreshGuard → JwtRefreshStrategy<br/>Extract token from HttpOnly cookie
    AC->>AS: refreshAccessToken(oldRefreshJWT, deviceInfo)
    AS->>TS: rotateRefreshToken(oldRefreshJWT, deviceInfo)
    TS->>TS: jwtService.verify(oldRefreshJWT, refreshSecret)

    alt JWT signature invalid hoặc expired
        TS-->>Client: 401 Unauthorized
    else Token không tồn tại trong DB hoặc đã bị revoke
        TS->>DB: findUnique UserToken(payload.tokenId)
        DB-->>TS: null hoặc isRevoked=true
        TS-->>Client: 401 Unauthorized
    else Token Reuse — childTokens.length > 0
        TS->>DB: findUnique UserToken include childTokens
        DB-->>TS: token với childTokens
        Note over TS: Token đã được rotate trước đó<br/>Ai đó đang dùng lại token cũ → nghi ngờ
        TS->>DB: UPDATE revokeTokenFamily (tất cả ancestor + descendant)
        TS-->>Client: 401 "Suspicious activity detected"
    else Device fingerprint mismatch
        Note over TS: oldToken.deviceId !== deviceInfo.deviceId
        TS->>DB: revokeTokenFamily
        TS-->>Client: 401 Unauthorized
    else Password version mismatch
        Note over TS: user.passwordVersion !== payload.pwdVer
        TS-->>Client: 401 Unauthorized
    else Happy path
        TS->>DB: UPDATE UserToken SET isRevoked=true (old token)
        TS->>TS: createRefreshToken(user, deviceInfo, parentTokenId=old.id)
        TS->>DB: INSERT new UserToken (parent chain preserved)
        TS-->>AS: {accessToken, refreshToken}
        AS-->>AC: result
        AC->>Client: Set-Cookie: new refreshToken (HttpOnly)
        AC-->>Client: 200 {accessToken, expiresIn, tokenType}
    end
```

### 4.3 — WebSocket Handshake Authentication

```mermaid
---
id: 0363003c-f7c4-43fb-85eb-94b768aa36be
---
sequenceDiagram
    actor Client
    participant GW as SocketGateway<br/>handleConnection()
    participant SAS as SocketAuthService
    participant JWT as JwtService
    participant DB as PostgreSQL
    participant SS as SocketStateService
    participant Redis

    Client->>GW: Socket.IO CONNECT<br/>handshake.auth.token = "<accessToken>"
    GW->>SAS: authenticateSocket(client)
    SAS->>SAS: extractToken(client)<br/>1. handshake.auth.token<br/>2. headers.authorization<br/>3. query.token

    alt Không tìm thấy token
        SAS-->>GW: null
        GW->>Client: emit('auth:failed')
        GW->>Client: client.disconnect()
    else Token invalid hoặc expired
        SAS->>JWT: verifyAsync(token, {secret})
        JWT-->>SAS: throw error
        SAS-->>GW: null
        GW->>Client: emit('auth:failed')
        GW->>Client: client.disconnect()
    else payload.type !== 'access'
        SAS-->>GW: null
        GW->>Client: emit('auth:failed')
        GW->>Client: client.disconnect()
    else status !== ACTIVE hoặc passwordVersion mismatch
        SAS->>DB: user.findUnique(payload.sub)
        DB-->>SAS: User
        Note over SAS: Kiểm tra status và passwordVersion
        SAS-->>GW: null
        GW->>Client: emit('auth:failed')
        GW->>Client: client.disconnect()
    else Happy path
        SAS->>JWT: verifyAsync(token) → JwtPayload
        SAS->>DB: user.findUnique(payload.sub)
        DB-->>SAS: User (ACTIVE, pwdVer match)
        SAS-->>GW: SocketUserContext {id, displayName, ...}
        GW->>GW: client.user = SocketUserContext<br/>client.authenticated = true
        GW->>SS: handleConnection(client)
        SS->>Redis: SADD user:{userId}:sockets {socketId}
        SS->>Redis: SET socket:{socketId}:user {userId}
        GW->>Client: emit('authenticated', {userId})
        GW->>Redis: PUBLISH socket:presence:online {userId}
        GW->>GW: notifyFriendsPresence(userId, online=true)
        Note over GW: registerSafeInterval 30s<br/>emit('server:heartbeat') định kỳ
    end
```

---

## 5. Các lưu ý kỹ thuật

### Token Architecture

| Loại | Kiểu | Lưu ở đâu | Thời hạn | Truyền qua |
|------|------|-----------|----------|-----------|
| Access Token | Stateless JWT | Không lưu server | Từ `jwtConfig.accessToken.expiresIn` | `Authorization: Bearer` header |
| Refresh Token | JWT + DB record | PostgreSQL `UserToken` table | Từ `jwtConfig.refreshToken.expiresIn` | `HttpOnly` cookie |

**Token family model:** Mỗi refresh token có `parentTokenId`. Khi rotate, token cũ bị revoke và token mới trỏ về `parentTokenId=old.id`. Nếu token cũ được dùng lại sau khi đã rotate (`childTokens.length > 0`) → toàn bộ family bị revoke (phát hiện token bị đánh cắp).

### Device Fingerprint

`deviceId` = SHA-256 hash của: `userAgent + acceptLanguage + acceptEncoding + X-Screen-Resolution + X-Timezone + X-Platform` — truncated to 32 hex chars. Client có thể gửi custom headers (`X-Device-Name`, `X-Device-Type`, `X-Platform`) để nhận diện thiết bị.

### Events được emit ra ngoài

| Event | Trigger | Listener |
|-------|---------|---------|
| `user.logged_out` | `AuthService.logout()` | `CallLogoutHandler` (dọn dẹp cuộc gọi đang diễn ra) |
| `auth.security.revoked` | External (chưa xác định emitter) | `SecurityEventHandler` — revoke toàn bộ token + force-disconnect socket |

### Caching

`JwtStrategy.validate()` cache user profile trong Redis với TTL **5 phút** (key: `AUTH:USER_PROFILE:{userId}`).

- **Cache hit**: đọc JSON từ Redis, kiểm tra `status` và `passwordVersion` → trả `UserEntity` mà không cần query DB.
- **Cache miss**: thực hiện Prisma query với eager load `role → rolePermissions → permission`, sau đó ghi vào cache.
- **Invalidation**: `UsersService.update()` và `UsersService.updateByAdmin()` gọi `redis.del(key)` ngay sau khi cập nhật — đảm bảo cache không stale khi đổi role, status hoặc password.

---

## 6. Bugs & Issues phát hiện khi phân tích

> ✅ Tất cả các vấn đề dưới đây đã được fix. Xem chi tiết commit tương ứng.

| # | File | Mức độ | Mô tả |
|---|------|--------|-------|
| **B1** ✅ | `users/users.controller.ts` | 🔴 Critical | **Đã fix:** `@UseGuards(RolesGuard)` + `@Roles('ADMIN')` được áp dụng cho `POST /users`, `GET /users`, `PATCH /users/:id/admin-update`, `DELETE /users/:id`. |
| **B2** ✅ | `auth/dto/login.dto.ts` | 🟡 Medium | **Đã fix:** `@Matches(/(84\|0[3\|5\|7\|8\|9])+([0-9]{8})\b/)` đã được bỏ comment. Chỉ chấp nhận số điện thoại đúng định dạng Việt Nam. |
| **B3** ✅ | `auth/listeners/security-event.handler.ts` | 🟡 Medium | **Đã fix:** `handleSecurityRevoked()` gọi `TokenService.revokeAllUserSessions()` + `SocketGateway.forceDisconnectUser()` (lazy-resolved qua `ModuleRef` + `OnApplicationBootstrap`). |
| **B4** ✅ | `common/guards/local-auth.guard.ts` | 🟡 Medium | **Đã fix:** File đã bị xoá. Không còn dead code tham chiếu `LocalStrategy` không tồn tại. |
| **B5** ✅ | `auth/services/token.service.ts` | 🟠 Low | **Đã fix:** Thời hạn refresh token đọc từ `jwtConfig.refreshToken.expiresIn` (parse regex `^\d+d$`), fallback 7 ngày. |
| **B6** ✅ | `auth/strategies/jwt.strategy.ts` | 🟠 Low | **Đã fix:** `JwtStrategy.validate()` cache user profile trong Redis TTL 5 phút (`AUTH:USER_PROFILE:{userId}`). Invalidated khi `update()` hoặc `updateByAdmin()`. |
| **B7** ✅ | `auth/services/token.service.ts` | 🟠 Low | **Đã fix:** `findTokenFamily()` thay thế bằng PostgreSQL `WITH RECURSIVE` CTE — single query cho toàn bộ ancestor + descendant tree. |
| **B8** ✅ | `auth/auth.service.ts` | 🟠 Info | **Đã fix:** Kiểm tra `user.status` xảy ra **trước** kiểm tra mật khẩu. Cả hai trường hợp lỗi đều trả cùng thông báo `"Invalid credentials"`. |

---

## 7. Roadmap

### Mobile & Multi-platform Auth *(chưa triển khai)*

| Feature | Trạng thái | Ghi chú |
|---------|-----------|---------|
| QR Login | Skeleton (`/auth/qr/*` routes có thể có) | Xem `doc/plan/auth/QR-LOGIN-PLAN.md` |
| OTP / Phone verification | Chưa có | Sẽ thêm `/auth/otp/send` + `/auth/otp/verify` |
| Social Login (Google/Facebook) | Không có kế hoạch | — |
| Biometrics (FaceID/TouchID) | Không có kế hoạch | Client-side only, server không thay đổi |

> **Lưu ý cho mobile:** JWT guard, socket handshake, guard chain **không thay đổi** khi thêm mobile. Chỉ thêm login method mới (`/auth/login/phone`). Các module khác phụ thuộc vào Auth không cần cập nhật.

