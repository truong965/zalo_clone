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
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { RedisService } from 'src/modules/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CallStatus, CallType, CallProvider, CallParticipantRole, CallParticipantStatus, Prisma } from '@prisma/client';

import { v4 as uuidv4 } from 'uuid';
import { CursorPaginatedResult } from 'src/common/interfaces/paginated-result.interface';
import { SelfActionException } from 'src/shared/errors';
import { DisplayNameResolver } from '@shared/services';
import {
  ActiveCallSession,
  CallHistoryResponseDto,
  EndCallInput,
  GetCallHistoryQueryDto,
  MissedCallsCountDto,
} from './dto/call-history.dto';

// 1. Định nghĩa Type cho kết quả query từ Prisma (bao gồm cả Relations)
const callHistoryWithRelations =
  Prisma.validator<Prisma.CallHistoryDefaultArgs>()({
    include: {
      initiator: {
        select: { id: true, displayName: true, avatarUrl: true },
      },
      participants: {
        select: {
          id: true,
          userId: true,
          role: true,
          status: true,
          joinedAt: true,
          leftAt: true,
          duration: true,
          user: {
            select: { id: true, displayName: true, avatarUrl: true },
          },
        },
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

  // Redis TTL for active calls (refreshed on heartbeat)
  private readonly ACTIVE_CALL_TTL = 300; // 5 minutes — enough for ringing + reconnection

  // Hard cap: max call duration to prevent abuse from untrusted client timestamps
  private readonly MAX_CALL_DURATION = 86400; // 24 hours in seconds

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
    callType: CallType,
    provider: CallProvider,
    conversationId?: string,
    /** Phase 4.4: additional receiver IDs for group calls */
    additionalReceiverIds?: string[],
  ): Promise<ActiveCallSession> {
    // Build full participant list (all receivers)
    const allReceiverIds = [calleeId, ...(additionalReceiverIds ?? [])];
    const uniqueReceiverIds = [...new Set(allReceiverIds)];
    const isGroupCall = uniqueReceiverIds.length > 1;

    // Duplicate call prevention: check if caller already has an active call
    const existingCallerCall = await this.getActiveCall(callerId);
    if (existingCallerCall) {
      throw new ConflictException('Caller already has an active call');
    }

    // Check all receivers for busy status
    for (const receiverId of uniqueReceiverIds) {
      const existingReceiverCall = await this.getActiveCall(receiverId);
      if (existingReceiverCall) {
        throw new ConflictException(`User ${receiverId} is currently in another call`);
      }
    }

    const callId = uuidv4();
    const session: ActiveCallSession = {
      callId,
      callerId,
      calleeId,
      callType,
      provider: isGroupCall ? CallProvider.DAILY_CO : provider,
      conversationId,
      startedAt: new Date(),
      status: 'RINGING',
      participantIds: uniqueReceiverIds,
      isGroupCall,
    };

    // Store in Redis with TTL
    const key = this.getActiveCallKey(callId);
    await this.redis.setex(key, this.ACTIVE_CALL_TTL, JSON.stringify(session));

    // Index by user IDs: 1 active call per user (String, not Set)
    await this.indexCallByUsers(callId, callerId, uniqueReceiverIds);

    this.logger.log(
      `Active call started: ${callId} (${callerId} → ${uniqueReceiverIds.join(',')}` +
      `, ${callType}, ${session.provider}${isGroupCall ? ', GROUP' : ''})`,
    );

    return session;
  }

  /**
   * Update call status (e.g., RINGING → ACTIVE)
   */
  async updateCallStatus(
    callId: string,
    status: 'RINGING' | 'ACTIVE' | 'RECONNECTING',
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
   * Update call provider and optionally the Daily.co room name.
   * Used when switching from WEBRTC_P2P to DAILY_CO (P2P fallback).
   *
   * Phase 4: P2P → Daily.co SFU fallback
   */
  async updateCallProvider(
    callId: string,
    provider: CallProvider,
    dailyRoomName?: string,
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
    session.provider = provider;
    if (dailyRoomName) {
      session.dailyRoomName = dailyRoomName;
    }

    // Refresh TTL
    await this.redis.setex(key, this.ACTIVE_CALL_TTL, JSON.stringify(session));

    this.logger.log(
      `Call ${callId}: provider updated to ${provider}${dailyRoomName ? ` (room: ${dailyRoomName})` : ''}`,
    );
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
  async endCall(dto: EndCallInput): Promise<CallHistoryResponseDto> {
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
    dto: EndCallInput,
  ): Promise<CallHistoryResponseDto> {
    const { status } = dto;

    // Calculate server-side duration
    const serverStart = new Date(activeSession.startedAt);
    const serverEnd = new Date();
    const durationMs = serverEnd.getTime() - serverStart.getTime();
    const finalDuration = Math.min(
      Math.max(0, Math.round(durationMs / 1000)),
      this.MAX_CALL_DURATION,
    );

    // All participants: initiator + receivers
    const allReceiverIds = activeSession.participantIds ?? [activeSession.calleeId];
    const participantCount = 1 + allReceiverIds.length; // initiator + all receivers

    // Determine participant statuses
    const receiverParticipantStatus: CallParticipantStatus =
      status === CallStatus.MISSED ? CallParticipantStatus.MISSED
        : status === CallStatus.NO_ANSWER ? CallParticipantStatus.MISSED
          : status === CallStatus.REJECTED ? CallParticipantStatus.REJECTED
            : status === CallStatus.CANCELLED ? CallParticipantStatus.MISSED
              : CallParticipantStatus.JOINED; // COMPLETED

    // Save to database atomically
    const callHistory = await this.prisma.$transaction(async (tx) => {
      const created = await tx.callHistory.create({
        data: {
          initiatorId: activeSession.callerId,
          participantCount,
          callType: activeSession.callType,
          provider: activeSession.provider,
          conversationId: activeSession.conversationId,
          status,
          duration: finalDuration,
          startedAt: serverStart,
          endedAt: serverEnd,
        },
      });

      // Create participant records
      await tx.callParticipant.createMany({
        data: [
          {
            callId: created.id,
            userId: activeSession.callerId,
            role: CallParticipantRole.HOST,
            status: status === CallStatus.CANCELLED ? CallParticipantStatus.LEFT : CallParticipantStatus.JOINED,
            joinedAt: serverStart,
            leftAt: serverEnd,
            duration: finalDuration,
          },
          ...allReceiverIds.map((receiverId) => ({
            callId: created.id,
            userId: receiverId,
            role: CallParticipantRole.MEMBER,
            status: receiverParticipantStatus,
            joinedAt: receiverParticipantStatus === CallParticipantStatus.JOINED ? serverStart : null,
            leftAt: receiverParticipantStatus === CallParticipantStatus.JOINED ? serverEnd : null,
            duration: receiverParticipantStatus === CallParticipantStatus.JOINED ? finalDuration : null,
          })),
        ],
        skipDuplicates: true,
      });

      return tx.callHistory.findUniqueOrThrow({
        where: { id: created.id },
        ...callHistoryWithRelations,
      });
    });

    // Remove from active calls
    await this.removeActiveCallById(activeSession.callId);

    // Invalidate missed calls cache for all receivers who missed
    if (
      status === CallStatus.MISSED ||
      status === CallStatus.NO_ANSWER ||
      status === CallStatus.CANCELLED
    ) {
      await Promise.all(
        allReceiverIds.map((id) => this.invalidateMissedCallsCache(id)),
      );
    }

    // Publish unified event
    this.eventEmitter.emit('call.ended', {
      callId: callHistory.id,
      callType: activeSession.callType,
      initiatorId: activeSession.callerId,
      receiverIds: activeSession.participantIds ?? [activeSession.calleeId],
      conversationId: activeSession.conversationId,
      status,
      reason: dto.endReason ?? 'USER_HANGUP',
      provider: activeSession.provider,
      durationSeconds: finalDuration,
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
    dto: EndCallInput,
  ): Promise<CallHistoryResponseDto> {
    const { callerId, calleeId, status, startedAt } = dto;

    const clientStart = new Date(startedAt);
    const now = new Date();
    // Hard cap: don't trust client startedAt — limit to MAX_CALL_DURATION
    const rawDuration = Math.max(
      0,
      Math.round((now.getTime() - clientStart.getTime()) / 1000),
    );
    const duration = Math.min(rawDuration, this.MAX_CALL_DURATION);

    const receiverStatus: CallParticipantStatus =
      status === CallStatus.MISSED || status === CallStatus.NO_ANSWER
        ? CallParticipantStatus.MISSED
        : status === CallStatus.REJECTED
          ? CallParticipantStatus.REJECTED
          : CallParticipantStatus.JOINED;

    const callHistory = await this.prisma.$transaction(async (tx) => {
      const created = await tx.callHistory.create({
        data: {
          initiatorId: callerId,
          participantCount: calleeId ? 2 : 1,
          callType: dto.callType ?? CallType.VOICE,
          provider: dto.provider ?? CallProvider.WEBRTC_P2P,
          status,
          duration,
          startedAt: clientStart,
          endedAt: now,
        },
      });

      const participantData: Prisma.CallParticipantCreateManyInput[] = [
        {
          callId: created.id,
          userId: callerId,
          role: CallParticipantRole.HOST,
          status: status === CallStatus.CANCELLED ? CallParticipantStatus.LEFT : CallParticipantStatus.JOINED,
          joinedAt: clientStart,
          leftAt: now,
          duration,
        },
      ];
      if (calleeId) {
        participantData.push({
          callId: created.id,
          userId: calleeId,
          role: CallParticipantRole.MEMBER,
          status: receiverStatus,
          joinedAt: receiverStatus === CallParticipantStatus.JOINED ? clientStart : null,
          leftAt: receiverStatus === CallParticipantStatus.JOINED ? now : null,
          duration: receiverStatus === CallParticipantStatus.JOINED ? duration : null,
        });
      }
      await tx.callParticipant.createMany({ data: participantData, skipDuplicates: true });

      return tx.callHistory.findUniqueOrThrow({
        where: { id: created.id },
        ...callHistoryWithRelations,
      });
    });

    if (
      status === CallStatus.MISSED ||
      status === CallStatus.NO_ANSWER
    ) {
      if (calleeId) await this.invalidateMissedCallsCache(calleeId);
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
      status,
      includeTotal,
    } = query;

    // Get last viewed timestamp (for isViewed calculation)
    const viewedAt = await this.getLastViewedAt(userId);

    // 2. Build Where Clause (Strict Type)
    // Logic: User is participant AND (Chưa xóa) AND (Status khớp nếu có)
    // Special case: MISSED filter → match by CallParticipant.status = MISSED
    // (covers CallHistory statuses: MISSED, NO_ANSWER, CANCELLED, REJECTED)
    const isMissedFilter = status === CallStatus.MISSED;

    const where: Prisma.CallHistoryWhereInput = {
      participants: {
        some: isMissedFilter
          ? { userId, status: CallParticipantStatus.MISSED }
          : { userId },
      },
      deletedAt: null, // [Quan trọng] Không lấy các log đã Soft Delete
    };

    if (status && !isMissedFilter) {
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
    // Collect all other user IDs from participants
    const otherUserIds = [
      ...new Set(
        calls
          .flatMap((c) => c.participants.map((p) => p.userId))
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

    // Count missed calls via CallParticipant (user was a receiver who missed the call)
    const count = await this.prisma.callParticipant.count({
      where: {
        userId,
        status: CallParticipantStatus.MISSED,
        callHistory: {
          deletedAt: null,
          startedAt: { gt: viewedAt },
        },
      },
    });

    // Get last missed call
    const lastMissedParticipant = await this.prisma.callParticipant.findFirst({
      where: {
        userId,
        status: CallParticipantStatus.MISSED,
        callHistory: { deletedAt: null },
      },
      orderBy: { callHistory: { startedAt: 'desc' } },
      select: { callHistory: { select: { startedAt: true } } },
    });

    const result: MissedCallsCountDto = {
      count,
      lastMissedAt: lastMissedParticipant?.callHistory?.startedAt,
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

    // Query unviewed missed calls via participants
    const missedParticipants = await this.prisma.callParticipant.findMany({
      where: {
        userId,
        status: CallParticipantStatus.MISSED,
        callHistory: {
          deletedAt: null,
          startedAt: { gt: viewedAt },
        },
      },
      orderBy: { callHistory: { startedAt: 'desc' } },
      take: limit,
      select: { callId: true },
    });

    const callIds = missedParticipants.map((p) => p.callId);
    if (callIds.length === 0) return [];

    const calls = await this.prisma.callHistory.findMany({
      where: { id: { in: callIds } },
      orderBy: { startedAt: 'desc' },
      ...callHistoryWithRelations,
    });
    // Resolve display names for initiators
    const otherUserIds = [
      ...new Set(calls.map((call) => call.initiatorId)),
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
   * Get active call session by callId directly from Redis.
   * Unlike getActiveCall (which resolves userId → callId → session),
   * this goes straight to `call:session:{callId}`.
   *
   * Returns null if the session doesn't exist or has expired.
   */
  async getSessionByCallId(callId: string): Promise<ActiveCallSession | null> {
    const key = this.getActiveCallKey(callId);
    const sessionJson = await this.redis.get(key);
    if (!sessionJson) return null;
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

    // Publish unified call.ended event with reason
    this.eventEmitter.emit('call.ended', {
      callId: activeCalls[0],
      initiatorId: userId1,
      receiverIds: [userId2],
      status: CallStatus.CANCELLED,
      reason: 'BLOCKED',
      durationSeconds: 0,
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
   * Get Redis key for user's current active call (1 call per user)
   */
  private getUserCallsKey(userId: string): string {
    return `call:user:${userId}:current`;
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
   * Business rule: 1 active call per user → uses String key (not Set)
   * Phase 4.4: Supports multiple receiver IDs for group calls
   */
  private async indexCallByUsers(
    callId: string,
    callerId: string,
    receiverIds: string | string[],
  ): Promise<void> {
    const receivers = Array.isArray(receiverIds) ? receiverIds : [receiverIds];
    const allUserIds = [callerId, ...receivers];

    await Promise.all(
      allUserIds.map((userId) =>
        this.redis.setex(this.getUserCallsKey(userId), this.ACTIVE_CALL_TTL, callId),
      ),
    );
  }

  /**
   * Get active call IDs for a user (returns 0 or 1 callId)
   */
  private async getActiveCallIdsByUser(userId: string): Promise<string[]> {
    const key = this.getUserCallsKey(userId);
    const callId = await this.redis.get(key);
    return callId ? [callId] : [];
  }

  /**
   * Remove active call from Redis by caller/callee pair
   */
  private async removeActiveCall(
    callerId: string,
    calleeId: string,
  ): Promise<void> {
    // With String-per-user keys, find the common callId
    const callerCallId = await this.redis.get(this.getUserCallsKey(callerId));
    const calleeCallId = await this.redis.get(this.getUserCallsKey(calleeId));

    // If both point to the same call, remove it
    if (callerCallId && callerCallId === calleeCallId) {
      await this.removeActiveCallById(callerCallId);
    } else {
      // Clean up any dangling references
      if (callerCallId) await this.removeActiveCallById(callerCallId);
      if (calleeCallId) await this.removeActiveCallById(calleeCallId);
    }
  }

  /**
   * Remove active call by ID
   * Phase 4.4: Cleans up all participant user keys (group call support)
   */
  private async removeActiveCallById(callId: string): Promise<void> {
    // Get session to find users
    const key = this.getActiveCallKey(callId);
    const sessionJson = await this.redis.get(key);

    if (sessionJson) {
      const session: ActiveCallSession = JSON.parse(
        sessionJson,
      ) as ActiveCallSession;

      // Collect all user IDs: caller + all participants
      const allUserIds = new Set<string>([session.callerId, session.calleeId]);
      if (session.participantIds) {
        for (const id of session.participantIds) {
          allUserIds.add(id);
        }
      }

      // Remove user index keys
      await Promise.all(
        [...allUserIds].map((userId) => this.redis.del(this.getUserCallsKey(userId))),
      );
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
    // With String-per-user keys, check if both users point to the same call
    const user1CallId = await this.redis.get(this.getUserCallsKey(user1Id));
    const user2CallId = await this.redis.get(this.getUserCallsKey(user2Id));

    // Find the shared call between these two users
    const callIds: string[] = [];
    if (user1CallId && user1CallId === user2CallId) {
      callIds.push(user1CallId);
    }

    this.logger.log(
      `Terminating ${callIds.length} call(s) between ${user1Id} and ${user2Id}`,
    );

    for (const callId of callIds) {
      await this.removeActiveCallById(callId);
      // Publish unified call.ended event
      this.eventEmitter.emit('call.ended', {
        callId,
        initiatorId: user1Id,
        receiverIds: [user2Id],
        status: CallStatus.CANCELLED,
        reason: 'BLOCKED',
        durationSeconds: 0,
      });
    }

    return callIds.length;
  }

  /**
   * Map CallHistory entity to response DTO
   */
  private mapToResponseDto(
    call: CallHistoryWithRelations,
    currentUserId: string,
    nameMap: Map<string, string>,
    viewedAt?: Date,
  ): CallHistoryResponseDto {
    const resolveName = (user: { id: string; displayName: string } | null) => {
      if (!user) return 'Unknown';
      if (user.id === currentUserId) return user.displayName;
      return nameMap.get(user.id) || user.displayName;
    };

    const participants = call.participants.map((p) => ({
      id: p.id,
      userId: p.userId,
      role: p.role,
      status: p.status,
      joinedAt: p.joinedAt ?? undefined,
      leftAt: p.leftAt ?? undefined,
      duration: p.duration ?? undefined,
      user: p.user
        ? {
          id: p.user.id,
          displayName: resolveName(p.user),
          avatarUrl: p.user.avatarUrl ?? null,
        }
        : undefined,
    }));

    return {
      id: call.id,
      initiatorId: call.initiatorId,
      participantCount: call.participantCount,
      status: call.status,
      callType: call.callType,
      provider: call.provider,
      duration: call.duration ?? 0,
      startedAt: call.startedAt,
      endedAt: call.endedAt ?? undefined,
      endReason: call.endReason ?? undefined,
      conversationId: call.conversationId ?? undefined,
      isViewed: viewedAt ? call.startedAt <= viewedAt : false,
      participants,
      initiator: call.initiator
        ? {
          id: call.initiator.id,
          displayName: resolveName(call.initiator),
          avatarUrl: call.initiator.avatarUrl ?? null,
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

    // Validate ownership — initiator OR participant
    const isInitiator = call.initiatorId === userId;
    const isParticipant = await this.prisma.callParticipant.count({
      where: { callId, userId },
    });
    if (!isInitiator && !isParticipant) {
      throw new ForbiddenException('Cannot delete call log');
    }

    // Soft delete (add deletedAt field to schema)
    await this.prisma.callHistory.update({
      where: { id: callId },
      data: { deletedAt: new Date() },
    });
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
   * Remove a single user's call index key.
   * Used in group calls when a participant rejects/leaves but call continues.
   * Does NOT end the call session — only frees the user so they can join other calls.
   */
  async removeUserFromCall(userId: string): Promise<void> {
    const key = this.getUserCallsKey(userId);
    await this.redis.del(key);
    this.logger.debug(`Removed user ${userId} from active call index`);
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
   * End call gracefully with reason.
   * Can be called with just a callId — reads session from Redis.
   *
   * Status logic:
   * - If session was ACTIVE and had meaningful duration → COMPLETED
   * - If session was RINGING (never answered) → MISSED / NO_ANSWER
   * - Otherwise → CANCELLED
   */
  async endCallGracefully(
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
    const startedAt = new Date(session.startedAt);
    const endedAt = new Date();
    const durationMs = endedAt.getTime() - startedAt.getTime();
    const duration = Math.min(
      Math.max(0, Math.round(durationMs / 1000)),
      this.MAX_CALL_DURATION,
    );

    // Determine correct status based on session state
    let status: CallStatus;
    if (session.status === 'ACTIVE' && duration > 0) {
      status = CallStatus.COMPLETED;
    } else if (session.status === 'RINGING') {
      // Ringing but never answered: NO_ANSWER if timeout, MISSED if disconnect
      status = reason === 'TIMEOUT' ? CallStatus.NO_ANSWER : CallStatus.MISSED;
    } else {
      status = CallStatus.CANCELLED;
    }

    // Log to DB
    try {
      const allReceiverIds = session.participantIds ?? [session.calleeId];
      const participantCount = 1 + allReceiverIds.length;
      const receiverStatus: CallParticipantStatus =
        status === CallStatus.MISSED || status === CallStatus.NO_ANSWER
          ? CallParticipantStatus.MISSED
          : status === CallStatus.CANCELLED ? CallParticipantStatus.LEFT
            : CallParticipantStatus.JOINED;

      await this.prisma.$transaction(async (tx) => {
        const created = await tx.callHistory.create({
          data: {
            initiatorId: session.callerId,
            participantCount,
            callType: session.callType ?? CallType.VOICE,
            provider: session.provider ?? CallProvider.WEBRTC_P2P,
            conversationId: session.conversationId,
            status,
            duration,
            endReason: reason,
            startedAt,
            endedAt,
          },
        });

        await tx.callParticipant.createMany({
          data: [
            {
              callId: created.id,
              userId: session.callerId,
              role: CallParticipantRole.HOST,
              status: status === CallStatus.CANCELLED ? CallParticipantStatus.LEFT : CallParticipantStatus.JOINED,
              joinedAt: startedAt,
              leftAt: endedAt,
              duration,
            },
            ...allReceiverIds.map((receiverId) => ({
              callId: created.id,
              userId: receiverId,
              role: CallParticipantRole.MEMBER,
              status: receiverStatus,
              joinedAt: receiverStatus === CallParticipantStatus.JOINED ? startedAt : null,
              leftAt: receiverStatus === CallParticipantStatus.JOINED ? endedAt : null,
              duration: receiverStatus === CallParticipantStatus.JOINED ? duration : null,
            })),
          ],
          skipDuplicates: true,
        });
      });

      this.logger.log(
        `Call ${callId} ended gracefully: ${reason} (${status}, ${duration}s)`,
      );
    } catch (error) {
      this.logger.error(`Failed to log call ${callId}:`, error);
    }

    // Invalidate missed calls cache for all receivers who missed
    if (
      status === CallStatus.MISSED ||
      status === CallStatus.NO_ANSWER
    ) {
      // Invalidate for all receivers in the session
      const allReceiverIds = session.participantIds ?? [session.calleeId];
      await Promise.all(
        allReceiverIds.map((id) => this.invalidateMissedCallsCache(id)),
      );
    }

    // Remove from Redis
    await this.removeActiveCallById(callId);
  }
}
