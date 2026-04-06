# Phân tích chi tiết flow Login (Password) của zalo_backend

## 1) Phạm vi phân tích

Tài liệu này chỉ phân tích flow login bằng mật khẩu (không gồm QR login), bám theo code thực tế trong backend NestJS.

Các điểm bám chính:

- API login: [backend/zalo_backend/src/modules/auth/auth.controller.ts](backend/zalo_backend/src/modules/auth/auth.controller.ts#L74)
- Business login: [backend/zalo_backend/src/modules/auth/auth.service.ts](backend/zalo_backend/src/modules/auth/auth.service.ts#L50)
- Token lifecycle: [backend/zalo_backend/src/modules/auth/services/token.service.ts](backend/zalo_backend/src/modules/auth/services/token.service.ts#L32)
- Device fingerprint/tracking: [backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts](backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts#L24)
- Guard/strategy xác thực sau login:
  - [backend/zalo_backend/src/modules/auth/guards/jwt-auth.guard.ts](backend/zalo_backend/src/modules/auth/guards/jwt-auth.guard.ts#L31)
  - [backend/zalo_backend/src/modules/auth/strategies/jwt.strategy.ts](backend/zalo_backend/src/modules/auth/strategies/jwt.strategy.ts#L34)
  - [backend/zalo_backend/src/modules/auth/strategies/jwt-refresh.strategy.ts](backend/zalo_backend/src/modules/auth/strategies/jwt-refresh.strategy.ts#L29)

## 2) Kiến trúc chạy trước khi vào AuthController.login

### 2.1 Global Guard có đang chặn login không?

- Ứng dụng đăng ký JwtAuthGuard là APP_GUARD toàn cục tại [backend/zalo_backend/src/app.module.ts](backend/zalo_backend/src/app.module.ts#L207).
- Route login dùng @Public() tại [backend/zalo_backend/src/modules/auth/auth.controller.ts](backend/zalo_backend/src/modules/auth/auth.controller.ts#L73), và decorator Public gắn metadata isPublic tại [backend/zalo_backend/src/common/decorator/customize.ts](backend/zalo_backend/src/common/decorator/customize.ts#L14).
- JwtAuthGuard.canActivate đọc metadata đó và bỏ qua auth cho route public tại [backend/zalo_backend/src/modules/auth/guards/jwt-auth.guard.ts](backend/zalo_backend/src/modules/auth/guards/jwt-auth.guard.ts#L31).

---

## 3) Contract đầu vào của login

### 3.1 DTO validation

Login nhận body LoginDto tại [backend/zalo_backend/src/modules/auth/auth.controller.ts](backend/zalo_backend/src/modules/auth/auth.controller.ts#L84).

Trong DTO:

- phoneNumber bắt buộc và regex Việt Nam tại [backend/zalo_backend/src/modules/auth/dto/login.dto.ts](backend/zalo_backend/src/modules/auth/dto/login.dto.ts#L11).
- password bắt buộc, min length 6 tại [backend/zalo_backend/src/modules/auth/dto/login.dto.ts](backend/zalo_backend/src/modules/auth/dto/login.dto.ts#L23).

---

## 4) Flow login chi tiết từng bước trong controller

Điểm vào chính: [backend/zalo_backend/src/modules/auth/auth.controller.ts](backend/zalo_backend/src/modules/auth/auth.controller.ts#L83)

### Bước 1: lấy hoặc tạo tracking ID ổn định

Code gọi:

- getOrCreateTrackingId tại [backend/zalo_backend/src/modules/auth/auth.controller.ts](backend/zalo_backend/src/modules/auth/auth.controller.ts#L90)

Bên trong DeviceFingerprintService:

- Đọc cookie device_tracking_id tại [backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts](backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts#L69).
- Nếu có thì dùng lại ngay.
- Nếu chưa có thì tạo UUID mới bằng crypto.randomUUID() tại [backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts](backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts#L78).
- Set cookie HttpOnly, sameSite strict, secure theo NODE_ENV, maxAge 1 năm, path / tại [backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts](backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts#L53).

Tại sao làm vậy:

- Cần định danh thiết bị đủ ổn định theo thời gian, không phụ thuộc hoàn toàn fingerprint (vốn thay đổi theo UA/header).

### Bước 2: trích xuất device info chi tiết

Code gọi:

- extractDeviceInfo tại [backend/zalo_backend/src/modules/auth/auth.controller.ts](backend/zalo_backend/src/modules/auth/auth.controller.ts#L95)

Bên trong extractDeviceInfo:

1. Lấy tracking cookie nếu có; nếu không thì fallback generateDeviceId(request) tại [backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts](backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts#L93).
2. Lấy userAgent từ header user-agent tại [backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts](backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts#L95).
3. Lấy IP qua chuỗi ưu tiên:
   - x-forwarded-for (lấy IP đầu tiên) tại [backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts](backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts#L188)
   - x-real-ip tại [backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts](backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts#L197)
   - req.ip hoặc remoteAddress tại [backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts](backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts#L202)
4. deviceName:
   - Ưu tiên header x-device-name
   - Nếu thiếu thì parse từ UA bằng parseDeviceName tại [backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts](backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts#L100)
5. deviceType:
   - Ưu tiên header x-device-type
   - Nếu thiếu thì suy luận từ UA tại [backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts](backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts#L141)
6. platform:
   - Ưu tiên header x-platform
   - Nếu thiếu thì suy luận từ UA tại [backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts](backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts#L159)

Chi tiết generateDeviceId fallback:

- Ghép các tín hiệu: user-agent, accept-language, accept-encoding, x-screen-resolution, x-timezone, x-platform tại [backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts](backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts#L25).
- Hash SHA-256 rồi cắt 32 ký tự tại [backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts](backend/zalo_backend/src/modules/auth/services/device-fingerprint.service.ts#L43).

Tại sao làm vậy:

- Kết hợp client-provided headers + UA parsing để có best-effort nhận diện thiết bị trong nhiều môi trường.

Ưu điểm:

- Linh hoạt: web cũ vẫn chạy dù không gửi custom headers.
- Có đường fallback khi cookie thiếu.

### Bước 3: ép dùng trackingId làm deviceId chính

Controller override:

- deviceInfo.deviceId = trackingId tại [backend/zalo_backend/src/modules/auth/auth.controller.ts](backend/zalo_backend/src/modules/auth/auth.controller.ts#L97).

Ý nghĩa:

- Dù extractDeviceInfo có thể sinh deviceId theo fingerprint, login flow ưu tiên ID ổn định từ cookie.

Ưu điểm:

- Session của cùng browser nhất quán hơn.

### Bước 4: gọi AuthService.login

Controller gọi service tại [backend/zalo_backend/src/modules/auth/auth.controller.ts](backend/zalo_backend/src/modules/auth/auth.controller.ts#L100).

---

## 5) Flow chi tiết trong AuthService.login

Điểm vào: [backend/zalo_backend/src/modules/auth/auth.service.ts](backend/zalo_backend/src/modules/auth/auth.service.ts#L50)

### Bước 5.1: debug log bằng fs

- Tạo log function ghi vào login_debug.log bằng appendFileSync tại [backend/zalo_backend/src/modules/auth/auth.service.ts](backend/zalo_backend/src/modules/auth/auth.service.ts#L52).
- Ghi log phone đăng nhập tại [backend/zalo_backend/src/modules/auth/auth.service.ts](backend/zalo_backend/src/modules/auth/auth.service.ts#L56).

Tại sao có thể làm vậy:

- Thường dùng để debug thực địa khi nghi ngờ lỗi login/session mà logger chuẩn chưa đủ chi tiết.

Ưu điểm:

- Dễ bật tạm thời, dễ quan sát theo timeline.

Nhược điểm quan trọng:

- Có thể lộ PII (phoneNumber).
- appendFileSync là blocking I/O, giảm throughput nếu lưu lượng cao.
- Không có rotation/retention => phình file.

Khuyến nghị:

- Chỉ dùng tạm trong debug hoặc chuyển sang logger chuẩn có mask dữ liệu.

### Bước 5.2: tìm user theo số điện thoại

- gọi usersService.findByPhoneNumber tại [backend/zalo_backend/src/modules/auth/auth.service.ts](backend/zalo_backend/src/modules/auth/auth.service.ts#L57).
- method truy vấn findUnique(phoneNumber) tại [backend/zalo_backend/src/modules/users/users.service.ts](backend/zalo_backend/src/modules/users/users.service.ts#L43).
- nếu không có user => UnauthorizedException Invalid credentials tại [backend/zalo_backend/src/modules/auth/auth.service.ts](backend/zalo_backend/src/modules/auth/auth.service.ts#L62).

### Bước 5.3: check trạng thái account trước khi check password

- check user.status === ACTIVE tại [backend/zalo_backend/src/modules/auth/auth.service.ts](backend/zalo_backend/src/modules/auth/auth.service.ts#L68).
- không active => vẫn trả Invalid credentials tại [backend/zalo_backend/src/modules/auth/auth.service.ts](backend/zalo_backend/src/modules/auth/auth.service.ts#L70).

### Bước 5.4: xác thực mật khẩu bcrypt

- gọi isValidPassword tại [backend/zalo_backend/src/modules/auth/auth.service.ts](backend/zalo_backend/src/modules/auth/auth.service.ts#L75).
- usersService dùng bcrypt.compare tại [backend/zalo_backend/src/modules/users/users.service.ts](backend/zalo_backend/src/modules/users/users.service.ts#L118).
- sai mật khẩu => Unauthorized Invalid credentials tại [backend/zalo_backend/src/modules/auth/auth.service.ts](backend/zalo_backend/src/modules/auth/auth.service.ts#L81).

Tại sao làm vậy:

- bcrypt.compare chống lưu plaintext và hỗ trợ hash cost.

Ưu điểm:

- Chuẩn bảo mật phổ biến.

Nhược điểm:

- CPU cost cao khi brute-force volume lớn (cần rate-limit bổ trợ).

### Bước 5.5: áp policy session theo loại thiết bị (điểm quan trọng web/mobile)

Nhánh A: WEB hoặc DESKTOP

- điều kiện tại [backend/zalo_backend/src/modules/auth/auth.service.ts](backend/zalo_backend/src/modules/auth/auth.service.ts#L86).
- revoke toàn bộ phiên PC cũ qua tokenService.revokeExistingPCSessions tại [backend/zalo_backend/src/modules/auth/auth.service.ts](backend/zalo_backend/src/modules/auth/auth.service.ts#L89).
- nếu có session bị revoke thì emit FORCE_LOGOUT_DEVICES để socket layer đẩy kick realtime tại [backend/zalo_backend/src/modules/auth/auth.service.ts](backend/zalo_backend/src/modules/auth/auth.service.ts#L95).

Nhánh B: Mobile/khác

- revoke theo đúng deviceId hiện tại (chỉ device này) tại [backend/zalo_backend/src/modules/auth/auth.service.ts](backend/zalo_backend/src/modules/auth/auth.service.ts#L103).

Tại sao làm vậy:

- Đây là chính sách 1PC (một phiên máy tính tại một thời điểm), nhưng mobile cho phép đa thiết bị linh hoạt hơn.

Ưu điểm:

- Web/Desktop: giảm nguy cơ tài khoản bị giữ đăng nhập trên nhiều máy, gần với kỳ vọng sản phẩm chat desktop.
- Mobile: không làm người dùng bị đăng xuất hàng loạt mỗi lần đổi app/device nhỏ.

Nhược điểm:

- Nếu deviceType bị phân loại sai (UA/header), policy sẽ chạy sai nhánh.
- Với mobile, nếu deviceId không ổn định có thể revoke nhầm hoặc không gom đúng phiên cùng máy.

### Bước 5.6: phát hành token pair

- tạo refresh token + lưu session DB qua createRefreshToken tại [backend/zalo_backend/src/modules/auth/auth.service.ts](backend/zalo_backend/src/modules/auth/auth.service.ts#L108).
- tạo access token ràng buộc sessionId + deviceId qua createAccessToken tại [backend/zalo_backend/src/modules/auth/auth.service.ts](backend/zalo_backend/src/modules/auth/auth.service.ts#L114).
- trả response user = new UserEntity(user) tại [backend/zalo_backend/src/modules/auth/auth.service.ts](backend/zalo_backend/src/modules/auth/auth.service.ts#L124).

Tại sao new UserEntity:

- Entity dùng @Exclude để ẩn passwordHash/passwordVersion khỏi output tại [backend/zalo_backend/src/modules/users/entities/user.entity.ts](backend/zalo_backend/src/modules/users/entities/user.entity.ts#L45).

---

## 6) TokenService: cơ chế sâu phía dưới login

### 6.1 Access token chứa gì và vì sao

- createAccessToken tại [backend/zalo_backend/src/modules/auth/services/token.service.ts](backend/zalo_backend/src/modules/auth/services/token.service.ts#L32).
- payload gồm:
  - sub (user id)
  - type = access
  - pwdVer
  - sid (session id = user_tokens.id)
  - deviceId
- ký bằng JWT_ACCESS_SECRET và expiresIn access config tại [backend/zalo_backend/src/modules/auth/services/token.service.ts](backend/zalo_backend/src/modules/auth/services/token.service.ts#L41).

Tại sao nhét sid + deviceId + pwdVer:

- sid/deviceId: cho phép strategy xác thực rằng access token vẫn thuộc một session DB còn sống.
- pwdVer: đổi mật khẩu là invalidate ngay token cũ.

Ưu điểm:

- Access token không thuần stateless nữa, có khả năng revoke gần realtime.

Nhược điểm:

- Mỗi request protected phải chạm DB check session (chi phí I/O cao hơn).

### 6.2 Refresh token lưu thế nào

- createRefreshToken tại [backend/zalo_backend/src/modules/auth/services/token.service.ts](backend/zalo_backend/src/modules/auth/services/token.service.ts#L51).
- Tạo refresh token random bytes -> hex tại [backend/zalo_backend/src/modules/auth/services/token.service.ts](backend/zalo_backend/src/modules/auth/services/token.service.ts#L58).
- Hash token bằng SHA-256 để lưu DB (không lưu plaintext) tại [backend/zalo_backend/src/modules/auth/services/token.service.ts](backend/zalo_backend/src/modules/auth/services/token.service.ts#L59).
- Tính expiresAt từ refreshToken.expiresIn theo regex d (ngày) tại [backend/zalo_backend/src/modules/auth/services/token.service.ts](backend/zalo_backend/src/modules/auth/services/token.service.ts#L63).
- Lưu bản ghi user_tokens với metadata thiết bị/IP/UA/isRevoked/parentTokenId tại [backend/zalo_backend/src/modules/auth/services/token.service.ts](backend/zalo_backend/src/modules/auth/services/token.service.ts#L70).
- Ký JWT refresh payload có tokenId tại [backend/zalo_backend/src/modules/auth/services/token.service.ts](backend/zalo_backend/src/modules/auth/services/token.service.ts#L88).

Lưu ý quan trọng:

- DB schema user_tokens được thiết kế cho session management và token family tại [backend/zalo_backend/prisma/schema.prisma](backend/zalo_backend/prisma/schema.prisma#L380).
- Có refreshTokenHash unique và index hỗ trợ query/revoke tại [backend/zalo_backend/prisma/schema.prisma](backend/zalo_backend/prisma/schema.prisma#L385).

Ưu điểm:

- Lộ DB không lộ refresh token gốc.
- Có khả năng truy vết/revoke theo thiết bị.

Nhược điểm:

- Hiện code rotateRefreshToken tìm theo tokenId từ JWT chứ chưa dùng hash để đối chiếu token plaintext; vẫn bảo mật ở mức chấp nhận được do JWT refresh đã ký secret, nhưng tư duy defense-in-depth có thể tăng thêm bước kiểm chứng hash.

### 6.3 Cơ chế rotate/reuse detection (liên quan trực tiếp sau login)

- rotateRefreshToken tại [backend/zalo_backend/src/modules/auth/services/token.service.ts](backend/zalo_backend/src/modules/auth/services/token.service.ts#L135).
- Verify chữ ký refresh JWT trước.
- Tải old token + childTokens từ DB.
- Nếu đã có childTokens => phát hiện reuse attack, revoke cả token family.
- Check isRevoked, expiresAt, deviceId match, pwdVer match.
- Revoke old token reason TOKEN_ROTATION, phát hành cặp mới.

Tại sao làm vậy:

- Chặn replay refresh token đã dùng, là mô hình rotation chuẩn hiện đại.

Ưu điểm:

- Khi có dấu hiệu token bị đánh cắp, có cơ chế kill chain mạnh.

Nhược điểm:

- False positive có thể xảy ra nếu client retry không idempotent trong network kém.

---

## 7) Quay lại controller: set cookie + trả response

Sau khi AuthService.login trả kết quả:

- Controller build cookieOptions từ config, chuyển maxAge qua hàm ms tại [backend/zalo_backend/src/modules/auth/auth.controller.ts](backend/zalo_backend/src/modules/auth/auth.controller.ts#L102).
- set cookie refresh_token HttpOnly tại [backend/zalo_backend/src/modules/auth/auth.controller.ts](backend/zalo_backend/src/modules/auth/auth.controller.ts#L110).
- body chỉ trả accessToken/expiresIn/tokenType/user, không trả refreshToken tại [backend/zalo_backend/src/modules/auth/auth.controller.ts](backend/zalo_backend/src/modules/auth/auth.controller.ts#L117).

Cấu hình cookie mặc định:

- sameSite strict, path chỉ /api/v1/auth/refresh tại [backend/zalo_backend/src/config/jwt.config.ts](backend/zalo_backend/src/config/jwt.config.ts#L24).
- secure true ở production tại [backend/zalo_backend/src/config/jwt.config.ts](backend/zalo_backend/src/config/jwt.config.ts#L22).

Tại sao thiết kế như vậy:

- Refresh token để trong HttpOnly cookie để chống XSS đọc token.
- Giới hạn path giúp cookie không bị gửi ở endpoint khác, giảm bề mặt rò rỉ.

Ưu điểm:

- Mô hình access token in-memory + refresh token HttpOnly cookie là thực dụng và an toàn cho web.

Nhược điểm:

- Mobile native không phải lúc nào cũng tự quản cookie theo chuẩn browser, cần kiểm soát client rõ ràng.
- sameSite strict có thể gây vướng nếu frontend/backend cross-site thực sự (khác site eTLD+1).

---

## 8) Sau login: access token được xác thực ra sao ở request protected

Luồng protected endpoint:

1. JwtAuthGuard (global) bắt route private: [backend/zalo_backend/src/modules/auth/guards/jwt-auth.guard.ts](backend/zalo_backend/src/modules/auth/guards/jwt-auth.guard.ts#L31).
2. Passport strategy jwt giải token Bearer: [backend/zalo_backend/src/modules/auth/strategies/jwt.strategy.ts](backend/zalo_backend/src/modules/auth/strategies/jwt.strategy.ts#L24).
3. validate(payload) kiểm:
   - type access
   - sid/deviceId tồn tại
   - DB còn active session (id=userTokenId, userId, deviceId, not revoked, not expired)
   - passwordVersion khớp
4. nếu pass thì tạo UserEntity và gắn currentDeviceId/currentSessionId vào request.user.

Tại sao quan trọng với login:

- Login phát hành token có sid/deviceId/pwdVer, còn strategy dùng chính các field đó để đảm bảo session-bound enforcement.
- Kết quả là revoke session/password change có hiệu lực gần như ngay lập tức.

---

## 9) Bảng giải thích quyết định thiết kế chính (vì sao, ưu, nhược)

### 9.1 Dùng cả access + refresh token

Vì sao:

- Access ngắn hạn giảm blast radius khi lộ token.
- Refresh dài hạn cải thiện UX không bắt login liên tục.

Ưu:

- Cân bằng bảo mật và trải nghiệm.

Nhược:

- Tăng độ phức tạp ở refresh/rotation/revocation.

### 9.2 Session binding bằng sid + deviceId

Vì sao:

- JWT thuần stateless khó revoke sớm.

Ưu:

- Có thể buộc logout chính xác theo session/device.

Nhược:

- Tăng phụ thuộc DB mỗi request private.

### 9.3 pwdVer để invalidate token khi đổi mật khẩu

Vì sao:

- Không cần lưu blacklist access token.

Ưu:

- Cơ chế nhẹ, rất hiệu quả.

Nhược:

- Cần giữ đồng bộ logic trên login, refresh, jwt validate.

### 9.4 1PC cho WEB/DESKTOP, linh hoạt cho MOBILE

Vì sao:

- Nhu cầu sản phẩm chat desktop thường muốn một phiên tập trung.
- Mobile đa thiết bị là hành vi phổ biến.

Ưu:

- Policy sát behavior người dùng.

Nhược:

- Chất lượng phân loại deviceType quyết định đúng/sai policy.

### 9.5 Cookie refresh token với path hẹp

Vì sao:

- Hạn chế cookie tự động attach tràn lan.

Ưu:

- Giảm exposure không cần thiết.

Nhược:

- Client mobile hoặc môi trường reverse proxy cần cấu hình khớp path rất chặt.

---

## 10) Web vs Mobile: hành vi thực tế trong flow hiện tại

### 10.1 Điểm chung

- Cùng endpoint login và cùng AuthService.login.
- Cùng tạo access/refresh token pair.
- Cùng metadata session trong user_tokens.

### 10.2 Điểm khác biệt cốt lõi

- Web/Desktop bị áp 1PC (revoke PC sessions cũ).
- Mobile không bị revoke toàn bộ, chỉ revoke session trùng deviceId hiện tại.

### 10.3 Điều kiện để mobile chạy đúng với thiết kế này

Client mobile nên gửi ổn định các header:

- x-device-name
- x-device-type=MOBILE
- x-platform=IOS/ANDROID

Và phải xử lý cookie refresh token đúng cách:

- Lưu/đính cookie giữa login và refresh.
- Gọi đúng endpoint path refresh tương ứng API gateway (để cookie được gửi).

Nếu không đáp ứng:

- Có thể bị nhận diện nhầm loại thiết bị.
- Refresh token không được gửi, gây lỗi re-login liên tục.

---

## 11) Các rủi ro và trade-off cần lưu ý

1. Logging nhạy cảm trong AuthService.login:

- Có ghi phone + trạng thái password valid vào file cục bộ.
- Nên tắt ở production hoặc mask dữ liệu.

2. Device fingerprint dựa vào header/UA:

- Không phải định danh phần cứng, vẫn có thể spoof.
- Nên xem là security signal phụ, không phải yếu tố duy nhất.

3. Parse expiresIn của refresh trong TokenService hiện ưu tiên định dạng theo ngày:

- Nếu config dùng đơn vị khác (m/h/s), logic fallback hiện có thể không phản ánh đúng kỳ vọng.

4. Session binding tăng truy vấn DB:

- Đổi lại khả năng revoke mạnh.
- Cần theo dõi hiệu năng khi số request protected tăng.

---

## 12) Kết luận kỹ thuật

Flow login password hiện tại là mô hình hybrid mạnh:

- Access token ngắn hạn có ràng buộc session/device/password-version.
- Refresh token có rotation + reuse detection + token family revoke.
- Device policy tách WEB/DESKTOP và MOBILE để tối ưu bảo mật theo ngữ cảnh sản phẩm.

Điểm mạnh lớn nhất:

- Khả năng revoke session gần realtime và kiểm soát đa thiết bị tốt.

Điểm cần quản trị kỹ:

- Tính ổn định định danh device ở mobile/web,
- tính tương thích cookie/path/samesite,
- và vệ sinh logging nhạy cảm trong môi trường production.
