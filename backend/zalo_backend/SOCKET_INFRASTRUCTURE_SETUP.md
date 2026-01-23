# Socket Infrastructure Setup Guide - Phase 0

## 🎯 What We Built

Phase 0 Foundation includes:

- ✅ Redis Module & Connection
- ✅ Socket.IO with Redis Adapter (cluster-ready)
- ✅ WebSocket JWT Authentication
- ✅ Global WS Exception Filter
- ✅ Socket Registry Service (userId ↔ socketId)
- ✅ Presence Service (online/offline tracking)
- ✅ Graceful Shutdown Handler
- ✅ Health Check Endpoints

## 📦 Installation

### 1. Install Dependencies

```bash
npm install
```

### 2. Setup Redis

**Option A: Docker (Recommended)**
```bash
docker run --name redis-zalo \
  -p 6379:6379 \
  -d redis:7-alpine
```

### 3. Configure Environment

Update your `.env` file:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/zalo_clone?schema=public"

# JWT Secrets
JWT_ACCESS_SECRET=your-super-secret-access-token-key-min-32-chars
JWT_REFRESH_SECRET=your-super-secret-refresh-token-key-min-32-chars

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Socket Configuration
SERVER_INSTANCE=server-1
MAX_SOCKET_CONNECTIONS=10000

# CORS
CORS_ORIGIN=http://localhost:3001

# Node Environment
NODE_ENV=development
PORT=3000
```

### 4. Database Migration

```bash
# Generate Prisma client
npx prisma generate

# Run migrations (includes new SocketConnection & PresenceLog tables)
npx prisma migrate dev --name add-socket-infrastructure

# Verify schema
npx prisma studio
```

### 5. Start Application

```bash
# Development mode (with hot reload)
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

## 🧪 Testing the Infrastructure

### 1. Health Check

```bash
# Check all services
curl http://localhost:3000/api/v1/health

# Expected response:
{
  "status": "ok",
  "info": {
    "database": {
      "status": "up",
      "database": "postgresql"
    },
    "redis": {
      "status": "up",
      "connected": true,
      "host": "localhost",
      "port": 6379,
      "db": 0
    },
    "socket": {
      "status": "up",
      "connectedSockets": 0,
      "serverInstance": "server-1"
    }
  }
}
```

### 2. Socket.IO Connection Test

Create a test client file `test-socket.html`:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Socket.IO Test</title>
  <script src="https://cdn.socket.io/4.6.1/socket.io.min.js"></script>
</head>
<body>
  <h1>Socket.IO Test Client</h1>
  <div id="status">Disconnected</div>
  <div id="logs"></div>

  <script>
    // Get access token (login first via API)
    const accessToken = 'YOUR_ACCESS_TOKEN_HERE';

    const socket = io('http://localhost:3000/socket.io', {
      auth: {
        token: accessToken
      },
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      document.getElementById('status').textContent = 'Connected: ' + socket.id;
      log('Connected to server');
    });

    socket.on('authenticated', (data) => {
      log('Authenticated: ' + JSON.stringify(data, null, 2));
    });

    socket.on('auth_failed', (data) => {
      log('Authentication failed: ' + JSON.stringify(data, null, 2));
    });

    socket.on('disconnect', (reason) => {
      document.getElementById('status').textContent = 'Disconnected';
      log('Disconnected: ' + reason);
    });

    socket.on('error', (error) => {
      log('Error: ' + JSON.stringify(error, null, 2));
    });

    socket.on('server:shutdown', (data) => {
      log('Server shutting down: ' + JSON.stringify(data, null, 2));
    });

    function log(message) {
      const logs = document.getElementById('logs');
      const timestamp = new Date().toISOString();
      logs.innerHTML += `<div>[${timestamp}] ${message}</div>`;
    }
  </script>
</body>
</html>
```

**Steps:**
1. Login via REST API to get access token
2. Replace `YOUR_ACCESS_TOKEN_HERE` with the token
3. Open `test-socket.html` in browser
4. Check browser console and page for connection status

### 3. Multi-Device Test

Open multiple tabs with different users:

```javascript
// Tab 1 (User A)
const socketA = io('http://localhost:3000/socket.io', {
  auth: { token: 'USER_A_TOKEN' }
});

// Tab 2 (User A - different device)
const socketA2 = io('http://localhost:3000/socket.io', {
  auth: { token: 'USER_A_TOKEN' }
});

// Tab 3 (User B)
const socketB = io('http://localhost:3000/socket.io', {
  auth: { token: 'USER_B_TOKEN' }
});
```

**Verify in Redis:**
```bash
redis-cli

# Check User A's sockets (should have 2)
SMEMBERS user:{USER_A_ID}:sockets

# Check online users
ZRANGE presence:online_users 0 -1

# Check user status
GET user:{USER_A_ID}:status
```

### 4. Graceful Shutdown Test

```bash
# Terminal 1: Run server
npm run start:dev

# Terminal 2: Connect clients (open test-socket.html in browser)

# Terminal 1: Send SIGTERM
# On macOS/Linux: Ctrl+C
# Or: kill -SIGTERM <PID>

# Observe:
# - Server emits 'server:shutdown' to all clients
# - Clients auto-reconnect
# - Server waits 30s for graceful disconnect
# - Server exits cleanly
```

### 5. Redis Pub/Sub Test

```bash
# Terminal 1: Subscribe to presence channel
redis-cli
SUBSCRIBE socket:presence:online

# Terminal 2: Connect a socket client
# You should see messages in Terminal 1 when users connect/disconnect
```

## 🔍 Monitoring & Debugging

### View Logs

```bash
# Application logs show:
# - Socket connections/disconnections
# - Authentication events
# - Redis operations
# - Errors & warnings

# Example log output:
[SocketGateway] Socket connecting: abcd1234
[SocketAuthService] Socket abcd1234: Authenticating...
[SocketStateService] Socket registered: abcd1234 for user xyz789
[PresenceService] User xyz789 marked as online (device: device-hash)
[SocketGateway] ✅ Socket authenticated: abcd1234 | User: xyz789 | John Doe
```

### Check Redis Data

```bash
redis-cli

# View all keys
KEYS *

# Check specific user's sockets
SMEMBERS user:USER_ID:sockets

# Check socket metadata
HGETALL socket:SOCKET_ID:user

# Check online users count
ZCARD presence:online_users

# Check user status
GET user:USER_ID:status
```

### Database Queries

```sql
-- View recent socket connections
SELECT * FROM socket_connections
ORDER BY connected_at DESC
LIMIT 10;

-- View active connections
SELECT * FROM socket_connections
WHERE disconnected_at IS NULL;

-- View presence history
SELECT * FROM presence_logs
WHERE user_id = 'USER_ID'
ORDER BY timestamp DESC
LIMIT 10;

-- Average connection duration
SELECT AVG(duration_seconds) as avg_duration
FROM socket_connections
WHERE duration_seconds IS NOT NULL;
```

## 🚨 Troubleshooting

### Issue: Cannot connect to Redis

```bash
# Check if Redis is running
redis-cli ping
# Expected: PONG

# Check Redis logs
docker logs redis-zalo

# Verify .env configuration
echo $REDIS_HOST
```

### Issue: Socket authentication fails

```bash
# Verify JWT token is valid
# Check server logs for error details
# Ensure JWT_ACCESS_SECRET matches between login and socket

# Test token manually
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/v1/auth/me
```

### Issue: Socket disconnects immediately

```bash
# Check CORS configuration
# Verify CLIENT_ORIGIN in .env matches client URL

# Check firewall/proxy settings
# WebSocket needs HTTP Upgrade support

# Verify pingInterval/pingTimeout settings
# Default: 25s/20s - adjust if network is slow
```

### Issue: Graceful shutdown timeout

```bash
# Increase timeout in socket.config.ts
gracefulShutdownTimeout: 60000, // 60 seconds

# Check if clients are reconnecting too fast
# Add reconnection delay on client side
```

## ✅ Phase 0 Success Criteria

Before proceeding to Phase 1, verify:

- [ ] Health check returns 200 OK for all services
- [ ] Socket client can connect and authenticate
- [ ] Multiple devices per user work correctly
- [ ] User shows as online in Redis
- [ ] Socket disconnection cleans up Redis entries
- [ ] Graceful shutdown works without errors
- [ ] No memory leaks after 100 connections (use heap snapshot)
- [ ] Redis Pub/Sub channels receive events
- [ ] Database logs socket connections correctly

## 📝 Next Steps

Phase 1: Security & Stability (Week 2)
- Rate limiting implementation
- Payload validation pipeline
- Connection reliability tuning
- Memory leak prevention patterns

---

**Phase 0 Status: ✅ READY FOR TESTING**

Run through all tests above before proceeding to Phase 1.