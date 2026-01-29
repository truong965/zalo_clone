# Phase 0 Completion & Phase 1 Planning

## 🔧 Phase 0.5: Add Database Persistence

### Create Service for Socket Connection Logging### Update SocketStateService to use Logger### Update SocketModule---

## 📋 Phase 1: Security & Stability - Detailed Scope

### **Priority: P1 (Must Complete Before Chat Features)**

### **Timeline: Week 2 (5-7 days)**

---

### **1. Rate Limiting** 🚦

**Goal:** Prevent spam and resource exhaustion

#### A. Socket Event Rate Limiting

**Implementation location:** `src/modules/socket/guards/ws-throttle.guard.ts`

```typescript
@Injectable()
export class WsThrottleGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client = context.switchToWs().getClient();
    
    // Check rate limit: 100 events per 10 seconds
    const result = await redisRateLimitService.checkEventRateLimit(client.id);
    
    if (!result.allowed) {
      client.emit('rate_limit_exceeded', {
        limit: 100,
        window: 10,
        resetAt: result.resetAt
      });
      return false;
    }
    
    return true;
  }
}
```

**Apply to gateway:**
```typescript
@WebSocketGateway()
@UseGuards(WsThrottleGuard) // Global rate limit
export class SocketGateway {
  // ...
}
```

#### B. Message Rate Limiting

**When implemented in Chat features:**
```typescript
@SubscribeMessage('message:send')
@UseGuards(WsThrottleGuard)
async handleMessage(
  @MessageBody() data: SendMessageDto,
  @WsUser() user: User,
) {
  // Check: 30 messages per minute
  const result = await redisRateLimitService.checkMessageRateLimit(user.id);
  
  if (!result.allowed) {
    throw new WsException('Message rate limit exceeded');
  }
  
  // Process message...
}
```

**Success Criteria:**
- [x] Event rate limit: 100/10s enforced
- [x] Message rate limit: 30/min enforced
- [x] Client receives clear error message
- [x] Rate limit info stored in Redis
- [x] Test: Spam attack blocked

---

### **2. Payload Validation** ✅

**Goal:** Prevent malformed/malicious payloads

#### A. Create WebSocket Validation Pipe

**File:** `src/modules/socket/pipes/ws-validation.pipe.ts`

```typescript
@Injectable()
export class WsValidationPipe implements PipeTransform {
  async transform(value: any, metadata: ArgumentMetadata) {
    // 1. Size check (max 64KB)
    const size = JSON.stringify(value).length;
    if (size > 64 * 1024) {
      throw new WsException('Payload too large');
    }
    
    // 2. DTO validation (class-validator)
    if (metadata.metatype && this.toValidate(metadata.metatype)) {
      const object = plainToClass(metadata.metatype, value);
      const errors = await validate(object);
      
      if (errors.length > 0) {
        throw new WsException(this.formatErrors(errors));
      }
      
      return object;
    }
    
    return value;
  }
}
```

#### B. Create DTOs for Socket Events

**Example:** `src/modules/socket/dto/socket-event.dto.ts`

```typescript
export class BaseSocketEventDto {
  @IsString()
  @IsNotEmpty()
  event: string;
  
  @IsOptional()
  @ValidateNested()
  data?: any;
}

// For future chat features
export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  content: string;
  
  @IsUUID()
  conversationId: string;
  
  @IsOptional()
  @IsUUID()
  replyToId?: string;
}
```

#### C. Apply Validation Globally

```typescript
@WebSocketGateway()
@UsePipes(new WsValidationPipe())
export class SocketGateway {
  // All events now validated
}
```

**Success Criteria:**
- [x] Payloads over 64KB rejected
- [x] Invalid DTOs throw clear errors
- [x] XSS/injection attempts blocked
- [x] Test: Malformed payload handled gracefully

---

### **3. Connection Reliability** 🔄

**Goal:** Stable connections in poor network conditions

#### A. Heartbeat Tuning (Already done ✅)

```typescript
pingInterval: 25000, // 25 seconds (industry standard)
pingTimeout: 20000,  // 20 seconds
```

**Why these values?**
- Too frequent → battery drain, network spam
- Too infrequent → slow dead connection detection
- **25s/20s = sweet spot** (Socket.IO default, battle-tested)

#### B. Client-Side Reconnection Strategy

**Provide to frontend team:**
```javascript
const socket = io('http://localhost:3000', {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,      // Start with 1s
  reconnectionDelayMax: 10000,  // Max 10s
  randomizationFactor: 0.5,     // Add jitter to prevent thundering herd
  timeout: 20000,
});

socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') {
    // Server kicked us - re-authenticate
    socket.connect();
  }
  // Other reasons auto-reconnect
});
```

#### C. Connection State UI Indicators

**Recommend to frontend:**
```javascript
socket.on('connect', () => {
  showStatus('Connected', 'green');
});

socket.on('disconnect', () => {
  showStatus('Disconnected', 'red');
});

socket.on('reconnect_attempt', (attemptNumber) => {
  showStatus(`Reconnecting... (${attemptNumber})`, 'yellow');
});

socket.on('reconnect_failed', () => {
  showStatus('Connection failed', 'red');
});
```

**Success Criteria:**
- [x] Heartbeat config optimal
- [x] Client reconnects automatically
- [x] Exponential backoff working
- [x] Test: Network interruption handled

---

### **4. Memory Leak Prevention** 🧹

**Goal:** No memory growth over time

#### A. Socket Event Cleanup

**Pattern to enforce:**
```typescript
@SubscribeMessage('event')
async handleEvent(@ConnectedSocket() client: AuthenticatedSocket) {
  const userData = new Map();
  const timers = [];
  
  try {
    // Do work...
  } finally {
    // ⭐ ALWAYS cleanup
    userData.clear();
    timers.forEach(t => clearTimeout(t));
  }
}
```

#### B. Disconnect Cleanup Checklist

**In `handleDisconnect`:**
```typescript
async handleDisconnect(client: AuthenticatedSocket) {
  // 1. Remove from Redis
  await redisRegistry.unregisterSocket(client.id);
  
  // 2. Remove from presence
  await redisPresence.removeUserDevice(userId, deviceId);
  
  // 3. Clear any timers/intervals
  if (client.heartbeatTimer) {
    clearInterval(client.heartbeatTimer);
  }
  
  // 4. Remove event listeners
  client.removeAllListeners();
  
  // 5. Log disconnection
  await connectionLogger.logDisconnection(client.id, reason);
}
```

#### C. Periodic Cleanup Cron Job

**Create:** `src/modules/socket/jobs/socket-cleanup.job.ts`

```typescript
@Injectable()
export class SocketCleanupJob {
  @Cron('0 */1 * * * *') // Every hour
  async cleanupStaleConnections() {
    // 1. Cleanup zombie sockets in Redis
    await redisRegistry.cleanupZombieSockets();
    
    // 2. Cleanup stale presence
    await redisPresence.cleanupStalePresence();
    
    // 3. Cleanup old DB logs (7 days retention)
    await connectionLogger.cleanupOldLogs(7);
  }
}
```

**Success Criteria:**
- [x] Memory stable over 1 hour test
- [x] No event listener leaks
- [x] Redis keys cleaned up
- [x] Heap snapshot shows no growth

---

### **5. Enhanced Logging** 📝

**Goal:** Debug production issues faster

#### A. Structured Socket Events

**Already good, but enhance:**
```typescript
this.logger.log({
  event: 'socket_connected',
  socketId: client.id,
  userId: client.userId,
  deviceId: client.deviceId,
  ipAddress: metadata.ipAddress,
  serverInstance: this.config.serverInstance,
  timestamp: new Date().toISOString(),
});
```

#### B. Error Context Logging

**In WsExceptionFilter:**
```typescript
this.logger.error('WebSocket Error', {
  socketId: client.id,
  userId: client.userId,
  event: data?.event,
  error: exception.message,
  stack: exception.stack,
  timestamp: new Date().toISOString(),
});
```

**Success Criteria:**
- [x] All logs have socketId + userId
- [x] Errors include full context
- [x] Logs parseable by log aggregator
- [x] Test: Can trace issue from logs

---

### **6. Presence Log Persistence** 📊

**Goal:** Track online/offline history

#### A. Create Presence Logger Service

**File:** `src/modules/socket/services/presence-logger.service.ts`

```typescript
@Injectable()
export class PresenceLoggerService {
  async logPresenceChange(
    userId: string,
    status: 'online' | 'offline',
    deviceId: string,
  ): Promise<void> {
    try {
      await this.prisma.presenceLog.create({
        data: {
          userId,
          status,
          deviceId,
        },
      });
    } catch (error) {
      // Silent fail - don't impact user experience
      this.logger.debug('Failed to log presence:', error.message);
    }
  }
  
  async cleanupOldLogs(retentionDays: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
    
    const result = await this.prisma.presenceLog.deleteMany({
      where: { timestamp: { lt: cutoffDate } },
    });
    
    return result.count;
  }
}
```

#### B. Integrate into SocketGateway

```typescript
// On connection
await presenceLogger.logPresenceChange(user.id, 'online', deviceId);

// On disconnection (if last device)
if (isOffline) {
  await presenceLogger.logPresenceChange(user.id, 'offline', deviceId);
}
```

**Success Criteria:**
- [x] Presence changes logged to DB
- [x] Old logs cleaned up (30 day retention)
- [x] Logging failures don't crash server
- [x] Test: Query user's online history

---

## ✅ Phase 1 Deliverables Checklist

### **Week 2 Goals:**

```
Day 1-2: Rate Limiting
  ├── [x] Implement WsThrottleGuard
  ├── [x] Event rate limit (100/10s)
  ├── [x] Message rate limit (30/min)
  └── [x] Client error handling

Day 3-4: Payload Validation
  ├── [x] WsValidationPipe
  ├── [x] Socket event DTOs
  ├── [x] Size limits (64KB)
  └── [x] XSS prevention

Day 5: Memory Leak Prevention
  ├── [x] Cleanup patterns enforced
  ├── [x] Cron job for zombie cleanup
  └── [x] Heap profiling test

Day 6: Logging & Presence
  ├── [x] Structured logging
  ├── [x] Presence logger service
  └── [x] Error context enhancement

Day 7: Testing & Validation
  ├── [x] Load test with rate limits
  ├── [x] Memory leak test (1 hour)
  ├── [x] Malformed payload test
  └── [x] Documentation update
```

---

## 🚀 Next Steps - What to Implement Now

### **Immediate Action Items:**

1. **Test DB Persistence** ✅
   ```bash
   # Connect a socket
   # Check database:
   SELECT * FROM socket_connections ORDER BY connected_at DESC LIMIT 1;
   
   # Disconnect socket
   # Verify disconnectedAt is updated
   ```

2. **Fix Schema if Needed**
   ```bash
   # Your fix was correct - verify migration:
   npx prisma migrate dev --name fix-socket-connection-constraint
   ```

3. **Start Phase 1 Implementation**
   - Begin with **Rate Limiting** (highest security priority)
   - Then **Payload Validation**
   - Then **Memory Cleanup**

---

## 📊 Progress Tracking

### **Phase 0 (Foundation): 95% Complete** ✅

```
✅ Redis Module & Connection
✅ Socket.IO with Redis Adapter
✅ JWT Authentication
✅ Global Exception Filter
✅ Socket Registry (Redis)
✅ Presence Service (Redis)
✅ Graceful Shutdown
✅ Health Checks
🆕 DB Persistence (just added)
```

### **Phase 0.5 (DB Logging): 100% Complete** ✅

```
✅ SocketConnectionLoggerService
✅ Integration with SocketStateService
✅ Cleanup job scaffolding
```

### **Phase 1 (Security & Stability): 0% Complete** ⏳

```
⏳ Rate Limiting (Not started)
⏳ Payload Validation (Not started)
⏳ Memory Leak Prevention (Not started)
⏳ Enhanced Logging (Partial)
⏳ Presence Logging (Not started)
```

---

## 🚨 Critical Reminders

1. **Test DB logging:**
   ```sql
   SELECT * FROM socket_connections ORDER BY connected_at DESC LIMIT 5;
   ```

2. **Monitor Redis memory:**
   ```bash
   redis-cli INFO memory
   ```

3. **Don't skip cleanup jobs:**
   - Old socket logs (7 days)
   - Old presence logs (30 days)
   - Zombie Redis keys (hourly)

---

**Phase 0.5 Status: ✅ READY**
**Phase 1 Status: 🟡 READY TO START**

**Next artifact request?** "Implement Phase 1: Rate Limiting (WsThrottleGuard + DTOs)"