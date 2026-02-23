/**
 * CallHistoryService - Call logging and history management
 *
 * Responsibilities:
 * - Track active calls (Redis only)
 * - Log completed calls to database
 * - Query call history
 * - Track missed calls
 * - Provide call statistics
 *
 * Architecture:
 * - Active calls: Redis (TTL 60s, heartbeat refresh)
 * - Completed calls: PostgreSQL (permanent storage)
 * - Write to DB only on CALL_ENDED event
 */

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { RedisService } from 'src/modules/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CallStatus, Prisma } from '@prisma/client';

import { v4 as uuidv4 } from 'uuid';
import { CursorPaginatedResult } from 'src/common/interfaces/paginated-result.interface';
import { SelfActionException } from 'src/shared/errors';
import { DisplayNameResolver } from '@shared/services';
import {
  ActiveCallSession,
  CallHistoryResponseDto,
  GetCallHistoryQueryDto,
  LogCallDto,
  MissedCallsCountDto,
} from './dto/call-history.dto';

// 1. Định nghĩa Type cho kết quả query từ Prisma (bao gồm cả Relations)
const callHistoryWithRelations =
  Prisma.validator<Prisma.CallHistoryDefaultArgs>()({
    include: {
      caller: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
      callee: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
    },
  });

// Đây là Type an toàn được Prisma tự động sinh ra
type CallHistoryWithRelations = Prisma.CallHistoryGetPayload<
  typeof callHistoryWithRelations
>;
@Injectable()
export class CallHistoryService {
  private readonly logger = new Logger(CallHistoryService.name);

  // Redis TTL for active calls
  private readonly ACTIVE_CALL_TTL = 60; // 60 seconds (refresh on heartbeat)

  // Cache TTL for call history
  private readonly CACHE_TTL_CALL_HISTORY = 300; // 5 minutes
  // Cache key for missed calls badge
  private readonly CACHE_TTL_MISSED_COUNT = 60; // 1 minute

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly eventEmitter: EventEmitter2,
    private readonly displayNameResolver: DisplayNameResolver,
  ) { }

  /**
   * Start tracking an active call (Redis only)
   *
   * Called when call is initiated (before connected)
   */
  async startCall(
    callerId: string,
    calleeId: string,
  ): Promise<ActiveCallSession> {
    const callId = uuidv4();
    const session: ActiveCallSession = {
      callId,
      callerId,
      calleeId,
      startedAt: new Date(),
      status: 'RINGING',
    };

    // Store in Redis with TTL
    const key = this.getActiveCallKey(callId);
    await this.redis.setex(key, this.ACTIVE_CALL_TTL, JSON.stringify(session));

    // Also index by user IDs for quick lookup
    await this.indexCallByUsers(callId, callerId, calleeId);

    this.logger.log(
      `Active call started: ${callId} (${callerId} → ${calleeId})`,
    );

    return session;
  }

  /**
   * Update call status (e.g., RINGING → ACTIVE)
   */
  async updateCallStatus(
    callId: string,
    status: 'RINGING' | 'ACTIVE',
  ): Promise<void> {
    const key = this.getActiveCallKey(callId);
    const sessionJson = await this.redis.get(key);

    if (!sessionJson) {
      this.logger.warn(`Call not found in Redis: ${callId}`);
      return;
    }

    const session: ActiveCallSession = JSON.parse(
      sessionJson,
    ) as ActiveCallSession;
    session.status = status;

    // Refresh TTL
    await this.redis.setex(key, this.ACTIVE_CALL_TTL, JSON.stringify(session));
  }

  /**
   * Heartbeat to keep call alive
   * (Called periodically from WebRTC module while call is active)
   */
  async heartbeat(callId: string): Promise<void> {
    const key = this.getActiveCallKey(callId);
    const exists = await this.redis.get(key);

    if (exists) {
      // Refresh TTL
      await this.redis.expire(key, this.ACTIVE_CALL_TTL);
    }
  }

  /**
   * End call and save to database
   *
   * This is the only method that writes to database
   */
  /**
   * End call with distributed lock (prevents race condition)
   */
  async endCall(dto: LogCallDto): Promise<CallHistoryResponseDto> {
    const { callerId, calleeId } = dto;

    // Validation
    if (callerId === calleeId) {
      throw new SelfActionException('Cannot log call to self');
    }

    // Get active session to determine call ID
    let activeSession = await this.getActiveCall(callerId);
    if (!activeSession) {
      activeSession = await this.getActiveCall(calleeId);
    }

    if (!activeSession) {
      this.logger.warn(
        `No active session found for call: ${callerId} -> ${calleeId}`,
      );
      // Fallback: create new ID for orphaned calls
      return this.endCallWithoutSession(dto);
    }

    const callId = activeSession.callId;

    // 🔒 ACQUIRE DISTRIBUTED LOCK
    const lockKey = `call:end_lock:${callId}`;
    const lockValue = uuidv4();
    const lockTTL = 5; // 5 seconds

    const locked = await this.redis.getClient().set(
      lockKey,
      lockValue,
      'EX',
      lockTTL,
      'NX', // Only if not exists
    );

    if (!locked) {
      // Another request is processing - wait for result
      this.logger.debug(`Call ${callId} already being processed, waiting...`);
      return this.waitForCallEnd(callId, 3000); // Wait max 3s
    }

    try {
      // CRITICAL SECTION - Only one request enters
      const result = await this.processCallEnd(activeSession, dto);

      // Cache result for concurrent requests
      await this.redis.setex(
        `call:result:${callId}`,
        10, // 10s TTL
        JSON.stringify(result),
      );

      return result;
    } finally {
      // 🔓 RELEASE LOCK (verify ownership before deleting)
      const currentValue = await this.redis.get(lockKey);
      if (currentValue === lockValue) {
        await this.redis.del(lockKey);
      }
    }
  }

  /**
   * Wait for another request to finish processing the call
   */
  private async waitForCallEnd(
    callId: string,
    maxWaitMs: number,
  ): Promise<CallHistoryResponseDto> {
    const resultKey = `call:result:${callId}`;
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const cached = await this.redis.get(resultKey);
      if (cached) {
        this.logger.debug(`Retrieved cached result for call ${callId}`);
        return JSON.parse(cached);
      }

      // Wait 100ms before retry
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Timeout - return error
    throw new BadRequestException('Call processing timeout');
  }

  /**
   * Process call end (inside critical section)
   */
  private async processCallEnd(
    activeSession: ActiveCallSession,
    dto: LogCallDto,
  ): Promise<CallHistoryResponseDto> {
    const { status } = dto;

    // Calculate server-side duration
    const serverStart = new Date(activeSession.startedAt);
    const serverEnd = new Date();
    const durationMs = serverEnd.getTime() - serverStart.getTime();
    const finalDuration = Math.max(0, Math.round(durationMs / 1000));

    // Save to database
    const callHistory = await this.prisma.callHistory.create({
      data: {
        callerId: activeSession.callerId,
        calleeId: activeSession.calleeId,
        status,
        duration: finalDuration,
        startedAt: serverStart,
        endedAt: serverEnd,
      },
      include: {
        caller: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        callee: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
      },
    });

    // Remove from active calls
    await this.removeActiveCallById(activeSession.callId);

    // Invalidate missed calls cache if needed
    if (status === CallStatus.MISSED) {
      await this.invalidateMissedCallsCache(activeSession.calleeId);
    }

    // Publish event
    this.eventEmitter.emit('call.ended', {
      callId: callHistory.id,
      callerId: activeSession.callerId,
      calleeId: activeSession.calleeId,
      status,
    });

    this.logger.log(
      `Call logged: ${callHistory.id} (${status}, ${finalDuration}s)`,
    );

    return this.mapToResponseDto(callHistory, '', new Map());
  }

  /**
   * Handle orphaned calls (no active session)
   */
  private async endCallWithoutSession(
    dto: LogCallDto,
  ): Promise<CallHistoryResponseDto> {
    const { callerId, calleeId, status, startedAt } = dto;

    const clientStart = new Date(startedAt);
    const now = new Date();
    const duration = Math.max(
      0,
      Math.round((now.getTime() - clientStart.getTime()) / 1000),
    );

    const callHistory = await this.prisma.callHistory.create({
      data: {
        callerId,
        calleeId,
        status,
        duration,
        startedAt: clientStart,
        endedAt: now,
      },
      include: {
        caller: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
        callee: {
          select: { id: true, displayName: true, avatarUrl: true },
        },
      },
    });

    if (status === CallStatus.MISSED) {
      await this.invalidateMissedCallsCache(calleeId);
    }

    this.logger.warn(`Call logged without active session: ${callHistory.id}`);

    return this.mapToResponseDto(callHistory, '', new Map());
  }

  /**
   * Get call history for a user (Paginated + Filter)
   */
  async getCallHistory(
    userId: string,
    query: GetCallHistoryQueryDto,
  ): Promise<CursorPaginatedResult<CallHistoryResponseDto>> {
    // 1. Destructuring params từ DTO
    // limit default = 20 (hoặc lấy từ DTO nếu đã set default)
    const {
      cursor,
      limit = 20,
      status = CallStatus.MISSED,
      includeTotal,
    } = query;

    // Get last viewed timestamp (for isViewed calculation)
    const viewedAt = await this.getLastViewedAt(userId);

    // 2. Build Where Clause (Strict Type)
    // Logic: (Là caller HOẶC callee) VÀ (Chưa xóa) VÀ (Status khớp nếu có)
    const where: Prisma.CallHistoryWhereInput = {
      OR: [{ callerId: userId }, { calleeId: userId }],
      deletedAt: null, // [Quan trọng] Không lấy các log đã Soft Delete
    };

    if (status) {
      where.status = status;
    }

    // 3. Query DB using Native Cursor
    // Thay vì dùng 'lt' (không đúng với UUID), ta dùng cursor object + skip
    const calls = await this.prisma.callHistory.findMany({
      where,
      take: limit + 1, // Lấy dư 1 item để check hasNextPage
      cursor: cursor ? { id: cursor } : undefined,
      // skip: cursor ? 1 : 0, // Bỏ qua item làm cursor
      orderBy: { startedAt: 'desc' }, // Mới nhất lên đầu
      ...callHistoryWithRelations,
    });

    // 2. [OPTIMIZATION] Batch Resolve Display Names
    // Resolve display names using contact-based priority:
    // aliasName > phoneBookName > displayName
    const otherUserIds = [
      ...new Set(
        calls
          .flatMap((c) => [c.callerId, c.calleeId])
          .filter((id) => id !== userId),
      ),
    ];
    const nameMap = await this.displayNameResolver.batchResolve(
      userId,
      otherUserIds,
    );

    // 4. Pagination Calculation
    const hasNextPage = calls.length > limit;
    // Cắt bỏ item thừa (item thứ limit + 1)
    const data = hasNextPage ? calls.slice(0, -1) : calls;
    // Lấy ID của item cuối cùng làm nextCursor
    const nextCursor = hasNextPage ? data[data.length - 1].id : undefined;

    let total: number | undefined;
    if (includeTotal === true || cursor === undefined) {
      total = await this.prisma.callHistory.count({ where });
    }
    const mappedData = data.map((call) =>
      this.mapToResponseDto(call, userId, nameMap, viewedAt),
    );

    // 5. Return Result
    return {
      data: mappedData,
      meta: {
        limit,
        hasNextPage,
        nextCursor,
        total,
      },
    };
  }

  /**
   * Get last time user viewed missed calls screen
   */
  private async getLastViewedAt(userId: string): Promise<Date> {
    const key = this.getMissedCallsViewedAtKey(userId);
    const timestamp = await this.redis.get(key);

    if (!timestamp) {
      // Never viewed - return epoch
      return new Date(0);
    }

    return new Date(timestamp);
  }
  /**
   * Get missed calls count
   */
  async getMissedCallsCount(userId: string): Promise<MissedCallsCountDto> {
    // Try cache first
    const cacheKey = this.getMissedCallsCacheKey(userId);
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      return JSON.parse(cached);
    }

    // Get last viewed timestamp
    const viewedAt = await this.getLastViewedAt(userId);

    // Count missed calls after last viewed time
    const count = await this.prisma.callHistory.count({
      where: {
        calleeId: userId,
        status: CallStatus.MISSED,
        startedAt: {
          gt: viewedAt,
        },
      },
    });
    // Get last missed call
    const lastMissedCall = await this.prisma.callHistory.findFirst({
      where: {
        calleeId: userId,
        status: CallStatus.MISSED,
        deletedAt: null,
      },
      orderBy: { startedAt: 'desc' },
      select: { startedAt: true },
    });

    const result: MissedCallsCountDto = {
      count,
      lastMissedAt: lastMissedCall?.startedAt,
    };

    // Cache for 1 minute
    await this.redis.setex(
      cacheKey,
      this.CACHE_TTL_MISSED_COUNT,
      JSON.stringify(result),
    );

    return result;
  }

  /**
   * Mark missed calls as viewed
   *
   * This clears the notification badge.
   * We store the "last viewed timestamp" in Redis.
   * Any missed call BEFORE this timestamp is considered "viewed".
   */
  async markMissedCallsAsViewed(userId: string): Promise<void> {
    const now = new Date();
    const key = this.getMissedCallsViewedAtKey(userId);

    // Store current timestamp as "last viewed at"
    // TTL: 90 days (after which old missed calls can be purged)
    await this.redis.setex(key, 7776000, now.toISOString());

    // Invalidate cache
    await this.invalidateMissedCallsCache(userId);

    this.logger.debug(`Missed calls marked as viewed for user: ${userId}`);
  }

  /**
   * Get list of unviewed missed calls
   *
   * Useful for showing detailed missed calls list
   */
  async getUnviewedMissedCalls(
    userId: string,
    limit: number = 20,
  ): Promise<CallHistoryResponseDto[]> {
    const viewedAt = await this.getLastViewedAt(userId);

    // Query unviewed missed calls
    const calls = await this.prisma.callHistory.findMany({
      where: {
        calleeId: userId,
        status: CallStatus.MISSED,
        startedAt: {
          gt: viewedAt,
        },
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
      ...callHistoryWithRelations,
    });
    // [NEW] Resolve display names for callers (missed calls = other person is always caller)
    const otherUserIds = [
      ...new Set(calls.map((call) => call.callerId)),
    ];
    const nameMap = await this.displayNameResolver.batchResolve(
      userId,
      otherUserIds,
    );

    return calls.map((call) =>
      this.mapToResponseDto(call, userId, nameMap, viewedAt),
    );
  }

  /**
   * Get active call for a user (if any)
   */
  async getActiveCall(userId: string): Promise<ActiveCallSession | null> {
    const callIds = await this.getActiveCallIdsByUser(userId);

    if (callIds.length === 0) {
      return null;
    }

    // Get first active call (user should only have 1 active call)
    const callId = callIds[0];
    const key = this.getActiveCallKey(callId);
    const sessionJson = await this.redis.get(key);

    if (!sessionJson) {
      return null;
    }

    return JSON.parse(sessionJson) as ActiveCallSession;
  }

  /**
   * Terminate active call (e.g., when user blocks/unfriends during call)
   */
  async terminateActiveCall(userId1: string, userId2: string): Promise<void> {
    // Find active call between these users
    const user1Calls = await this.getActiveCallIdsByUser(userId1);
    const user2Calls = await this.getActiveCallIdsByUser(userId2);

    // Find intersection
    const activeCalls = user1Calls.filter((id) => user2Calls.includes(id));

    if (activeCalls.length === 0) {
      return;
    }

    // Remove all active calls
    for (const callId of activeCalls) {
      await this.removeActiveCallById(callId);
    }

    // Publish termination event
    this.eventEmitter.emit('call.terminated', {
      userId1,
      userId2,
      reason: 'relationship_changed',
    });

    this.logger.log(`Active call terminated: ${userId1} <-> ${userId2}`);
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Get Redis key for active call
   */
  private getActiveCallKey(callId: string): string {
    return `call:session:${callId}`;
  }

  /**
   * Get Redis key for user's active calls index
   */
  private getUserCallsKey(userId: string): string {
    return `call:user:${userId}:active`;
  }

  /**
   * Get Redis key for missed calls cache
   */
  private getMissedCallsCacheKey(userId: string): string {
    return `call:missed:count:${userId}`;
  }

  /**
   * Get Redis key for last viewed timestamp
   */
  private getMissedCallsViewedAtKey(userId: string): string {
    return `call:missed:viewed_at:${userId}`;
  }

  /**
   * Invalidate missed calls cache
   */
  private async invalidateMissedCallsCache(userId: string): Promise<void> {
    const key = this.getMissedCallsCacheKey(userId);
    await this.redis.del(key);
  }

  /**
   * Index call by user IDs for quick lookup
   */
  private async indexCallByUsers(
    callId: string,
    callerId: string,
    calleeId: string,
  ): Promise<void> {
    // Add call ID to both users' active call lists
    const callerKey = this.getUserCallsKey(callerId);
    const calleeKey = this.getUserCallsKey(calleeId);

    // Use Redis SET to store active call IDs
    await Promise.all([
      this.redis.getClient().sadd(callerKey, callId),
      this.redis.getClient().sadd(calleeKey, callId),
      // Set TTL on the sets
      this.redis.expire(callerKey, this.ACTIVE_CALL_TTL),
      this.redis.expire(calleeKey, this.ACTIVE_CALL_TTL),
    ]);
  }

  /**
   * Get active call IDs for a user
   */
  private async getActiveCallIdsByUser(userId: string): Promise<string[]> {
    const key = this.getUserCallsKey(userId);
    return this.redis.getClient().smembers(key);
  }

  /**
   * Remove active call from Redis
   */
  private async removeActiveCall(
    callerId: string,
    calleeId: string,
  ): Promise<void> {
    // Remove from user indexes
    const callerKey = this.getUserCallsKey(callerId);
    const calleeKey = this.getUserCallsKey(calleeId);

    const callerCalls = await this.redis.getClient().smembers(callerKey);
    const calleeCalls = await this.redis.getClient().smembers(calleeKey);

    // Find common call ID
    const callIds = callerCalls.filter((id) => calleeCalls.includes(id));

    for (const callId of callIds) {
      await this.removeActiveCallById(callId);
    }
  }

  /**
   * Remove active call by ID
   */
  private async removeActiveCallById(callId: string): Promise<void> {
    // Get session to find users
    const key = this.getActiveCallKey(callId);
    const sessionJson = await this.redis.get(key);

    if (sessionJson) {
      const session: ActiveCallSession = JSON.parse(
        sessionJson,
      ) as ActiveCallSession;

      // Remove from user indexes
      await Promise.all([
        this.redis
          .getClient()
          .srem(this.getUserCallsKey(session.callerId), callId),
        this.redis
          .getClient()
          .srem(this.getUserCallsKey(session.calleeId), callId),
      ]);
    }

    // Remove session
    await this.redis.del(key);
  }

  /**
   * Terminate all active calls between two users
   * Used when blocking a user - immediately ends ongoing calls
   *
   * PHASE 3.5: Called by CallBlockListener on user.blocked event
   */
  async terminateCallsBetweenUsers(
    user1Id: string,
    user2Id: string,
  ): Promise<number> {
    const callerCalls = await this.redis
      .getClient()
      .smembers(this.getUserCallsKey(user1Id));
    const calleeCalls = await this.redis
      .getClient()
      .smembers(this.getUserCallsKey(user2Id));

    // Find calls between these two users
    const callIds = callerCalls.filter((id) => calleeCalls.includes(id));

    this.logger.log(
      `Terminating ${callIds.length} call(s) between ${user1Id} and ${user2Id}`,
    );

    for (const callId of callIds) {
      await this.removeActiveCallById(callId);
      // Publish event to notify clients
      this.eventEmitter.emit('call.terminated', {
        callId,
        reason: 'USER_BLOCKED',
      });
    }

    return callIds.length;
  }

  /**
   * Map CallHistory entity to response DTO
   */
  private mapToResponseDto(
    call: CallHistoryWithRelations,
    currentUserId: string, // [NEW] Cần biết ai đang xem để lấy đúng tên
    nameMap: Map<string, string>, // [NEW] Map tên đã resolve
    viewedAt?: Date,
  ): CallHistoryResponseDto {
    // Helper function để lấy tên hiển thị chuẩn
    const resolveName = (user: { id: string; displayName: string } | null) => {
      if (!user) return 'Unknown';
      // Nếu user này là chính mình -> Dùng tên thật (Hoặc "Me")
      if (user.id === currentUserId) return user.displayName;
      // Nếu là người khác -> Ưu tiên Alias trong danh bạ, fallback về tên thật
      return nameMap.get(user.id) || user.displayName;
    };
    return {
      id: call.id.toString(), // id trong schema là BigInt hoặc String? Nếu String thì bỏ .toString()
      callerId: call.callerId, // Prisma: String? -> DTO: String. Cần handle null nếu schema allow null
      calleeId: call.calleeId,
      status: call.status,
      duration: call.duration ?? 0, // Fix undefined
      startedAt: call.startedAt,
      endedAt: call.endedAt ?? undefined, // DTO của bạn có endedAt không? Nếu có thì uncomment

      // Logic isViewed: Trong schema chưa có field này, tạm thời set false hoặc logic riêng
      isViewed: viewedAt ? call.startedAt <= viewedAt : false,

      caller: call.caller
        ? {
          id: call.caller.id,
          displayName: resolveName(call.caller),
          avatarUrl: call.caller.avatarUrl ?? undefined,
        }
        : undefined,
      callee: call.callee
        ? {
          id: call.callee.id,
          displayName: resolveName(call.callee),
          avatarUrl: call.callee.avatarUrl ?? undefined,
        }
        : undefined,
    };
  }
  // Add these methods
  async deleteCallLog(userId: string, callId: string): Promise<void> {
    // Soft delete logic
    const call = await this.prisma.callHistory.findUnique({
      where: { id: callId },
    });
    if (!call) {
      throw new NotFoundException("can't found call");
    }

    // Validate ownership
    if (call.callerId !== userId && call.calleeId !== userId) {
      throw new ForbiddenException('Cannot delete call log');
    }

    // Soft delete (add deletedAt field to schema)
    await this.prisma.callHistory.update({
      where: { id: callId },
      data: { deletedAt: new Date() },
    });
  }

  async logCallEnded(dto: LogCallDto): Promise<CallHistoryResponseDto> {
    // Validate callerId matches authenticated user
    // Then call endCall
    return this.endCall(dto);
  }

  async getMissedCalls(userId: string) {
    // Rename from getMissedCallsCount or add wrapper
    const count = await this.getMissedCallsCount(userId);
    const calls = await this.getUnviewedMissedCalls(userId, 20);
    return { count: count.count, calls };
  }

  async markAllMissedAsViewed(userId: string): Promise<void> {
    // Rename from markMissedCallsAsViewed
    return this.markMissedCallsAsViewed(userId);
  }

  /**
   * Cleanup all active calls for a user
   * Called on: logout, socket disconnect, crash detection
   */
  async cleanupUserActiveCalls(userId: string): Promise<void> {
    const callIds = await this.getActiveCallIdsByUser(userId);

    if (callIds.length === 0) {
      return;
    }

    this.logger.log(
      `Cleaning up ${callIds.length} active calls for user ${userId}`,
    );
    await Promise.all(
      callIds.map((callId) =>
        this.endCallGracefully(callId, 'user_disconnected'),
      ),
    );
  }

  /**
   * End call gracefully with reason
   */
  private async endCallGracefully(
    callId: string,
    reason: string,
  ): Promise<void> {
    // Get session
    const key = this.getActiveCallKey(callId);
    const sessionJson = await this.redis.get(key);

    if (!sessionJson) {
      return;
    }

    const session: ActiveCallSession = JSON.parse(
      sessionJson,
    ) as ActiveCallSession;

    // Calculate duration
    const durationMs = Date.now() - session.startedAt.getTime();
    const duration = Math.round(durationMs / 1000);

    // Log to DB
    try {
      await this.prisma.callHistory.create({
        data: {
          callerId: session.callerId,
          calleeId: session.calleeId,
          status: CallStatus.MISSED, // Or DISCONNECTED if you add that status
          duration,
          startedAt: session.startedAt,
          endedAt: new Date(),
        },
      });

      this.logger.log(`Call ${callId} ended gracefully: ${reason}`);
    } catch (error) {
      this.logger.error(`Failed to log call ${callId}:`, error);
    }

    // Remove from Redis
    await this.removeActiveCallById(callId);
  }
}
