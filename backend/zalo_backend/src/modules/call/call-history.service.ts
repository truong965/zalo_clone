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
import { RedisService } from 'src/shared/redis/redis.service';
import {
  CallStatus,
  CallType,
  CallProvider,
  CallParticipantRole,
  CallParticipantStatus,
  Prisma,
} from '@prisma/client';

import { v4 as uuidv4 } from 'uuid';
import { CursorPaginatedResult } from 'src/common/interfaces/paginated-result.interface';
import { SelfActionException } from 'src/common/errors';
import { DisplayNameResolver } from '@shared/services';
import { EventPublisher } from '@shared/events';
import {
  CallEndedEvent,
  CallEndReason,
  type CallEndReasonType,
} from './events/call.events';
import {
  ActiveCallSession,
  CallHistoryResponseDto,
  EndCallInput,
  GetCallHistoryQueryDto,
  MissedCallsCountDto,
} from './dto/call-history.dto';

type CallUserProfile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
};

// 1. Prisma payload for Call domain only (no cross-domain User relation includes)
const callHistoryWithParticipants =
  Prisma.validator<Prisma.CallHistoryDefaultArgs>()({
    include: {
      participants: {
        select: {
          id: true,
          userId: true,
          role: true,
          status: true,
          joinedAt: true,
          leftAt: true,
          duration: true,
        },
      },
    },
  });

// Đây là Type an toàn được Prisma tự động sinh ra
type CallHistoryWithParticipants = Prisma.CallHistoryGetPayload<
  typeof callHistoryWithParticipants
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
    private readonly eventPublisher: EventPublisher,
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
    const availableReceiverIds: string[] = [];
    for (const receiverId of uniqueReceiverIds) {
      const existingReceiverCall = await this.getActiveCall(receiverId);
      if (existingReceiverCall) {
        if (!isGroupCall) {
          throw new ConflictException(
            `User ${receiverId} is currently in another call`,
          );
        }
        this.logger.log(
          `Call: User ${receiverId} is busy, skipping for group call`,
        );
      } else {
        availableReceiverIds.push(receiverId);
      }
    }

    if (availableReceiverIds.length === 0 && !isGroupCall) {
      throw new ConflictException('Callee is currently in another call');
    }

    const firstCallee =
      availableReceiverIds.length > 0 ? availableReceiverIds[0] : calleeId;

    const callId = uuidv4();
    const session: ActiveCallSession = {
      callId,
      initiatorId: callerId,
      calleeId: firstCallee,
      callType,
      provider: isGroupCall ? CallProvider.DAILY_CO : provider,
      conversationId,
      startedAt: new Date(),
      status: 'RINGING',
      participantIds: availableReceiverIds,
      isGroupCall,
      accumulatedDurationS: 0,
      lastStatusChangedAt: new Date().toISOString(),
      participantTimeline: {
        [callerId]: [{ joinedAt: new Date().toISOString() }],
      },
    };

    // Store in Redis with TTL
    const key = this.getActiveCallKey(callId);
    await this.redis.setex(key, this.ACTIVE_CALL_TTL, JSON.stringify(session));

    // Index by user IDs: 1 active call per user (String, not Set)
    await this.indexCallByUsers(callId, callerId, availableReceiverIds);
    if (isGroupCall && conversationId) {
      await this.indexCallByConversation(callId, conversationId);
    }

    // Phase 2: R5 - Track all active sessions in a single set for easy auditing
    await this.redis.getClient().sadd('call:active_sessions', callId);

    this.logger.log(
      `Active call started: ${callId} (${callerId} → ${availableReceiverIds.join(',')}` +
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

    // D2: Accumulate duration if transitioning AWAY from ACTIVE
    const now = new Date();
    if (session.status === 'ACTIVE' && status !== 'ACTIVE') {
      const lastChanged = session.lastStatusChangedAt
        ? new Date(session.lastStatusChangedAt)
        : new Date(session.startedAt);
      const diffS = Math.max(0, (now.getTime() - lastChanged.getTime()) / 1000);
      session.accumulatedDurationS = (session.accumulatedDurationS || 0) + diffS;
    }

    // D2: Update lastStatusChangedAt if transitioning TO ACTIVE or status changed
    if (session.status !== status) {
      session.status = status;
      session.lastStatusChangedAt = now.toISOString();
    }

    // Refresh TTL
    await this.redis.setex(key, this.ACTIVE_CALL_TTL, JSON.stringify(session));

    // Phase 9: Also refresh conversation index TTL if this is a group call
    if (session.isGroupCall && session.conversationId) {
      await this.indexCallByConversation(session.callId, session.conversationId);
    }
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

      // Phase 9: Also refresh conversation index TTL for group calls
      const session: ActiveCallSession = JSON.parse(exists) as ActiveCallSession;
      if (session.isGroupCall && session.conversationId) {
        await this.indexCallByConversation(callId, session.conversationId);
      }
    }
  }

  /**
   * Phase 4.4: Join an existing active group call
   */
  async joinExistingGroupCall(
    userId: string,
    conversationId: string,
  ): Promise<ActiveCallSession | null> {
    const callId = await this.getActiveCallIdByConversation(conversationId);
    if (!callId) return null;

    const session = await this.getSessionByCallId(callId);
    if (!session || !session.isGroupCall || session.provider !== CallProvider.DAILY_CO) {
      return null;
    }

    if (session.status !== 'ACTIVE' && session.status !== 'RINGING' && session.status !== 'RECONNECTING') {
      return null;
    }

    // Add user to participantList if not already there
    if (!session.participantIds) session.participantIds = [];

    if (!session.participantIds.includes(userId)) {
      session.participantIds.push(userId);

      // Update session in redis
      const key = this.getActiveCallKey(callId);
      await this.redis.setex(key, this.ACTIVE_CALL_TTL, JSON.stringify(session));

      // Index this user to block them from creating other calls
      await this.redis.setex(this.getUserCallsKey(userId), this.ACTIVE_CALL_TTL, callId);
    }

    // Refresh conversation TTL since someone just joined
    await this.indexCallByConversation(callId, conversationId);

    return session;
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
    const { initiatorId, calleeId } = dto;

    // Validation
    if (initiatorId === calleeId) {
      throw new SelfActionException('Cannot log call to self');
    }

    // Get active session to determine call ID
    let activeSession: ActiveCallSession | null = null;
    if (dto.callId) {
      activeSession = await this.getSessionByCallId(dto.callId);
    }

    if (!activeSession) {
      activeSession = await this.getActiveCall(initiatorId);
      if (!activeSession) {
        activeSession = await this.getActiveCall(calleeId);
      }
    }

    if (!activeSession) {
      this.logger.warn(
        `No active session found for call: ${dto.callId ?? `${initiatorId} -> ${calleeId}`}`,
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
      return this.waitForCallEnd(callId, 3000, dto); // Wait max 3s
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
      
      // Phase 2: R3 - Publish success event to waiting requests
      await this.redis.getClient().publish(`call:end_notify:${callId}`, JSON.stringify(result));

      return result;
    } catch (error) {
      // Phase 2: R3 - Publish error event to waiting requests so they can retry
      await this.redis.getClient().publish(`call:end_notify:${callId}`, 'ERROR');
      throw error;
    } finally {
      // 🔓 RELEASE LOCK (verify ownership before deleting)
      const currentValue = await this.redis.get(lockKey);
      if (currentValue === lockValue) {
        await this.redis.del(lockKey);
      }
    }
  }

  /**
   * Phase 2: R3 - Wait for another request to finish processing the call via Redis Pub/Sub
   */
  private async waitForCallEnd(
    callId: string,
    maxWaitMs: number,
    dto: EndCallInput,
  ): Promise<CallHistoryResponseDto> {
    const resultKey = `call:result:${callId}`;
    
    // Check if result is already cached
    const cached = await this.redis.get(resultKey);
    if (cached) {
      this.logger.debug(`Retrieved cached result for call ${callId}`);
      return JSON.parse(cached);
    }

    // Wait via Pub/Sub
    return new Promise((resolve, reject) => {
      const subClient = this.redis.getClient().duplicate();
      const channel = `call:end_notify:${callId}`;
      
      const timeout = setTimeout(() => {
        subClient.quit();
        reject(new BadRequestException('Call processing timeout'));
      }, maxWaitMs);

      subClient.on('message', (ch, message) => {
        if (ch === channel) {
          clearTimeout(timeout);
          subClient.quit();
          if (message === 'ERROR') {
            this.logger.warn(`Call ${callId} primary processor failed, retrying...`);
            // The first request failed (e.g. Daily.co API error), so we retry execution
            resolve(this.endCall(dto));
          } else {
            resolve(JSON.parse(message));
          }
        }
      });
      
      subClient.subscribe(channel);
    });
  }

  /**
   * Process call end (inside critical section)
   */
  private async processCallEnd(
    activeSession: ActiveCallSession,
    dto: EndCallInput,
  ): Promise<CallHistoryResponseDto> {
    const { status } = dto;

    // D2: Calculate server-side duration using accumulated value
    const now = new Date();
    let totalS = activeSession.accumulatedDurationS || 0;

    // If still ACTIVE, add the final chunk of time
    if (activeSession.status === 'ACTIVE') {
      const lastChanged = activeSession.lastStatusChangedAt
        ? new Date(activeSession.lastStatusChangedAt)
        : new Date(activeSession.startedAt);
      totalS += Math.max(0, (now.getTime() - lastChanged.getTime()) / 1000);
    }

    const finalDuration = Math.min(
      Math.max(0, Math.round(totalS)),
      this.MAX_CALL_DURATION,
    );
    const startedAt = new Date(activeSession.startedAt);
    const endedAt = now;
    const serverStart = startedAt;
    const serverEnd = endedAt;

    // All participants: initiator + receivers
    const allReceiverIds = activeSession.participantIds ?? [
      activeSession.calleeId,
    ];
    const participantCount = 1 + allReceiverIds.length; // initiator + all receivers

    // Determine participant statuses
    const receiverParticipantStatus =
      this.resolveReceiverParticipantStatus(status);

    const getTimelineStats = (uid: string, fallbackStatus: CallParticipantStatus) => {
      const timeline = activeSession.participantTimeline?.[uid] || [];
      if (timeline.length === 0) {
        return {
          status: fallbackStatus,
          joinedAt: fallbackStatus === CallParticipantStatus.JOINED ? serverStart : null,
          leftAt: fallbackStatus === CallParticipantStatus.JOINED ? serverEnd : null,
          duration: fallbackStatus === CallParticipantStatus.JOINED ? finalDuration : null,
        };
      }
      
      let totalS = 0;
      const firstJoin = timeline[0].joinedAt;
      const lastLeave = timeline[timeline.length - 1].leftAt || serverEnd.toISOString();
      
      for (const entry of timeline) {
        if (entry.durationS !== undefined) {
          totalS += entry.durationS;
        } else {
          // Open segment
          const joinT = new Date(entry.joinedAt).getTime();
          const leaveT = serverEnd.getTime();
          totalS += Math.max(0, Math.round((leaveT - joinT) / 1000));
        }
      }
      return {
        status: CallParticipantStatus.JOINED,
        joinedAt: new Date(firstJoin),
        leftAt: new Date(lastLeave),
        duration: Math.min(Math.max(0, totalS), this.MAX_CALL_DURATION),
      };
    };

    const initiatorStats = getTimelineStats(activeSession.initiatorId, 
      status === CallStatus.CANCELLED ? CallParticipantStatus.LEFT : CallParticipantStatus.JOINED);

    // Save to database atomically
    const callHistory = await this.prisma.$transaction(async (tx) => {
      const created = await tx.callHistory.create({
        data: {
          id: activeSession.callId,
          initiatorId: activeSession.initiatorId,
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
            userId: activeSession.initiatorId,
            role: CallParticipantRole.HOST,
            status: initiatorStats.status,
            joinedAt: initiatorStats.joinedAt,
            leftAt: initiatorStats.leftAt,
            duration: initiatorStats.duration,
          },
          ...allReceiverIds.map((receiverId) => {
            const stats = getTimelineStats(receiverId, receiverParticipantStatus);
            return {
              callId: created.id,
              userId: receiverId,
              role: CallParticipantRole.MEMBER,
              status: stats.status,
              joinedAt: stats.joinedAt,
              leftAt: stats.leftAt,
              duration: stats.duration,
            };
          }),
        ],
        skipDuplicates: true,
      });

      return tx.callHistory.findUniqueOrThrow({
        where: { id: created.id },
        ...callHistoryWithParticipants,
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

    // Publish unified event (persisted to domain_events for audit trail)
    await this.eventPublisher.publish(
      new CallEndedEvent(
        callHistory.id,
        activeSession.callType,
        activeSession.initiatorId,
        activeSession.participantIds ?? [activeSession.calleeId],
        activeSession.conversationId,
        status,
        (dto.endReason as CallEndReasonType) ?? CallEndReason.USER_HANGUP,
        activeSession.provider,
        finalDuration,
      ),
    );

    this.logger.log(
      `Call logged: ${callHistory.id} (${status}, ${finalDuration}s)`,
    );

    const userProfileMap = await this.getUserProfilesMap([
      callHistory.initiatorId,
      ...callHistory.participants.map((participant) => participant.userId),
    ]);
    return this.mapToResponseDto(callHistory, '', new Map(), userProfileMap);
  }

  /**
   * Handle orphaned calls (no active session)
   */
  private async endCallWithoutSession(
    dto: EndCallInput,
  ): Promise<CallHistoryResponseDto> {
    const { initiatorId, calleeId, status, startedAt } = dto;

    const clientStart = new Date(startedAt);
    const now = new Date();
    // Hard cap: don't trust client startedAt — limit to MAX_CALL_DURATION
    const rawDuration = Math.max(
      0,
      Math.round((now.getTime() - clientStart.getTime()) / 1000),
    );
    const duration = Math.min(rawDuration, this.MAX_CALL_DURATION);

    const receiverStatus = this.resolveReceiverParticipantStatus(status);

    const callHistory = await this.prisma.$transaction(async (tx) => {
      const created = await tx.callHistory.create({
        data: {
          id: dto.callId || undefined,
          initiatorId: initiatorId,
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
          userId: initiatorId,
          role: CallParticipantRole.HOST,
          status:
            status === CallStatus.CANCELLED
              ? CallParticipantStatus.LEFT
              : CallParticipantStatus.JOINED,
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
          joinedAt:
            receiverStatus === CallParticipantStatus.JOINED
              ? clientStart
              : null,
          leftAt: receiverStatus === CallParticipantStatus.JOINED ? now : null,
          duration:
            receiverStatus === CallParticipantStatus.JOINED ? duration : null,
        });
      }
      await tx.callParticipant.createMany({
        data: participantData,
        skipDuplicates: true,
      });

      return tx.callHistory.findUniqueOrThrow({
        where: { id: created.id },
        ...callHistoryWithParticipants,
      });
    });

    if (status === CallStatus.MISSED || status === CallStatus.NO_ANSWER) {
      if (calleeId) await this.invalidateMissedCallsCache(calleeId);
    }

    this.logger.warn(`Call logged without active session: ${callHistory.id}`);

    const userProfileMap = await this.getUserProfilesMap([
      callHistory.initiatorId,
      ...callHistory.participants.map((participant) => participant.userId),
    ]);
    return this.mapToResponseDto(callHistory, '', new Map(), userProfileMap);
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
    const { cursor, limit = 20, status, includeTotal } = query;

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
      skip: cursor ? 1 : 0, // Bỏ qua item làm cursor
      orderBy: { startedAt: 'desc' }, // Mới nhất lên đầu
      ...callHistoryWithParticipants,
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
    const userProfileMap = await this.getUserProfilesMap([
      ...calls.map((call) => call.initiatorId),
      ...calls.flatMap((call) =>
        call.participants.map((participant) => participant.userId),
      ),
    ]);

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
      this.mapToResponseDto(call, userId, nameMap, userProfileMap, viewedAt),
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
      ...callHistoryWithParticipants,
    });
    // Resolve display names for initiators
    const otherUserIds = [...new Set(calls.map((call) => call.initiatorId))];
    const nameMap = await this.displayNameResolver.batchResolve(
      userId,
      otherUserIds,
    );
    const userProfileMap = await this.getUserProfilesMap([
      ...calls.map((call) => call.initiatorId),
      ...calls.flatMap((call) =>
        call.participants.map((participant) => participant.userId),
      ),
    ]);

    return calls.map((call) =>
      this.mapToResponseDto(call, userId, nameMap, userProfileMap, viewedAt),
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

    // Publish unified call.ended event with reason (persisted for audit trail)
    await this.eventPublisher.publish(
      new CallEndedEvent(
        activeCalls[0],
        undefined,
        userId1,
        [userId2],
        undefined,
        CallStatus.CANCELLED,
        CallEndReason.BLOCKED,
        undefined,
        0,
      ),
    );

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
   * Get Redis key for a conversation's active call
   */
  private getActiveConversationCallKey(conversationId: string): string {
    return `call:conversation:${conversationId}:current`;
  }

  /**
   * Index call by conversation ID
   */
  private async indexCallByConversation(callId: string, conversationId: string): Promise<void> {
    const key = this.getActiveConversationCallKey(conversationId);
    await this.redis.setex(key, this.ACTIVE_CALL_TTL, callId);
  }

  /**
   * Get active call ID for a conversation
   */
  async getActiveCallIdByConversation(conversationId: string): Promise<string | null> {
    const key = this.getActiveConversationCallKey(conversationId);
    return this.redis.get(key);
  }

  /**
   * Remove active call mapping for a conversation
   */
  private async removeActiveConversationCall(conversationId: string): Promise<void> {
    const key = this.getActiveConversationCallKey(conversationId);
    await this.redis.del(key);
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
        this.redis.setex(
          this.getUserCallsKey(userId),
          this.ACTIVE_CALL_TTL,
          callId,
        ),
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
      const allUserIds = new Set<string>([session.initiatorId, session.calleeId]);
      if (session.participantIds) {
        for (const id of session.participantIds) {
          allUserIds.add(id);
        }
      }

      // Remove user index keys
      await Promise.all(
        [...allUserIds].map((userId) =>
          this.redis.del(this.getUserCallsKey(userId)),
        ),
      );

      if (session.conversationId && session.isGroupCall) {
        await this.removeActiveConversationCall(session.conversationId);
      }
    }

    // Remove session
    await this.redis.del(key);
    
    // Phase 2: R5 - Remove from active sessions set
    await this.redis.getClient().srem('call:active_sessions', callId);
  }

  /**
   * Phase 2: R5 - Get all active call IDs uniformly
   */
  async getAllActiveCallIds(): Promise<string[]> {
    return await this.redis.getClient().smembers('call:active_sessions');
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

    let terminatedCount = 0;
    for (const callId of callIds) {
      const session = await this.getSessionByCallId(callId);
      // Phase 3: B2-B4 - Do not terminate group calls mid-call due to blocking
      if (session && session.isGroupCall) {
        this.logger.log(`[CallBlock] Skipping termination for group call ${callId}`);
        continue;
      }

      // D6: Use endCallGracefully to ensure history is written to DB
      await this.endCallGracefully(callId, CallEndReason.BLOCKED);

      // Publish unified call.ended event (persisted for audit trail)
      await this.eventPublisher.publish(
        new CallEndedEvent(
          callId,
          undefined,
          user1Id,
          [user2Id],
          undefined,
          CallStatus.CANCELLED,
          CallEndReason.BLOCKED,
          undefined,
          0,
        ),
      );
      terminatedCount++;
    }

    return terminatedCount;
  }

  /**
   * Resolve receiver participant status from call status.
   * Centralizes the mapping to avoid nested ternary chains.
   */
  private resolveReceiverParticipantStatus(
    status: CallStatus,
  ): CallParticipantStatus {
    switch (status) {
      case CallStatus.MISSED:
      case CallStatus.NO_ANSWER:
        return CallParticipantStatus.MISSED;
      case CallStatus.REJECTED:
        return CallParticipantStatus.REJECTED;
      case CallStatus.CANCELLED:
        return CallParticipantStatus.LEFT;
      default:
        return CallParticipantStatus.JOINED;
    }
  }

  /**
   * Fetch user profiles by IDs for logical data composition.
   */
  private async getUserProfilesMap(
    userIds: string[],
  ): Promise<Map<string, CallUserProfile>> {
    const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueUserIds.length === 0) {
      return new Map();
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: uniqueUserIds } },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
      },
    });

    return new Map(users.map((user) => [user.id, user]));
  }

  /**
   * Map CallHistory entity to response DTO
   */
  private mapToResponseDto(
    call: CallHistoryWithParticipants,
    currentUserId: string,
    nameMap: Map<string, string>,
    userProfileMap: Map<string, CallUserProfile>,
    viewedAt?: Date,
  ): CallHistoryResponseDto {
    const resolveName = (targetUserId: string) => {
      const user = userProfileMap.get(targetUserId);
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
      user: userProfileMap.get(p.userId)
        ? {
          id: p.userId,
          displayName: resolveName(p.userId),
          avatarUrl: userProfileMap.get(p.userId)?.avatarUrl ?? null,
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
      isViewed: viewedAt ? call.startedAt < viewedAt : false,
      participants,
      initiator: userProfileMap.get(call.initiatorId)
        ? {
          id: call.initiatorId,
          displayName: resolveName(call.initiatorId),
          avatarUrl: userProfileMap.get(call.initiatorId)?.avatarUrl ?? null,
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

    // D5: Prevent deleting call log if the call is still active
    const activeCall = await this.getActiveCall(userId);
    if (activeCall && activeCall.callId === callId) {
      throw new ConflictException('Cannot delete a call log while the call is still active');
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
   * Remove a single user's call index key, and remove them from the session's participantIds.
   * Used in group calls when a participant rejects/leaves but call continues.
   * By removing them from participantIds, we ensure they aren't incorrectly mapped in endCall.
   */
  async removeUserFromCall(userId: string): Promise<void> {
    const callIds = await this.getActiveCallIdsByUser(userId);
    if (callIds.length > 0) {
      const callId = callIds[0];
      const session = await this.getSessionByCallId(callId);
      if (session && session.participantIds) {
        session.participantIds = session.participantIds.filter(
          (id: string) => id !== userId,
        );
        const sessionKey = this.getActiveCallKey(callId);
        // Fallback to getClient().ttl() if redis.ttl is missing on the Redis wrapper
        const ttl = await ('ttl' in this.redis
          ? (this.redis as any).ttl(sessionKey)
          : this.redis.getClient().ttl(sessionKey));
        if (ttl > 0) {
          await this.redis.getClient().setex(sessionKey, ttl, JSON.stringify(session));
        }
      }
    }

    const key = this.getUserCallsKey(userId);
    await this.redis.del(key);
    this.logger.debug(`Removed user ${userId} from active call index and session participantIds`);
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
   * M5: Update the active device for a specific user in a call.
   * This ensures only one device per user receives WebRTC signaling.
   */
  async updateActiveDevice(callId: string, userId: string, deviceId: string, isMobile: boolean = false): Promise<void> {
    const sessionKey = this.getActiveCallKey(callId);
    const sessionJson = await this.redis.get(sessionKey);
    if (!sessionJson) return;

    const session = JSON.parse(sessionJson) as ActiveCallSession;
    if (!session.activeDevices) {
      session.activeDevices = {};
    }
    session.activeDevices[userId] = deviceId;

    if (!session.mobileDevices) {
      session.mobileDevices = {};
    }
    session.mobileDevices[userId] = isMobile;

    const ttl = await ('ttl' in this.redis
      ? (this.redis as any).ttl(sessionKey)
      : this.redis.getClient().ttl(sessionKey));

    if (ttl > 0) {
      await this.redis.getClient().setex(sessionKey, ttl, JSON.stringify(session));
      
      // Phase 9: Refresh conversation index as well
      if (session.isGroupCall && session.conversationId) {
        await this.indexCallByConversation(session.callId, session.conversationId);
      }
    } else {
      // Small fallback if ttl is somehow invalid but key exists
      await this.redis.getClient().set(sessionKey, JSON.stringify(session), 'KEEPTTL');
    }
  }

  /**
   * Phase 3: G4/D1 - Record participant join event
   */
  async recordParticipantJoin(callId: string, userId: string): Promise<void> {
    const key = this.getActiveCallKey(callId);
    const sessionJson = await this.redis.get(key);
    if (!sessionJson) return;

    const session: ActiveCallSession = JSON.parse(sessionJson) as ActiveCallSession;
    if (!session.participantTimeline) session.participantTimeline = {};
    if (!session.participantTimeline[userId]) session.participantTimeline[userId] = [];

    // Only add a new join if the last one was closed
    const timeline = session.participantTimeline[userId];
    if (timeline.length === 0 || timeline[timeline.length - 1].leftAt) {
      timeline.push({ joinedAt: new Date().toISOString() });
      
      const ttl = await this.redis.getClient().ttl(key);
      if (ttl > 0) await this.redis.getClient().setex(key, ttl, JSON.stringify(session));
    }
  }

  /**
   * Phase 3: G4/D1 - Record participant leave event
   */
  async recordParticipantLeave(callId: string, userId: string): Promise<void> {
    const key = this.getActiveCallKey(callId);
    const sessionJson = await this.redis.get(key);
    if (!sessionJson) return;

    const session: ActiveCallSession = JSON.parse(sessionJson) as ActiveCallSession;
    if (!session.participantTimeline || !session.participantTimeline[userId]) return;

    const timeline = session.participantTimeline[userId];
    const lastEntry = timeline[timeline.length - 1];
    
    if (lastEntry && !lastEntry.leftAt) {
      const now = new Date();
      lastEntry.leftAt = now.toISOString();
      const joinTime = new Date(lastEntry.joinedAt);
      lastEntry.durationS = Math.max(0, Math.round((now.getTime() - joinTime.getTime()) / 1000));
      
      const ttl = await this.redis.getClient().ttl(key);
      if (ttl > 0) await this.redis.getClient().setex(key, ttl, JSON.stringify(session));
    }
  }

  /**
   * Phase 4: L5 - Update media state persistence
   */
  async updateMediaState(
    callId: string,
    userId: string,
    state: { audioEnabled?: boolean; videoEnabled?: boolean },
  ): Promise<void> {
    const key = this.getActiveCallKey(callId);
    const sessionJson = await this.redis.get(key);
    if (!sessionJson) return;

    const session: ActiveCallSession = JSON.parse(
      sessionJson,
    ) as ActiveCallSession;

    if (!session.mediaState) session.mediaState = {};
    session.mediaState[userId] = {
      ...session.mediaState[userId],
      ...state,
    };

    const ttl = await this.redis.getClient().ttl(key);
    if (ttl > 0) {
      await this.redis.getClient().setex(key, ttl, JSON.stringify(session));
    }
  }

  /**
   * Resolve CallStatus from end reason and session status.
   * Centralized logic used by both Gateway and Service.
   */
  resolveCallStatus(reason: string, sessionStatus: string): CallStatus {
    switch (reason) {
      case CallEndReason.REJECTED:
        return CallStatus.REJECTED;
      case CallEndReason.NO_ANSWER:
      case CallEndReason.TIMEOUT:
        return sessionStatus === 'RINGING'
          ? CallStatus.NO_ANSWER
          : CallStatus.CANCELLED;
      case CallEndReason.BLOCKED:
        return CallStatus.CANCELLED;
      case CallEndReason.NETWORK_DROP:
      case 'user_disconnected':
        return sessionStatus === 'ACTIVE'
          ? CallStatus.COMPLETED
          : CallStatus.MISSED;
      case CallEndReason.USER_HANGUP:
      default:
        return sessionStatus === 'ACTIVE'
          ? CallStatus.COMPLETED
          : CallStatus.CANCELLED;
    }
  }

  /**
   * End call gracefully with reason.
   * Can be called with just a callId — reads session from Redis.
   * Uses standardized resolveCallStatus for consistency.
   */
  async endCallGracefully(callId: string, reason: string): Promise<void> {
    // Get session
    const key = this.getActiveCallKey(callId);
    const sessionJson = await this.redis.get(key);

    if (!sessionJson) {
      return;
    }

    const session: ActiveCallSession = JSON.parse(
      sessionJson,
    ) as ActiveCallSession;

    // D2: Calculate duration from accumulated seconds
    const now = new Date();
    let totalS = session.accumulatedDurationS || 0;

    // If still ACTIVE, add the final chunk of time
    if (session.status === 'ACTIVE') {
      const lastChanged = session.lastStatusChangedAt
        ? new Date(session.lastStatusChangedAt)
        : new Date(session.startedAt);
      totalS += Math.max(0, (now.getTime() - lastChanged.getTime()) / 1000);
    }

    const startedAt = new Date(session.startedAt);
    const endedAt = now;

    const duration = Math.min(
      Math.max(0, Math.round(totalS)),
      this.MAX_CALL_DURATION,
    );

    // Determine correct status based on centralized mapping
    const status = this.resolveCallStatus(reason, session.status);

    // Log to DB
    try {
      const allReceiverIds = session.participantIds ?? [session.calleeId];
      const participantCount = 1 + allReceiverIds.length;
      const receiverStatus = this.resolveReceiverParticipantStatus(status);

      const getTimelineStats = (uid: string, fallbackStatus: CallParticipantStatus) => {
        const timeline = session.participantTimeline?.[uid] || [];
        if (timeline.length === 0) {
          return {
            status: fallbackStatus,
            joinedAt: fallbackStatus === CallParticipantStatus.JOINED ? startedAt : null,
            leftAt: fallbackStatus === CallParticipantStatus.JOINED ? endedAt : null,
            duration: fallbackStatus === CallParticipantStatus.JOINED ? duration : null,
          };
        }
        
        let totalS = 0;
        const firstJoin = timeline[0].joinedAt;
        const lastLeave = timeline[timeline.length - 1].leftAt || endedAt.toISOString();
        
        for (const entry of timeline) {
          if (entry.durationS !== undefined) {
            totalS += entry.durationS;
          } else {
            const joinT = new Date(entry.joinedAt).getTime();
            const leaveT = endedAt.getTime();
            totalS += Math.max(0, Math.round((leaveT - joinT) / 1000));
          }
        }
        return {
          status: CallParticipantStatus.JOINED,
          joinedAt: new Date(firstJoin),
          leftAt: new Date(lastLeave),
          duration: Math.min(Math.max(0, totalS), this.MAX_CALL_DURATION),
        };
      };

      const initiatorStats = getTimelineStats(session.initiatorId, 
        status === CallStatus.CANCELLED ? CallParticipantStatus.LEFT : CallParticipantStatus.JOINED);

      await this.prisma.$transaction(async (tx) => {
        const created = await tx.callHistory.create({
          data: {
            initiatorId: session.initiatorId,
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
              userId: session.initiatorId,
              role: CallParticipantRole.HOST,
              status: initiatorStats.status,
              joinedAt: initiatorStats.joinedAt,
              leftAt: initiatorStats.leftAt,
              duration: initiatorStats.duration,
            },
            ...allReceiverIds.map((receiverId) => {
              const stats = getTimelineStats(receiverId, receiverStatus);
              return {
                callId: created.id,
                userId: receiverId,
                role: CallParticipantRole.MEMBER,
                status: stats.status,
                joinedAt: stats.joinedAt,
                leftAt: stats.leftAt,
                duration: stats.duration,
              };
            }),
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
    if (status === CallStatus.MISSED || status === CallStatus.NO_ANSWER) {
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
