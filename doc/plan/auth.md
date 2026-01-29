# Authentication System Architecture & Flows

## I. Authentication Flows

### 1. Login Flow (Initial Authentication)
This flow handles the user's first entry into the system.
1.  User submits **Credentials** (Phone/Pass) + **Device Info**.
2.  Server verifies password using `bcrypt`.
3.  Server generates a **Device Fingerprint** (unique ID).
4.  **Revoke** any existing session for this specific device (clean slate).
5.  Create **Access Token** (JWT).
6.  Create **Refresh Token** $\rightarrow$ Store the **Hash** in Database.
7.  Return **Access Token** in the Response Body.
8.  Set **Refresh Token** as an `HttpOnly` cookie.

### 2. Refresh Flow (Token Rotation)
This flow handles session extension and security checks.
1.  Extract **Refresh Token** from the `HttpOnly` cookie.
2.  Verify the JWT signature.
3.  Find the token in the Database by ID.
4.  **SECURITY CHECK:** Check if the token has children (Used Token).
    * ⚠️ **IF TRUE:** **ATTACK DETECTED** $\rightarrow$ Revoke the entire token family immediately.
5.  Validate that the **Device Fingerprint** matches the original request.
6.  Validate that the **Password Version** matches (in case user changed pass).
7.  **Revoke** the old token (Soft delete/Mark as used).
8.  Generate **New Tokens** (Access + Refresh) linked as a child of the old one.
9.  Return the new **Access Token**.
10. Set the new **Refresh Token** cookie.

### 3. Logout Flows

#### A. Standard Logout
1.  Revoke the current device session in the Database.
2.  Clear the **Refresh Token** cookie.
3.  Client discards the **Access Token** from memory.

#### B. Remote Logout (Manage Sessions)
* `GET /auth/sessions` $\rightarrow$ List all active devices.
* `DELETE /auth/sessions/:deviceId` $\rightarrow$ Revoke specific device session.

---

## II. Critical Components Explained

### 1. DeviceFingerprintService
**Purpose:** Prevents token theft. A stolen token will not work if used on a different device than the one it was issued to.

**Generates a consistent `deviceId` from:**
* User-Agent
* Screen resolution
* Timezone
* Platform
* Accept headers

### 2. TokenService
Handles the entire token lifecycle and database interactions.

* `createAccessToken()`: Generate short-lived JWT.
* `createRefreshToken()`: Generate long-lived token + Store hash in DB.
* `rotateRefreshToken()`: Handles Token Rotation logic with strict security checks.
* `revokeTokenFamily()`: Recursively revokes the token tree (used when attack detected).
* `revokeDeviceSession()`: Logout a specific device.
* `cleanupExpiredTokens()`: Cron job to clean up old data.

### 3. JWT Strategies
Passport strategies used by Guards.

* **JwtStrategy:** Validates the *Access Token* and checks `passwordVersion` (for instant invalidation).
* **JwtRefreshStrategy:** Extracts the *Refresh Token* specifically from the cookie.

### 4. Global JWT Guard
* All routes are **protected by default**.
* Use the `@Public()` decorator to bypass authentication for specific endpoints (e.g., Login, Register).

### Best Practices Applied

Separation of Concerns: Auth logic separated from user management
DRY Principle: Reusable services (TokenService, DeviceFingerprintService)
Type Safety: Full TypeScript, DTOs with validation
Error Handling: Proper exception handling, meaningful error messages
Logging: Structured logging for debugging
Documentation: Swagger API docs
Testability: Injectable services, mockable dependencies

### TODO (Production Hardening):
Rate limiting (login attempts)
Brute force protection
IP whitelist/blacklist
Login history table
Suspicious activity detection
2FA support (TOTP)
Email notifications on new device login
Cron job for token cleanup