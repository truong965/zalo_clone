/**
 * Call Signaling Gateway
 *
 * Handles all WebRTC call signaling over Socket.IO.
 * This gateway is responsible for:
 * - Call initiation / acceptance / rejection / hangup
 * - SDP offer/answer relay
 * - ICE candidate relay (with server-side batching)
 * - TURN credential delivery via IceConfigService
 * - Call room management (Socket.IO rooms)
 * - Disconnect handling for active calls
 *
 * Architecture:
 * - Lives in CallModule (domain gateway, same pattern as MessageGateway)
 * - Uses SocketStateService for user presence
 * - Uses PrivacyService for block/privacy checks (read-only, no import coupling)
 * - Uses IceConfigService for STUN/TURN server lists + transport policy
 * - CallHistoryService owns active call state (Redis) and DB writes
 * - Call state transitions validated via call-state-machine
 *
 * WebRTC Signaling Flow (Phase 2):
 *   1. call:initiate → server creates session → call:incoming (+ iceServers)
 *   2. call:accept → server activates session → call:accepted (+ iceServers)
 *   3. Caller creates RTCPeerConnection → call:offer (SDP)
 *   4. Server relays call:offer to callee
 *   5. Callee sets remote desc → call:answer (SDP)
 *   6. Server relays call:answer to caller
 *   7. Both sides emit call:ice-candidate → server batches & relays
 *   8. P2P media established (browser ↔ browser, server sees no media)
 *   9. call:hangup → endCall() → call:ended → cleanup
 *
 * ICE Candidate Batching:
 *   Server buffers incoming candidates for 50ms before relaying.
 *   Reduces ~30 individual relay events to ~5-6 batched relays per peer.
 *
 * Socket Room:
 * - Each active call has a room: `call:{callId}`
 * - Both participants join on initiate/incoming
 * - Room is cleaned up on call end
 *
 * PRODUCTION NOTES:
 * ─────────────────
 * 1. ICE servers include STUN (Google) + TURN (coturn/managed)
 * 2. TURN credentials are short-lived HMAC-SHA1 (RFC 5766)
 * 3. iceTransportPolicy defaults to 'relay' (privacy-safe)
 *    → Can be 'all' when user opts into allowDirectConnection
 * 4. For managed TURN (Metered.ca/Twilio): update IceConfigService
 * 5. call:switch-to-daily handler added in Phase 4 ✅
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { Logger, Inject, UseGuards, ConflictException } from '@nestjs/common';
import { BaseGateway } from 'src/common/base/base.gateway';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { AuthenticatedSocket } from 'src/common/interfaces/socket-client.interface';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import { SocketStateService } from 'src/socket/services/socket-state.service';
import { WsJwtGuard } from 'src/common/guards/ws-jwt.guard';
import { CallHistoryService } from './call-history.service';
import { CallEndReason } from './events/call.events';
import {
  canTransition,
  sessionStatusToCallState,
} from './services/call-state-machine';
import {
  InitiateCallDto,
  CallIdDto,
  CallOfferDto,
  CallAnswerDto,
  CallIceCandidateDto,
  SwitchToDailyDto,
} from './dto/call-signaling.dto';
import { CallMediaStateDto } from './dto/call-media-state.dto';
import type { ActiveCallSession } from './dto/call-history.dto';
import { CallProvider, CallStatus, CallType } from '@prisma/client';
import { IceConfigService } from './services/ice-config.service';
import { DailyCoService } from './services/daily-co.service';
import { PrismaService } from 'src/database/prisma.service';
import { RedisService } from 'src/shared/redis/redis.service';
import { InteractionAuthorizationService } from '../authorization/services/interaction-authorization.service';
import { PermissionAction } from 'src/common/constants/permission-actions.constant';
import { InternalEventNames } from '@common/contracts/events';
import type {
  UnfriendedPayload,
  UserBlockedEventPayload,
  PrivacySettingsUpdatedPayload,
} from '@common/contracts/events';

/** 30s timeout for ringing before auto NO_ANSWER */
const RINGING_TIMEOUT_MS = 30_000;
/** 3s grace period on disconnect before ending call */
const DISCONNECT_GRACE_MS = 3_000;
/** 2s timeout: if callee doesn't ack ringing, send backup FCM push */
const RINGING_ACK_TIMEOUT_MS = 2_000;
/**
 * ICE candidate batching window (ms).
 * Gathers candidates arriving within this window into a single relay event.
 * Reduces ~30 individual relays to ~5-6 batched relays per peer.
 */
const ICE_BATCH_WINDOW_MS = 50;

type IceCandidateBatch = {
  candidates: unknown[];
  timer: NodeJS.Timeout;
};

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/socket.io',
})
@UseGuards(WsJwtGuard)
export class CallSignalingGateway extends BaseGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  protected readonly logger = new Logger(CallSignalingGateway.name);

  /**
   * Ringing timeouts: callId → NodeJS.Timeout
   * Auto-end calls that are never answered.
   * Used for 1-1 calls only; group calls use participantRingingTimeouts.
   */
  private readonly ringingTimeouts = new Map<string, NodeJS.Timeout>();

  /**
   * Per-participant ringing timeouts for group calls.
   * callId → Map<userId, NodeJS.Timeout>
   * Each receiver gets their own timeout. When all have responded
   * (accepted/rejected/timed-out), the call ends if no one accepted.
   */
  private readonly participantRingingTimeouts = new Map<
    string,
    Map<string, NodeJS.Timeout>
  >();

  /**
   * Ringing ack timeouts: callId → NodeJS.Timeout
   * If callee doesn't ack within 2s, send backup push notification.
   */
  private readonly ringingAckTimeouts = new Map<string, NodeJS.Timeout>();

  /**
   * Disconnect grace timers: callId → NodeJS.Timeout
   * Give disconnected users a few seconds to reconnect before ending the call.
   */
  private readonly disconnectTimers = new Map<string, NodeJS.Timeout>();

  /**
   * ICE candidate batch buffers: `${callId}:${userId}` → { candidates[], timer }
   * Server-side batching reduces relay frequency during ICE gathering.
   */
  private readonly iceBatchBuffers = new Map<string, IceCandidateBatch>();

  /**
   * Lone participant timers: callId → NodeJS.Timeout
   * For group calls only: if only 1 participant remains, end call after 3 minutes.
   */
  private readonly loneParticipantTimers = new Map<string, NodeJS.Timeout>();

  /** 3-minute lone participant timeout (requested by user) */
  private readonly LONE_PARTICIPANT_TIMEOUT_MS = 180_000;

  constructor(
    private readonly callHistoryService: CallHistoryService,
    private readonly socketState: SocketStateService,
    private readonly interactionAuth: InteractionAuthorizationService,
    private readonly iceConfigService: IceConfigService,
    private readonly dailyCoService: DailyCoService,
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
  ) {
    super();
  }

  afterInit() {
    this.logger.log('📞 Call Signaling Gateway initialized');
  }

  // ─────────────────────────────────────────────────────────
  // Socket lifecycle events (from SocketGateway EventEmitter)
  // ─────────────────────────────────────────────────────────

  /**
   * When a user disconnects, check if they have an active call.
   * If so, notify the other party and start a grace period.
   */
  @OnEvent(InternalEventNames.USER_SOCKET_DISCONNECTED)
  async handleUserDisconnected(payload: { userId: string; socketId: string }) {
    const { userId } = payload;

    // Check remaining sockets — user may still be connected on another device
    const remainingSockets = await this.socketState.getUserSockets(userId);
    if (remainingSockets.length > 0) return;

    // User is fully offline — check for active call
    const session = await this.callHistoryService.getActiveCall(userId);
    if (!session) return;

    // Fix M3: Device-aware grace period
    const graceMs = session.mobileDevices?.[userId] ? 30000 : 3000;

    const callId = session.callId;
    const callRoom = this.getCallRoom(callId);
    // If still RINGING (caller disconnected before callee accepted)
    if (session.status === 'RINGING') {
      // For 1-1 calls, caller disconnecting during RINGING ends the call
      if (!session.isGroupCall) {
        this.server.to(callRoom).emit(SocketEvents.CALL_CALLER_DISCONNECTED, { callId });

        const timer = setTimeout(() => {
          this.disconnectTimers.delete(callId);
          void this.endCallInternal(session, CallEndReason.NETWORK_DROP);
        }, graceMs);
        this.disconnectTimers.set(callId, timer);
      } else {
        // For group calls, initiator disconnecting before anyone joins ends it.
        // Other participants' disconnects are handled by ringing timeouts.
        if (session.initiatorId === userId) {
          this.server.to(callRoom).emit(SocketEvents.CALL_CALLER_DISCONNECTED, { callId });
          const timer = setTimeout(() => {
            this.disconnectTimers.delete(callId);
            void this.endCallInternal(session, CallEndReason.NETWORK_DROP);
          }, graceMs);
          this.disconnectTimers.set(callId, timer);
        }
      }
      return;
    }

    // If ACTIVE — check room size before ending group calls
    if (session.status === 'ACTIVE') {
      const currentState = sessionStatusToCallState(session.status);
      if (canTransition(currentState, 'DISCONNECT')) {
        // We only transition global state to RECONNECTING for 1-1 calls.
        // For group calls, the call remains ACTIVE as long as others are there.
        if (!session.isGroupCall) {
          await this.callHistoryService.updateCallStatus(callId, 'RECONNECTING');
        }
      }

      // Notify others in the room
      this.server.to(callRoom).emit(SocketEvents.CALL_CALLER_DISCONNECTED, { callId, userId });

      const timer = setTimeout(async () => {
        this.disconnectTimers.delete(callId);

        // Re-validate session
        const currentSession = await this.callHistoryService.getSessionByCallId(callId);
        if (!currentSession) return;

        if (currentSession.isGroupCall) {
          // Robust room size check using fetchSockets
          const sockets = await this.server.in(callRoom).fetchSockets();
          if (sockets.length === 0) {
            void this.endCallInternal(currentSession, CallEndReason.NETWORK_DROP);
            this.logger.log(`Call ${callId}: ended because all participants disconnected`);
          } else if (sockets.length === 1) {
            this.logger.log(`Call ${callId}: participant ${userId} dropped, only 1 remains. Starting lone timer.`);
            this.startLoneParticipantTimer(callId, currentSession);
          } else {
            this.logger.log(`Call ${callId}: participant ${userId} dropped, but ${sockets.length} others remain`);
          }
        } else {
          // 1-1 call: end after grace period if not reconnected
          void this.endCallInternal(currentSession, CallEndReason.NETWORK_DROP);
        }
      }, graceMs);
      this.disconnectTimers.set(callId, timer);
    }
  }

  /**
   * When a user reconnects, cancel any pending disconnect timer for their call.
   */
  @OnEvent(InternalEventNames.USER_SOCKET_CONNECTED)
  async handleUserConnected(payload: {
    userId: string;
    socketId?: string | null;
    socket?: AuthenticatedSocket;
  }) {
    const { userId, socket } = payload;

    if (!socket) {
      this.logger.debug(
        `Skipping call reconnection handling for ${userId} because no local socket was provided`,
      );
      return;
    }

    const session = await this.callHistoryService.getActiveCall(userId);
    if (!session) return;

    const callId = session.callId;
    const callRoom = this.getCallRoom(callId);

    // Cancel disconnect timer if reconnecting
    const timer = this.disconnectTimers.get(callId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(callId);
      this.logger.log(
        `Call ${callId}: user ${userId} reconnected, grace timer cancelled`,
      );
    }

    // Phase 6: Sync status on reconnection
    // If the call was ACTIVE or RECONNECTING, ensure it's ACTIVE to resume duration tracking.
    // CRITICAL: We MUST NOT move a RINGING call to ACTIVE here, as that prevents rejection.
    if (session.status === 'ACTIVE' || session.status === 'RECONNECTING') {
      await this.callHistoryService.updateCallStatus(callId, 'ACTIVE');
    }

    // Cancellation of lone participant timer on reconnection
    this.clearLoneParticipantTimer(callId);

    // M5: Only join the call room if this socket/device is the one active in the call
    // This prevents signaling conflicts on multi-device setups.
    const activeDeviceId = session.activeDevices?.[userId];
    const currentDeviceId = socket.deviceId || socket.id;
    if (activeDeviceId && activeDeviceId !== currentDeviceId) {
      this.logger.debug(
        `Call ${callId}: user ${userId} connected on secondary device ${currentDeviceId}, skipping room join (active: ${activeDeviceId})`,
      );
      return;
    }

    // Re-join the call room
    await socket.join(callRoom);

    // If callee reconnects while call is still RINGING, re-emit call:incoming
    // This handles the push notification flow: callee was offline → got push → opened app → socket connected
    // If callee reconnects while call is still RINGING, re-emit call:incoming
    // This handles the push notification flow: callee was offline → got push → opened app → socket connected
    const isParticipant = session.calleeId === userId || (session.participantIds?.includes(userId) ?? false);
    if (session.status === 'RINGING' && isParticipant) {
      this.logger.log(
        `Call ${callId}: participant ${userId} reconnected during RINGING, re-emitting call:incoming`,
      );

      const callerDisplayName = await this.getParticipantDisplayName(
        session.initiatorId,
      );
      const callerAvatarUrl = await this.lookupUserAvatar(session.initiatorId);

      if (session.isGroupCall) {
        // Resolve group info
        let conversationName: string | null = null;
        if (session.conversationId) {
          const conv = await this.prisma.conversation.findUnique({
            where: { id: session.conversationId },
            select: { name: true },
          });
          conversationName = conv?.name ?? null;
        }

        // Generate meeting token for this specific participant on-the-fly
        const dailyRoomUrl = this.dailyCoService.getRoomUrl(`call-${session.callId}`);
        const token = await this.dailyCoService.createMeetingToken(
          `call-${session.callId}`,
          userId,
          await this.getParticipantDisplayName(userId),
          false,
        );

        socket.emit(SocketEvents.CALL_INCOMING, {
          callId,
          callType: session.callType,
          conversationId: session.conversationId,
          callerInfo: {
            id: session.initiatorId,
            displayName: callerDisplayName,
            avatarUrl: callerAvatarUrl,
          },
          isGroupCall: true,
          participantCount: (session.participantIds?.length ?? 0) + 1,
          conversationName,
          dailyRoomUrl,
          dailyToken: token,
        });
      } else {
        const calleeIceConfig = await this.iceConfigService.getIceConfig(userId);
        socket.emit(SocketEvents.CALL_INCOMING, {
          callId,
          callType: session.callType,
          conversationId: session.conversationId,
          callerInfo: {
            id: session.initiatorId,
            displayName: callerDisplayName,
            avatarUrl: callerAvatarUrl,
          },
          iceServers: calleeIceConfig.iceServers,
          iceTransportPolicy: calleeIceConfig.iceTransportPolicy,
          isGroupCall: false,
        });
      }
      return;
    }
  }

  /**
   * Listen for unfriend events to end active 1v1 calls if privacy restricted.
   */
  @OnEvent(InternalEventNames.FRIENDSHIP_UNFRIENDED)
  async handleUnfriended(payload: UnfriendedPayload) {
    const { user1Id, user2Id } = payload;
    this.logger.debug(
      `Privacy Enforcement: handling unfriend between ${user1Id} and ${user2Id}`,
    );

    // Check both directions as either user's privacy settings might now restrict the call
    await this.enforcePrivacyForUser(user1Id);
    await this.enforcePrivacyForUser(user2Id);
  }

  /**
   * Listen for block events to end active 1v1 calls immediately.
   */
  @OnEvent(InternalEventNames.USER_BLOCKED)
  async handleUserBlocked(payload: UserBlockedEventPayload) {
    const { blockerId, blockedId } = payload;
    this.logger.debug(
      `Privacy Enforcement: handling block ${blockerId} -> ${blockedId}`,
    );

    // If there's an active call between them, it must end
    await this.enforcePrivacyForUser(blockedId);
    await this.enforcePrivacyForUser(blockerId);
  }

  /**
   * Listen for privacy setting updates.
   * If whoCanCallMe changed, re-evaluate active calls.
   */
  @OnEvent(InternalEventNames.PRIVACY_UPDATED)
  async handlePrivacyUpdated(payload: PrivacySettingsUpdatedPayload) {
    const { userId, settings } = payload;

    // Only reagere if whoCanCallMe was changed
    if ('whoCanCallMe' in settings) {
      this.logger.debug(
        `Privacy Enforcement: handling privacy update for user ${userId}`,
      );
      await this.enforcePrivacyForUser(userId);
    }
  }

  /**
   * Helper to find an active 1v1 call for a user and end it if no longer authorized.
   */
  private async enforcePrivacyForUser(userId: string) {
    const session = await this.callHistoryService.getActiveCall(userId);
    if (!session || session.isGroupCall) return;

    const callId = session.callId;
    const initiatorId = session.initiatorId;
    const calleeId = session.calleeId;

    // Identify the "other" participant
    const peerId = userId === initiatorId ? calleeId : initiatorId;

    // Re-verify call authorization (this checks both blocks and privacy settings)
    const result = await this.interactionAuth.canInteract(
      peerId,
      userId,
      PermissionAction.CALL,
    );

    if (!result.allowed) {
      this.logger.log(
        `Privacy Enforcement: Ending call ${callId} (${initiatorId} <-> ${calleeId}) ` +
          `because ${peerId} is no longer allowed to call ${userId}. Reason: ${result.reason}`,
      );

      // Notify the room before ending
      const callRoom = this.getCallRoom(callId);
      this.server.to(callRoom).emit(SocketEvents.ERROR, {
        code: 'PRIVACY_RESTRICTED',
        message: result.reason || 'Call restricted by privacy settings',
      });

      await this.endCallInternal(session, CallEndReason.PRIVACY_RESTRICTED);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Client → Server: Call Lifecycle
  // ─────────────────────────────────────────────────────────

  /**
   * Initiate a call to one or more users.
   *
   * 1-1 call (default): P2P (WebRTC) signaling with TURN relay.
   * Group call (receiverIds.length > 1): Immediately creates a Daily.co room
   * and sends room info + meeting tokens to all participants.
   *
   * Flow (1-1):
   * 1. Validate: not self-call, privacy allow, callee not busy
   * 2. Create active session (Redis)
   * 3. Join caller to call room
   * 4. Emit call:incoming to callee
   * 5. Start ringing timeout (30s)
   *
   * Flow (Group):
   * 1. Validate: Daily.co available, privacy for each receiver
   * 2. Create Daily.co room
   * 3. Create active session (Redis) with participantIds
   * 4. Generate meeting tokens for all participants
   * 5. Join caller to call room
   * 6. Emit call:incoming to all receivers with Daily.co room info
   * 7. Start ringing timeout (30s)
   */
  @SubscribeMessage(SocketEvents.CALL_INITIATE)
  async handleInitiateCall(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: InitiateCallDto,
  ) {
    const initiatorId = client.userId;
    if (!initiatorId) return this.emitError(client, 'Unauthenticated');

    const { calleeId, callType, conversationId, receiverIds } = dto;

    // Build initial receiver list
    let allReceiverIds = [
      ...new Set([calleeId, ...(receiverIds ?? [])]),
    ].filter((id) => id !== initiatorId);

    if (allReceiverIds.length === 0 && !conversationId) {
      return this.emitError(client, 'Cannot call yourself');
    }

    let isGroupCall = allReceiverIds.length > 1;
    let conversationName: string | null = null;

    // Phase 4.5: Robust group call detection via conversationId
    let groupLockKey: string | null = null;
    if (conversationId) {
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { type: true, name: true },
      });

      if (conversation?.type === 'GROUP') {
        isGroupCall = true;
        conversationName = conversation.name;

        // --- 🔒 RE-JOIN: PREVENT DOUBLE CALL RACE CONDITION ---
        const existingCallId = await this.callHistoryService.getActiveCallIdByConversation(conversationId);
        if (existingCallId) {
          return this.emitError(client, 'A call is already in progress for this group. Please join instead.');
        }

        groupLockKey = `lock:call_init:${conversationId}`;
        const locked = await this.redisService.getClient().set(groupLockKey, '1', 'EX', 5, 'NX');
        if (!locked) {
          return this.emitError(client, 'A call is currently being initiated for this group. Please wait and join.');
        }
        // ------------------------------------------------------

        // If client only sent groupId as calleeId, fetch all members
        if (allReceiverIds.length <= 1) {
          const members = await this.prisma.conversationMember.findMany({
            where: {
              conversationId,
              status: 'ACTIVE',
              userId: { not: initiatorId },
            },
            select: { userId: true },
          });
          allReceiverIds = members.map((m) => m.userId);
        }
      }
    }

    try {
      if (allReceiverIds.length === 0) {
        return this.emitError(client, 'No receivers found for this call');
      }

      // Group calls require Daily.co
      if (isGroupCall && !this.dailyCoService.available) {
        return this.emitError(
          client,
          'Group calls require Daily.co configuration',
        );
      }

      // Privacy & block check
      const privacyResult = await this.validateCallPrivacy(
        initiatorId,
        allReceiverIds,
        isGroupCall,
        conversationId,
      );
      if (!privacyResult.allowed) {
        return this.emitError(client, privacyResult.reason!);
      }

      // Use names from privacyResult if available (for group calls, conversationName is already resolved)
      if (privacyResult.conversationName) {
        conversationName = privacyResult.conversationName;
      }

      // For group calls, use only receivers who aren't blocked
      const effectiveReceiverIds =
        isGroupCall && privacyResult.filteredReceiverIds
          ? privacyResult.filteredReceiverIds
          : allReceiverIds;

      // Start call session
      const session = await this.startCallSession(
        client,
        initiatorId,
        effectiveReceiverIds,
        callType,
        isGroupCall,
        conversationId,
      );
      if (!session) return;

      // Fix M5: Track the initiator's device as active
      await this.callHistoryService.updateActiveDevice(
        session.callId,
        initiatorId,
        client.deviceId || client.id,
        this.isMobileDevice(client),
      );

      // Use filtered receiver IDs from the session (busy users are excluded)
      const finalReceiverIds = session.participantIds ?? effectiveReceiverIds;

      const callId = session.callId;
      const callRoom = this.getCallRoom(callId);
      await client.join(callRoom);

      const callerInfo = client.user
        ? {
          id: initiatorId,
          displayName: client.user.displayName,
          avatarUrl: client.user.avatarUrl,
        }
        : { id: initiatorId, displayName: 'Unknown', avatarUrl: null };

      // Dispatch to group or 1-1 flow
      if (isGroupCall) {
        // Allocate Daily room for everyone theoretically possible, not just the active ringers
        const maxParticipants = effectiveReceiverIds.length + 1;
        const result = await this.initiateGroupCall(
          client,
          callId,
          callRoom,
          callType,
          conversationId,
          conversationName,
          callerInfo,
          finalReceiverIds,
          maxParticipants,
        );
        if (!result) return;
      } else {
        this.initiate1v1Call(
          callId,
          callRoom,
          callType,
          conversationId,
          callerInfo,
          calleeId,
        );
      }

      // Start ringing timeouts
      this.startRingingTimeouts(callId, finalReceiverIds, isGroupCall);

      this.logger.log(
        `Call ${callId}: ${initiatorId} → ${finalReceiverIds.join(',')}` +
        ` (${callType}${isGroupCall ? ', GROUP' : ''})`,
      );

      return { callId };
    } finally {
      if (groupLockKey) {
        await this.redisService.getClient().del(groupLockKey);
      }
    }
  }

  /**
   * Validate privacy/block settings for all receivers.
   */
  private async validateCallPrivacy(
    initiatorId: string,
    allReceiverIds: string[],
    isGroupCall: boolean,
    conversationId?: string,
  ): Promise<{
    allowed: boolean;
    reason?: string;
    conversationName: string | null;
    filteredReceiverIds?: string[];
  }> {
    let conversationName: string | null = null;

    if (isGroupCall) {
      if (conversationId && !conversationName) {
        const conv = await this.prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { type: true, name: true },
        });
        conversationName = conv?.name ?? null;
      }

      // Phase 4.5: Per user requirement, skip individual privacy checks for group calls
      // Everyone in the group is allowed to participate in group calls.
      return {
        allowed: true,
        conversationName,
        filteredReceiverIds: allReceiverIds,
      };
    }

    // 1-1 Call: Check privacy settings for the receiver
    const receiverId = allReceiverIds[0];
    const result = await this.interactionAuth.canInteract(
      initiatorId,
      receiverId,
      PermissionAction.CALL,
    );

    if (!result.allowed) {
      return {
        allowed: false,
        reason:
          result.reason ?? `Call not allowed by receiver's privacy settings`,
        conversationName,
      };
    }

    return { allowed: true, conversationName };
  }

  /**
   * Create a call session, handling busy/error states.
   */
  private async startCallSession(
    client: AuthenticatedSocket,
    initiatorId: string,
    allReceiverIds: string[],
    callType: CallType,
    isGroupCall: boolean,
    conversationId?: string,
  ): Promise<ActiveCallSession | null> {
    const additionalReceiverIds =
      allReceiverIds.length > 1 ? allReceiverIds.slice(1) : undefined;

    try {
      return await this.callHistoryService.startCall(
        initiatorId,
        allReceiverIds[0],
        callType,
        isGroupCall ? CallProvider.DAILY_CO : CallProvider.WEBRTC_P2P,
        conversationId,
        additionalReceiverIds,
      );
    } catch (error: unknown) {
      if (error instanceof ConflictException) {
        client.emit(SocketEvents.CALL_BUSY, { calleeId: allReceiverIds[0] });
        return null;
      }
      this.emitError(
        client,
        this.getErrorMessage(error, 'Failed to start call'),
      );
      return null;
    }
  }

  /**
   * Handle group call initiation: create Daily.co room and notify receivers.
   */
  private async initiateGroupCall(
    client: AuthenticatedSocket,
    callId: string,
    callRoom: string,
    callType: CallType,
    conversationId: string | undefined,
    conversationName: string | null,
    callerInfo: { id: string; displayName: string; avatarUrl: string | null },
    finalReceiverIds: string[],
    maxParticipants: number,
  ): Promise<boolean> {
    try {
      const room = await this.dailyCoService.createRoom(callId, {
        maxParticipants,
        expireSeconds: 3600,
      });

      await this.callHistoryService.updateCallProvider(
        callId,
        CallProvider.DAILY_CO,
        room.name,
      );
      const roomUrl = this.dailyCoService.getRoomUrl(room.name);

      // Phase 4.6: Optimize notification latency
      // 1. First, check socket availability for all receivers in parallel
      const receiverSocketMap = new Map<string, string[]>();
      await Promise.all(
        finalReceiverIds.map(async (receiverId) => {
          const socketIds = await this.socketState.getUserSockets(receiverId);
          receiverSocketMap.set(receiverId, socketIds);

          // 2. Immediately trigger push for offline users (don't wait for tokens)
          if (socketIds.length === 0) {
            this.eventEmitter.emit(
              InternalEventNames.CALL_PUSH_NOTIFICATION_NEEDED,
              {
                callId,
                callType,
                callerId: callerInfo.id,
                callerName: callerInfo.displayName,
                callerAvatar: callerInfo.avatarUrl,
                calleeId: receiverId,
                conversationId,
                conversationName,
                reason: 'CALLEE_OFFLINE',
                isGroupCall: true,
              },
            );
          }
        }),
      );

      // 3. Generate meeting tokens (N API calls) only after pushes are already in flight
      const allParticipantIds = [callerInfo.id, ...finalReceiverIds];
      const tokenEntries = await Promise.all(
        allParticipantIds.map(async (userId) => {
          const displayName =
            userId === callerInfo.id
              ? callerInfo.displayName
              : await this.getParticipantDisplayName(userId);
          const token = await this.dailyCoService.createMeetingToken(
            room.name,
            userId,
            displayName,
            false,
          );
          return [userId, token] as const;
        }),
      );
      const tokens = tokenEntries.reduce<Record<string, string>>(
        (accumulator, [userId, token]) => {
          accumulator[userId] = token;
          return accumulator;
        },
        {},
      );

      // 4. Send socket events to online users
      for (const receiverId of finalReceiverIds) {
        const receiverSocketIds = receiverSocketMap.get(receiverId) || [];

        if (receiverSocketIds.length > 0) {
          for (const socketId of receiverSocketIds) {
            this.server.in(socketId).socketsJoin(callRoom);
          }
          this.server.to(receiverSocketIds).emit(SocketEvents.CALL_INCOMING, {
            callId,
            callType,
            conversationId,
            callerInfo,
            isGroupCall: true,
            participantCount: allParticipantIds.length,
            conversationName,
            dailyRoomUrl: roomUrl,
            dailyToken: tokens[receiverId],
          });
        }
      }

      client.emit(SocketEvents.CALL_DAILY_ROOM, { callId, roomUrl, tokens });

      // Broadcast GROUP_CALL_STARTED to the conversation room so other members see the banner
      if (conversationId) {
        this.server.to(`conversation:${conversationId}`).emit(SocketEvents.GROUP_CALL_STARTED, {
          callId,
          conversationId,
          callType,
          callerInfo,
          participantCount: allParticipantIds.length,
          startedAt: new Date().toISOString(),
          dailyRoomUrl: roomUrl, // Phase 4: L4
        });
      }

      return true;
    } catch (error: unknown) {
      this.logger.error(
        `Failed to create Daily.co room for group call ${callId}: ${this.getErrorMessage(error)}`,
      );
      await this.callHistoryService.cleanupUserActiveCalls(callerInfo.id);
      this.emitError(client, 'Failed to set up group call');
      return false;
    }
  }

  /**
   * Handle 1-1 P2P call initiation: notify callee or send push.
   */
  private initiate1v1Call(
    callId: string,
    callRoom: string,
    callType: CallType,
    conversationId: string | undefined,
    callerInfo: { id: string; displayName: string; avatarUrl: string | null },
    calleeId: string,
  ): void {
    void (async () => {
      const calleeSocketIds = await this.socketState.getUserSockets(calleeId);

      if (calleeSocketIds.length === 0) {
        this.logger.log(
          `Call ${callId}: callee ${calleeId} offline, sending push notification`,
        );
        this.eventEmitter.emit(
          InternalEventNames.CALL_PUSH_NOTIFICATION_NEEDED,
          {
            callId,
            callType,
            callerId: callerInfo.id,
            callerName: callerInfo.displayName,
            callerAvatar: callerInfo.avatarUrl,
            calleeId,
            conversationId,
            reason: 'CALLEE_OFFLINE',
          },
        );
        return;
      }

      for (const socketId of calleeSocketIds) {
        this.server.in(socketId).socketsJoin(callRoom);
      }

      const calleeIceConfig =
        await this.iceConfigService.getIceConfig(calleeId);

      this.server.to(calleeSocketIds).emit(SocketEvents.CALL_INCOMING, {
        callId,
        callType,
        conversationId,
        callerInfo,
        iceServers: calleeIceConfig.iceServers,
        iceTransportPolicy: calleeIceConfig.iceTransportPolicy,
        isGroupCall: false,
      });

      const ackTimer = setTimeout(() => {
        this.ringingAckTimeouts.delete(callId);
        this.logger.log(
          `Call ${callId}: no ringing ack after ${RINGING_ACK_TIMEOUT_MS}ms, sending backup push`,
        );
        this.eventEmitter.emit(
          InternalEventNames.CALL_PUSH_NOTIFICATION_NEEDED,
          {
            callId,
            callType,
            callerId: callerInfo.id,
            callerName: callerInfo.displayName,
            callerAvatar: callerInfo.avatarUrl,
            calleeId,
            conversationId,
            reason: 'NO_RINGING_ACK',
          },
        );
      }, RINGING_ACK_TIMEOUT_MS);
      this.ringingAckTimeouts.set(callId, ackTimer);
    })();
  }

  /**
   * Start ringing timeouts for group or 1-1 calls.
   */
  private startRingingTimeouts(
    callId: string,
    allReceiverIds: string[],
    isGroupCall: boolean,
  ): void {
    if (isGroupCall) {
      const perParticipantTimers = new Map<string, NodeJS.Timeout>();
      for (const receiverId of allReceiverIds) {
        const timer = setTimeout(() => {
          void this.handleParticipantRingingTimeout(callId, receiverId);
        }, RINGING_TIMEOUT_MS);
        perParticipantTimers.set(receiverId, timer);
      }
      this.participantRingingTimeouts.set(callId, perParticipantTimers);
    } else {
      // 1-1 calls: single global timeout (unchanged)
      const ringingTimer = setTimeout(() => {
        this.ringingTimeouts.delete(callId);
        void this.handleRingingTimeout(callId);
      }, RINGING_TIMEOUT_MS);
      this.ringingTimeouts.set(callId, ringingTimer);
    }
  }

  /**
   * Callee accepts the incoming call.
   *
   * For 1-1 P2P calls: Transition RINGING → ACTIVE, emit call:accepted with ICE config.
   * For group calls: Transition RINGING → ACTIVE, emit call:participant-joined to room.
   */
  @SubscribeMessage(SocketEvents.CALL_ACCEPT)
  async handleAcceptCall(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: CallIdDto,
  ) {
    const userId = client.userId;
    if (!userId) return this.emitError(client, 'Unauthenticated');

    const session = await this.getValidatedSession(dto.callId, userId);
    if (!session) {
      // Fix W2: Race condition where caller hangs up just as callee accepts.
      // Inform the callee that the call has already ended.
      client.emit(SocketEvents.CALL_ENDED, {
        callId: dto.callId,
        reason: 'caller_cancelled',
        status: CallStatus.CANCELLED,
      });
      return;
    }

    // Validate state transition: RINGING → ACTIVE
    const currentState = sessionStatusToCallState(session.status);
    if (!canTransition(currentState, 'ACCEPT')) {
      const isReceiver =
        session.calleeId === userId ||
        (session.participantIds?.includes(userId) ?? false);

      // Group calls (Daily.co): allow another device of the same user to
      // join even after the call has already moved to ACTIVE.
      if (session.status === 'ACTIVE' && isReceiver && session.isGroupCall) {
        // Fall through — let this device join the Daily.co room as well.
        this.logger.log(
          `Call ${dto.callId}: allowing group call re-join for ${userId} from another device`,
        );
      } else if (session.status === 'ACTIVE' && isReceiver) {
        // 1-1 call: only one device can participate
        client.emit(SocketEvents.CALL_ENDED, {
          callId: dto.callId,
          reason: 'answered_elsewhere',
          status: CallStatus.COMPLETED,
        });
        return { error: 'answered_elsewhere' };
      } else {
        return this.emitError(
          client,
          `Cannot accept call in ${session.status} state`,
        );
      }
    }

    // Must be a receiver (callee or group participant)
    const isReceiver =
      session.calleeId === userId ||
      (session.participantIds?.includes(userId) ?? false);
    if (!isReceiver) {
      return this.emitError(client, 'Only a receiver can accept');
    }

    // Clear ringing timeout for this participant.
    // Group calls: clear only THIS participant’s individual timer (Option B).
    // 1-1 calls: clear the single global timer.
    if (session.isGroupCall) {
      this.clearParticipantRingingTimeout(dto.callId, userId);
      
      // Phase 2: G8/G11 - Daily.co Pre-Join Capacity Check (max 10)
      const activeParticipantCount = Object.keys(session.activeDevices || {}).length;
      const MAX_DAILY_PARTICIPANTS = 10;
      if (activeParticipantCount >= MAX_DAILY_PARTICIPANTS) {
        return this.emitError(client, 'Group call is full (maximum 10 participants)');
      }
    } else {
      this.clearRingingTimeout(dto.callId);
    }

    // Transition to ACTIVE
    await this.callHistoryService.updateCallStatus(dto.callId, 'ACTIVE');

    // Fix M5: Track this device as the active one for this user
    await this.callHistoryService.updateActiveDevice(
      dto.callId,
      userId,
      client.deviceId || client.id,
      this.isMobileDevice(client),
    );

    const callRoom = this.getCallRoom(dto.callId);
    await client.join(callRoom);

    // Phase 3: G4/D1 - Record participant join
    await this.callHistoryService.recordParticipantJoin(dto.callId, userId);

    // Phase 3: G12/B6 - Cancel push notifications on other devices
    this.eventEmitter.emit(InternalEventNames.CALL_PUSH_NOTIFICATION_CANCELLED, {
      callId: dto.callId,
      userId,
    });

    // Notify other devices of the same user that the call was answered elsewhere.
    // IMPORTANT: Only for 1-1 calls. Group calls (Daily.co) allow multi-device
    // participation — each device joins the same Daily.co room independently.
    if (!session.isGroupCall) {
      const targetUserSockets = await this.socketState.getUserSockets(userId);
      const otherSocketIds = targetUserSockets.filter((id) => id !== client.id);
      if (otherSocketIds.length > 0) {
        this.server.to(otherSocketIds).emit(SocketEvents.CALL_ENDED, {
          callId: dto.callId,
          reason: 'answered_elsewhere',
          status: CallStatus.COMPLETED,
        });
      }
    }

    // Cancel any lone participant timer (if someone joins, they are no longer alone)
    this.clearLoneParticipantTimer(dto.callId);

    if (session.isGroupCall) {
      // Group call: emit participant-joined to the room
      const displayName = await this.getParticipantDisplayName(userId);
      this.server.to(callRoom).emit(SocketEvents.CALL_PARTICIPANT_JOINED, {
        callId: dto.callId,
        userId,
        displayName,
        mediaState: session.mediaState, // Phase 4: L5
      });

      this.logger.log(
        `Call ${dto.callId}: participant ${userId} joined (group)`,
      );
    } else {
      // 1-1 P2P call: emit call:accepted with ICE config
      const callerIceConfig = await this.iceConfigService.getIceConfig(
        session.initiatorId,
      );

      // Emit call:accepted only to the CALLER (not the whole room)
      // to prevent callee from triggering startCallAsCaller.
      const callerSocketIds = await this.socketState.getUserSockets(
        session.initiatorId,
      );
      if (callerSocketIds.length > 0) {
        // Phase 4: W4 - Delay relaying CALL_ACCEPTED by 400ms to allow callee to initialize RTCPeerConnection
        setTimeout(() => {
          this.server.to(callerSocketIds).emit(SocketEvents.CALL_ACCEPTED, {
            callId: dto.callId,
            iceServers: callerIceConfig.iceServers,
            iceTransportPolicy: callerIceConfig.iceTransportPolicy,
          });
        }, 400);
      }

      this.logger.log(`Call ${dto.callId}: accepted by ${userId}`);
    }
  }

  /**
   * Callee rejects the incoming call.
   * For group calls: participant leaves but call continues for others.
   */
  @SubscribeMessage(SocketEvents.CALL_REJECT)
  async handleRejectCall(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: CallIdDto,
  ) {
    const userId = client.userId;
    if (!userId) return this.emitError(client, 'Unauthenticated');

    const session = await this.getValidatedSession(dto.callId, userId);
    if (!session)
      return this.emitError(client, 'Call not found or not authorized');

    const currentState = sessionStatusToCallState(session.status);
    if (!canTransition(currentState, 'REJECT')) {
      return this.emitError(
        client,
        `Cannot reject call in ${session.status} state`,
      );
    }

    // Must be a receiver
    const isReceiver =
      session.calleeId === userId ||
      (session.participantIds?.includes(userId) ?? false);
    if (!isReceiver) {
      return this.emitError(client, 'Only a receiver can reject');
    }

    // Phase 3: G12/B6 - Cancel push notifications
    this.eventEmitter.emit(InternalEventNames.CALL_PUSH_NOTIFICATION_CANCELLED, {
      callId: dto.callId,
      userId,
    });

    if (session.isGroupCall) {
      // Group call: this participant leaves, call continues for others
      const callRoom = this.getCallRoom(dto.callId);
      await client.leave(callRoom);

      // Clear this participant's individual ringing timer
      this.clearParticipantRingingTimeout(dto.callId, userId);

      // Phase 3: G4/D1 - Record participant leave
      await this.callHistoryService.recordParticipantLeave(dto.callId, userId);

      // Remove user from Redis index so they're no longer "in a call"
      await this.callHistoryService.removeUserFromCall(userId);

      // Notify room that participant left
      this.server.to(callRoom).emit(SocketEvents.CALL_PARTICIPANT_LEFT, {
        callId: dto.callId,
        userId,
      });

      // Check if all participants have rejected/timed out (no one accepted)
      await this.checkAllParticipantsResponded(dto.callId);

      this.logger.log(
        `Call ${dto.callId}: participant ${userId} rejected (group call continues)`,
      );

      // Edge Case: If the host had already left and this was the last person ringing,
      // the room is now empty. We must end the call if it hasn't been ended yet.
      // Robust room size check using fetchSockets
      const sockets = await this.server.in(callRoom).fetchSockets();
      const roomSize = sockets.length;

      if (roomSize === 0) {
        // Double check session still exists since checkAllParticipantsResponded might have ended it
        const currentSession = await this.callHistoryService.getSessionByCallId(dto.callId);
        if (currentSession) {
          this.clearRingingTimeout(dto.callId);
          await this.endCallInternal(currentSession, CallEndReason.REJECTED);
          this.logger.log(`Call ${dto.callId}: ended because last ringing participant rejected`);
        }
      } else if (roomSize === 1) {
        // Start lone participant timer if only 1 person left in group
        this.startLoneParticipantTimer(dto.callId, session);
      }
    } else {
      // 1-1: end the entire call
      this.clearRingingTimeout(dto.callId);

      // Notify caller explicitly (better real-time sync than just room broadcast)
      const callerSocketIds = await this.socketState.getUserSockets(
        session.initiatorId,
      );
      if (callerSocketIds.length > 0) {
        this.server.to(callerSocketIds).emit(SocketEvents.CALL_REJECTED, {
          callId: dto.callId,
          reason: CallEndReason.REJECTED,
          status: CallStatus.REJECTED,
        });
      }

      await this.endCallInternal(session, CallEndReason.REJECTED);
      this.logger.log(`Call ${dto.callId}: rejected by ${userId}`);
    }

    // Fix M1: Notify other sockets of the same user that the call was rejected elsewhere
    const otherSocketIds = (await this.socketState.getUserSockets(userId)).filter(
      (id) => id !== client.id,
    );
    if (otherSocketIds.length > 0) {
      this.server.to(otherSocketIds).emit(SocketEvents.CALL_ENDED, {
        callId: dto.callId,
        reason: 'rejected_elsewhere',
        status: CallStatus.REJECTED,
      });
    }
  }

  /**
   * Either party hangs up the call.
   *
   * Group calls:
   * - Host (caller) hangup → ends entire call
   * - Participant hangup → participant leaves, call continues
   */
  @SubscribeMessage(SocketEvents.CALL_HANGUP)
  async handleHangup(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: CallIdDto,
  ) {
    const userId = client.userId;
    if (!userId) return this.emitError(client, 'Unauthenticated');

    const session = await this.getValidatedSession(dto.callId, userId);
    if (!session)
      return this.emitError(client, 'Call not found or not authorized');

    const currentState = sessionStatusToCallState(session.status);
    const isHost = session.initiatorId === userId;

    // Caller hanging up during RINGING = CANCEL
    // This applies to both P2P and Group calls before anyone joins
    if (currentState === 'RINGING' && isHost) {
      this.clearRingingTimeout(dto.callId);
      await this.endCallInternal(session, CallEndReason.USER_HANGUP);
      this.logger.log(`Call ${dto.callId}: cancelled by caller ${userId}`);
      return;
    }

    // Group call: participant (or host in ACTIVE state) hangs up → just leave
    if (session.isGroupCall) {
      const callRoom = this.getCallRoom(dto.callId);
      await client.leave(callRoom);
      
      // Phase 3: G4/D1 - Record participant leave
      await this.callHistoryService.recordParticipantLeave(dto.callId, userId);
      
      await this.callHistoryService.removeUserFromCall(userId);

      this.server.to(callRoom).emit(SocketEvents.CALL_PARTICIPANT_LEFT, {
        callId: dto.callId,
        userId,
      });

      this.logger.log(`Call ${dto.callId}: participant ${userId} left (group)`);

      // If everyone has left the group call room (roomSize is 0), end the call officially
      // to save the CallHistory and delete the active session.
      // Robust room size check using fetchSockets
      const sockets = await this.server.in(callRoom).fetchSockets();
      const roomSize = sockets.length;

      if (roomSize === 0) {
        this.clearRingingTimeout(dto.callId);
        await this.endCallInternal(session, CallEndReason.USER_HANGUP);
        this.logger.log(`Call ${dto.callId}: ended because last participant left`);
      } else if (roomSize === 1) {
        // Start lone participant timer if only 1 person left in group
        this.startLoneParticipantTimer(dto.callId, session);
      }
      return;
    }

    if (!canTransition(currentState, 'HANGUP')) {
      return this.emitError(client, `Cannot hangup in ${session.status} state`);
    }

    this.clearRingingTimeout(dto.callId);
    await this.endCallInternal(session, CallEndReason.USER_HANGUP);

    this.logger.log(`Call ${dto.callId}: hung up by ${userId}`);
  }

  // ─────────────────────────────────────────────────────────
  // Client → Server: WebRTC Signaling Relay
  // ─────────────────────────────────────────────────────────

  /**
   * Client sends heartbeat to keep the call session alive (prevent 5-min TTL expire).
   * Crucial for Daily.co group calls without ICE restarts.
   */
  @SubscribeMessage(SocketEvents.CALL_HEARTBEAT)
  async handleCallHeartbeat(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: CallIdDto,
  ) {
    const userId = client.userId;
    if (!userId) return;

    const session = await this.getValidatedSession(dto.callId, userId);
    if (!session) return;

    await this.callHistoryService.heartbeat(dto.callId);
    this.logger.debug(`Call ${dto.callId}: heartbeat from ${userId}`);
  }

  /**
   * Relay SDP offer from caller to callee.
   */
  @SubscribeMessage(SocketEvents.CALL_OFFER)
  async handleOffer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: CallOfferDto,
  ) {
    const userId = client.userId;
    if (!userId) return;

    const session = await this.getValidatedSession(dto.callId, userId);
    if (!session) return;

    const callRoom = this.getCallRoom(dto.callId);
    // Relay to all in room except sender
    client.to(callRoom).emit(SocketEvents.CALL_OFFER, {
      callId: dto.callId,
      sdp: dto.sdp,
      fromUserId: userId,
    });
  }

  /**
   * Relay SDP answer from callee to caller.
   */
  @SubscribeMessage(SocketEvents.CALL_ANSWER)
  async handleAnswer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: CallAnswerDto,
  ) {
    const userId = client.userId;
    if (!userId) return;

    const session = await this.getValidatedSession(dto.callId, userId);
    if (!session) return;

    const callRoom = this.getCallRoom(dto.callId);
    client.to(callRoom).emit(SocketEvents.CALL_ANSWER, {
      callId: dto.callId,
      sdp: dto.sdp,
      fromUserId: userId,
    });
  }

  /**
   * Relay media state (camera on/off, mute on/off) between peers.
   * Solves cross-platform unreliability of WebRTC track mute/unmute events.
   */
  @SubscribeMessage(SocketEvents.CALL_MEDIA_STATE)
  async handleMediaState(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: CallMediaStateDto,
  ) {
    const userId = client.userId;
    if (!userId) return;

    const session = await this.getValidatedSession(dto.callId, userId);
    if (!session) return;

    const callRoom = this.getCallRoom(dto.callId);

    // Phase 4: L5 - Persist media state in session
    await this.callHistoryService.updateMediaState(dto.callId, userId, {
      audioEnabled: !dto.muted,
      videoEnabled: !dto.cameraOff,
    });

    client.to(callRoom).emit(SocketEvents.CALL_MEDIA_STATE, {
      callId: dto.callId,
      cameraOff: dto.cameraOff,
      muted: dto.muted,
      fromUserId: userId,
    });
  }

  /**
   * Relay ICE candidates between peers with server-side batching.
   *
   * Client sends candidates as they trickle in. Server buffers them
   * for ICE_BATCH_WINDOW_MS (50ms) then sends one batched relay event.
   * This reduces ~30 individual relay events to ~5-6 batched relays.
   *
   * Client can also pre-batch on its side — the payloads are additive.
   */
  @SubscribeMessage(SocketEvents.CALL_ICE_CANDIDATE)
  async handleIceCandidate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: CallIceCandidateDto,
  ) {
    const userId = client.userId;
    if (!userId) return;

    const session = await this.getValidatedSession(dto.callId, userId);
    if (!session) return;

    // Robust JSON parsing for candidates (handles single or array)
    let incomingCandidates: unknown[];
    try {
      const parsed: unknown = JSON.parse(dto.candidates);
      incomingCandidates = Array.isArray(parsed) ? parsed : [parsed];
    } catch (error: unknown) {
      this.logger.warn(
        `Failed to parse ICE candidates from ${userId}: ${this.getErrorMessage(error)}`,
      );
      return;
    }

    // Buffer candidates for server-side batching
    const batchKey = `${dto.callId}:${userId}`;
    const existing = this.iceBatchBuffers.get(batchKey);

    if (existing) {
      // Append to existing batch
      existing.candidates.push(...incomingCandidates);
    } else {
      // Start new batch with a flush timer
      const callRoom = this.getCallRoom(dto.callId);
      const buffer = {
        candidates: [...incomingCandidates],
        timer: setTimeout(() => {
          this.iceBatchBuffers.delete(batchKey);
          // Flush: serialize ALL buffered candidates into a single JSON array string
          client.to(callRoom).emit(SocketEvents.CALL_ICE_CANDIDATE, {
            callId: dto.callId,
            candidates: JSON.stringify(buffer.candidates),
            fromUserId: userId,
          });
        }, ICE_BATCH_WINDOW_MS),
      };
      this.iceBatchBuffers.set(batchKey, buffer);
    }
  }

  /**
   * Handle ICE restart request.
   *
   * When a peer's ICE connection drops (iceConnectionState === 'disconnected'),
   * they call pc.restartIce() and re-create an offer. This handler:
   * 1. Refreshes the session heartbeat (prevents timeout during restart)
   * 2. Generates fresh TURN credentials (old ones may have rotated)
   * 3. Relays the restart request to the other peer
   *
   * The requesting peer should follow up with a new call:offer containing
   * the renegotiated SDP.
   */
  @SubscribeMessage(SocketEvents.CALL_ICE_RESTART)
  async handleIceRestart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: CallIdDto,
  ) {
    const userId = client.userId;
    if (!userId) return;

    const session = await this.getValidatedSession(dto.callId, userId);
    if (!session) return;

    // Refresh heartbeat on ICE restart — keeps session alive during renegotiation
    await this.callHistoryService.heartbeat(dto.callId);

    // Generate fresh TURN credentials for the requesting peer
    const freshIceConfig = await this.iceConfigService.getIceConfig(userId);

    // Notify the requesting peer with fresh ICE servers
    client.emit(SocketEvents.CALL_ICE_RESTART, {
      callId: dto.callId,
      iceServers: freshIceConfig.iceServers,
      iceTransportPolicy: freshIceConfig.iceTransportPolicy,
    });

    // Notify the other peer that an ICE restart is happening with fresh credentials
    const callRoom = this.getCallRoom(dto.callId);
    
    // Phase 4: W5 - Provide fresh credentials to the other peer too
    const otherUserId = session.initiatorId === userId ? session.calleeId : session.initiatorId;
    const otherIceConfig = await this.iceConfigService.getIceConfig(otherUserId);

    client.to(callRoom).emit(SocketEvents.CALL_ICE_RESTART, {
      callId: dto.callId,
      fromUserId: userId,
      iceServers: otherIceConfig.iceServers,
      iceTransportPolicy: otherIceConfig.iceTransportPolicy,
    });

    this.logger.debug(`Call ${dto.callId}: ICE restart requested by ${userId}`);
  }

  /**
   * Callee acknowledges receipt of incoming call (ringing confirmation).
   */
  @SubscribeMessage(SocketEvents.CALL_RINGING_ACK)
  async handleRingingAck(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: CallIdDto,
  ) {
    const userId = client.userId;
    if (!userId) return;

    const session = await this.getValidatedSession(dto.callId, userId);
    if (!session) return;

    // Clear the 2s ack timer — callee confirmed ringing
    this.clearRingingAckTimeout(dto.callId);

    // Refresh heartbeat — callee is alive and received the notification
    await this.callHistoryService.heartbeat(dto.callId);

    this.logger.debug(`Call ${dto.callId}: ringing ack from ${userId}`);
  }

  // ─────────────────────────────────────────────────────────
  // Phase 4: Daily.co Fallback + Group Call Support
  // ─────────────────────────────────────────────────────────

  /**
   * Switch an active P2P call to Daily.co SFU.
   *
   * Triggered by either participant when ICE restart fails after timeout.
   * Flow:
   * 1. Verify sender is participant of the call
   * 2. Check Daily.co is configured
   * 3. Create Daily.co room + meeting tokens for both participants
   * 4. Update session provider to DAILY_CO
   * 5. Emit call:daily-room to both participants with room URL + tokens
   */
  @SubscribeMessage(SocketEvents.CALL_SWITCH_TO_DAILY)
  async handleSwitchToDaily(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() dto: SwitchToDailyDto,
  ) {
    const userId = client.userId;
    if (!userId) return this.emitError(client, 'Unauthenticated');

    if (!this.dailyCoService.available) {
      return this.emitError(client, 'Daily.co is not configured');
    }

    const session = await this.getValidatedSession(dto.callId, userId);
    if (!session)
      return this.emitError(client, 'Call not found or not authorized');

    // Only switch from an active/reconnecting P2P call
    if (session.provider === CallProvider.DAILY_CO) {
      return this.emitError(client, 'Call is already using Daily.co');
    }

    if (session.status !== 'ACTIVE' && session.status !== 'RECONNECTING') {
      return this.emitError(
        client,
        `Cannot switch to Daily.co in ${session.status} state`,
      );
    }

    try {
      // Create Daily.co room
      const allParticipantIds = session.participantIds
        ? [session.initiatorId, ...session.participantIds]
        : [session.initiatorId, session.calleeId];
      const room = await this.dailyCoService.createRoom(dto.callId, {
        maxParticipants: allParticipantIds.length,
        expireSeconds: 3600,
      });

      // Create meeting tokens for all participants
      const tokenEntries = await Promise.all(
        allParticipantIds.map(async (uid) => {
          const displayName = await this.getParticipantDisplayName(uid);
          const token = await this.dailyCoService.createMeetingToken(
            room.name,
            uid,
            displayName,
            uid === session.initiatorId, // caller is owner
          );
          return [uid, token] as const;
        }),
      );
      const tokens = tokenEntries.reduce<Record<string, string>>(
        (accumulator, [userId, token]) => {
          accumulator[userId] = token;
          return accumulator;
        },
        {},
      );

      // Update session: provider → DAILY_CO, store room name
      await this.callHistoryService.updateCallProvider(
        dto.callId,
        CallProvider.DAILY_CO,
        room.name,
      );

      // Emit room info to all participants
      const roomUrl = this.dailyCoService.getRoomUrl(room.name);
      const callRoom = this.getCallRoom(dto.callId);

      this.server.to(callRoom).emit(SocketEvents.CALL_DAILY_ROOM, {
        callId: dto.callId,
        roomUrl,
        tokens,
      });

      this.logger.log(
        `Call ${dto.callId}: switched to Daily.co (room: ${room.name})`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to switch call ${dto.callId} to Daily.co: ${this.getErrorMessage(error)}`,
      );
      return this.emitError(client, 'Failed to switch to Daily.co');
    }
  }

  // ─────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────

  /**
   * Validate that the call exists and the user is a participant.
   *
   * Strategy:
   * 1. Fast path: check user's active call (O(1) Redis GET)
   * 2. Fallback: lookup session by callId directly, then verify participation
   *    This handles the case where getActiveCall(userId) returns a different
   *    callId (race condition) or the user's key expired but session still exists.
   *
   * Phase 4.4: Also checks participantIds for group calls.
   */
  private async getValidatedSession(
    callId: string,
    userId: string,
  ): Promise<ActiveCallSession | null> {
    // Fast path: user's active call matches the requested callId
    const userSession = await this.callHistoryService.getActiveCall(userId);
    if (userSession && userSession.callId === callId) {
      return userSession;
    }

    // Fallback: lookup session directly by callId and verify user is a participant
    const session = await this.callHistoryService.getSessionByCallId(callId);
    if (!session) return null;

    // Check: caller, callee, or any group participant
    if (
      session.initiatorId === userId ||
      session.calleeId === userId ||
      (session.participantIds?.includes(userId) ?? false)
    ) {
      return session;
    }

    return null;
  }

  private getErrorMessage(
    error: unknown,
    fallback: string = 'Unknown error',
  ): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }

    return fallback;
  }

  /**
   * End a call and notify all participants via the call room.
   */
  private async endCallInternal(
    session: ActiveCallSession,
    reason: string,
  ): Promise<void> {
    const callId = session.callId;
    const callRoom = this.getCallRoom(callId);

    // Clean up Daily.co room if provider is DAILY_CO
    if (session.provider === CallProvider.DAILY_CO && session.dailyRoomName) {
      void this.dailyCoService
        .deleteRoom(session.dailyRoomName)
        .catch((error: unknown) => {
          this.logger.warn(
            `Failed to delete Daily.co room ${session.dailyRoomName}: ${this.getErrorMessage(error)}`,
          );
        });
    }

    const status = this.callHistoryService.resolveCallStatus(reason, session.status);

    // Calculate duration
    const startedAt = new Date(session.startedAt);
    const endedAt = new Date();
    const durationSeconds = Math.max(
      0,
      Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
    );

    // Emit call:ended to all participants in the room
    // Final broadcast to the room
    const emissionData = {
      callId,
      reason,
      duration: durationSeconds,
      status,
    };
    this.server.to(callRoom).emit(SocketEvents.CALL_ENDED, emissionData);

    // Reliability: For 1-1 calls, also notify all sockets of BOTH participants directly.
    // This handles cases where some sessions may not be in the room (tab refresh, multi-device).
    if (!session.isGroupCall) {
      const allUserIds = [session.initiatorId, session.calleeId];
      for (const uid of allUserIds) {
        const sids = await this.socketState.getUserSockets(uid);
        if (sids.length > 0) {
          this.server.to(sids).emit(SocketEvents.CALL_ENDED, emissionData);
        }
      }
    }

    this.server.in(callRoom).socketsLeave(callRoom);

    // Broadcast GROUP_CALL_ENDED to the conversation room so banners are cleared
    if (session.isGroupCall && session.conversationId) {
      this.server.to(`conversation:${session.conversationId}`).emit(SocketEvents.GROUP_CALL_ENDED, {
        callId,
        conversationId: session.conversationId,
        reason,
        duration: durationSeconds,
      });
    }

    // Phase 3: G12/B6 - Cancel all push notifications
    const activeReceiverIds = session.participantIds ?? [session.calleeId];
    for (const uid of activeReceiverIds) {
      this.eventEmitter.emit(InternalEventNames.CALL_PUSH_NOTIFICATION_CANCELLED, {
        callId: session.callId,
        userId: uid,
      });
    }

    // End call via service (writes to DB, emits domain event, cleans up Redis)
    try {
      await this.callHistoryService.endCall({
        callId,
        initiatorId: session.initiatorId,
        calleeId: session.calleeId,
        status,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        duration: durationSeconds,
        callType: session.callType,
        provider: session.provider,
        endReason: reason,
      });
    } catch (error) {
      this.logger.error(`Failed to end call ${callId} via service:`, error);
      const allUserIds = new Set<string>([session.initiatorId, session.calleeId]);
      if (session.participantIds) {
        for (const id of session.participantIds) allUserIds.add(id);
      }
      for (const uid of allUserIds) {
        await this.callHistoryService.cleanupUserActiveCalls(uid);
      }
    }

    // Clear timers
    this.clearRingingTimeout(callId);
    this.clearAllParticipantRingingTimeouts(callId);
    this.clearRingingAckTimeout(callId);
    this.clearDisconnectTimer(callId);
    this.clearLoneParticipantTimer(callId);
  }

  // ─────────────────────────────────────────────────────────
  // Re-join existing group call
  // ─────────────────────────────────────────────────────────

  /**
   * Handle joining an existing group call.
   * Verifies group membership, gets Daily.co token, and adds user to call room.
   */
  @SubscribeMessage(SocketEvents.CALL_JOIN_EXISTING)
  async handleJoinExistingCall(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { conversationId: string },
  ) {
    const userId = client.user?.id;
    if (!userId) return this.emitError(client, 'User not authenticated');

    const { conversationId } = data;
    if (!conversationId) return this.emitError(client, 'conversationId is required');

    // 1. Verify the user is a member of the conversation
    const membership = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId, status: 'ACTIVE' },
    });
    if (!membership) {
      return this.emitError(client, 'You are not a member of this group');
    }

    // 2. Check if there is an active call for this conversation
    const session = await this.callHistoryService.joinExistingGroupCall(userId, conversationId);
    if (!session) {
      const message = 'No active group call found for this conversation';
      this.emitError(client, message);
      return { error: message };
    }

    // 3. Create a new Daily.co meeting token for this user
    if (!session.dailyRoomName) {
      const message = 'Group call room not available';
      this.emitError(client, message);
      return { error: message };
    }

    // Phase 2: G8/G11 - Daily.co Pre-Join Capacity Check (max 10)
    const activeParticipantCount = Object.keys(session.activeDevices || {}).length;
    const MAX_DAILY_PARTICIPANTS = 10;
    if (activeParticipantCount >= MAX_DAILY_PARTICIPANTS) {
      const message = 'Group call is full (maximum 10 participants)';
      this.emitError(client, message);
      return { error: message };
    }

    const displayName = client.user?.displayName ?? 'Unknown';
    const token = await this.dailyCoService.createMeetingToken(
      session.dailyRoomName,
      userId,
      displayName,
      false, // not owner
    );

    const roomUrl = this.dailyCoService.getRoomUrl(session.dailyRoomName);

    // 4. Join the socket call room
    const callRoom = this.getCallRoom(session.callId);
    await client.join(callRoom);

    // Fix M5: Track this device as the active one for this user
    await this.callHistoryService.updateActiveDevice(
      session.callId,
      userId,
      client.deviceId || client.id,
      this.isMobileDevice(client),
    );

    // 4.1 Cancel any lone participant timer (roomSize is > 1 now)
    this.clearLoneParticipantTimer(session.callId);

    // Phase 3: G4/D1 - Record participant join
    await this.callHistoryService.recordParticipantJoin(session.callId, userId);

    // 5. Notify others in the call room that a new participant joined
    this.server.to(callRoom).emit(SocketEvents.CALL_PARTICIPANT_JOINED, {
      callId: session.callId,
      userId,
      displayName,
      mediaState: session.mediaState, // Phase 4: L5
    });

    // 6. Send the room URL and token back to the joining user
    client.emit(SocketEvents.CALL_DAILY_ROOM, {
      callId: session.callId,
      roomUrl,
      tokens: { [userId]: token },
    });

    this.logger.log(
      `Call ${session.callId}: user ${userId} re-joined group call via CALL_JOIN_EXISTING`,
    );

    return { callId: session.callId };
  }

  /**
   * Handle ringing timeout — callee didn't answer within 30s.
   * Now uses getSessionByCallId for direct lookup (no userId needed).
   */
  private async handleRingingTimeout(callId: string): Promise<void> {
    this.logger.log(
      `Call ${callId}: ringing timeout (${RINGING_TIMEOUT_MS / 1000}s)`,
    );

    // Direct session lookup — no userId needed
    const session = await this.callHistoryService.getSessionByCallId(callId);
    if (session) {
      // Use endCallInternal for consistent status mapping + cleanup
      await this.endCallInternal(session, CallEndReason.TIMEOUT);
    } else {
      // Session already expired/cleaned — just notify room
      try {
        await this.callHistoryService.endCallGracefully(callId, 'TIMEOUT');
      } catch (error) {
        this.logger.error(`Failed to end timed-out call ${callId}:`, error);
      }

      const callRoom = this.getCallRoom(callId);
      this.server.to(callRoom).emit(SocketEvents.CALL_ENDED, {
        callId,
        reason: CallEndReason.TIMEOUT,
        duration: 0,
        status: CallStatus.NO_ANSWER,
      });
      this.server.in(callRoom).socketsLeave(callRoom);
    }
  }

  /**
   * Get Socket.IO room name for a call.
   */
  private getCallRoom(callId: string): string {
    return `call:${callId}`;
  }

  /**
   * Resolve display name for a participant.
   * Looks up connected socket user context first, then falls back to PrismaService.
   */
  private async getParticipantDisplayName(userId: string): Promise<string> {
    const socketIds = await this.socketState.getUserSockets(userId);
    for (const sid of socketIds) {
      const sockets = await this.server.in(sid).fetchSockets();
      for (const s of sockets) {
        const authSocket = s as unknown as AuthenticatedSocket;
        if (authSocket.user?.displayName) {
          return authSocket.user.displayName;
        }
      }
    }
    // Phase 4: L1 - Database fallback for offline user name
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true },
      });
      if (user?.displayName) return user.displayName;
    } catch {
      // Ignore
    }
    return 'User';
  }

  /**
   * Look up a user's avatar URL from their connected sockets.
   */
  private async lookupUserAvatar(userId: string): Promise<string | null> {
    const socketIds = await this.socketState.getUserSockets(userId);
    for (const sid of socketIds) {
      const sockets = await this.server.in(sid).fetchSockets();
      for (const s of sockets) {
        const authSocket = s as unknown as AuthenticatedSocket;
        if (authSocket.user?.avatarUrl) {
          return authSocket.user.avatarUrl;
        }
      }
    }
    // Phase 4: L1 - Database fallback for offline user avatar
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { avatarUrl: true },
      });
      if (user?.avatarUrl) return user.avatarUrl;
    } catch {
      // Ignore
    }
    return null;
  }



  private clearRingingTimeout(callId: string): void {
    const timer = this.ringingTimeouts.get(callId);
    if (timer) {
      clearTimeout(timer);
      this.ringingTimeouts.delete(callId);
    }
  }

  // ── Per-participant ringing timeout helpers (Option B) ──────────────

  /**
   * Clear a single participant's ringing timeout.
   * Called when a participant accepts or explicitly rejects.
   */
  private clearParticipantRingingTimeout(callId: string, userId: string): void {
    const timers = this.participantRingingTimeouts.get(callId);
    if (!timers) return;
    const timer = timers.get(userId);
    if (timer) {
      clearTimeout(timer);
      timers.delete(userId);
    }
    // Clean up parent map when no more participant timers remain
    if (timers.size === 0) {
      this.participantRingingTimeouts.delete(callId);
    }
  }

  /**
   * Clear all participant ringing timeouts for a call (full cleanup).
   * Called from endCallInternal.
   */
  private clearAllParticipantRingingTimeouts(callId: string): void {
    const timers = this.participantRingingTimeouts.get(callId);
    if (!timers) return;
    for (const timer of timers.values()) {
      clearTimeout(timer);
    }
    this.participantRingingTimeouts.delete(callId);
  }

  /**
   * Handle an individual participant's ringing timeout.
   *
   * Marks this participant as MISSED, removes them from the call,
   * and checks if all receivers have now responded.
   */
  private async handleParticipantRingingTimeout(
    callId: string,
    userId: string,
  ): Promise<void> {
    this.logger.log(
      `Call ${callId}: participant ${userId} ringing timeout (${RINGING_TIMEOUT_MS / 1000}s)`,
    );

    // Remove from the per-participant map (timer already fired)
    const timers = this.participantRingingTimeouts.get(callId);
    if (timers) {
      timers.delete(userId);
      if (timers.size === 0) {
        this.participantRingingTimeouts.delete(callId);
      }
    }

    // Remove user from Redis active-call index
    await this.callHistoryService.removeUserFromCall(userId);

    // Notify the call room that this participant missed
    const callRoom = this.getCallRoom(callId);
    this.server.to(callRoom).emit(SocketEvents.CALL_PARTICIPANT_LEFT, {
      callId,
      userId,
      reason: 'TIMEOUT',
    });

    // Check if all receivers have responded (accepted/rejected/timed-out)
    await this.checkAllParticipantsResponded(callId);
  }

  /**
   * Check whether the group call should end because all receivers
   * have either rejected or timed out (nobody accepted).
   *
   * If the call is still in RINGING state and no per-participant timers
   * remain, that means nobody joined — end the call with NO_ANSWER.
   * If the call already transitioned to ACTIVE, the call stays alive
   * even if some participants haven't responded yet.
   */
  private async checkAllParticipantsResponded(callId: string): Promise<void> {
    const remainingTimers = this.participantRingingTimeouts.get(callId);
    // Some participants still have pending timers — not everyone responded yet
    if (remainingTimers && remainingTimers.size > 0) return;

    const session = await this.callHistoryService.getSessionByCallId(callId);
    if (!session) return; // Already cleaned up

    // If the call has already moved to ACTIVE (someone accepted), leave it running
    if (session.status === 'ACTIVE') return;

    // Still RINGING and all participants responded without anyone accepting → end call
    this.logger.log(
      `Call ${callId}: all group participants timed out / rejected — ending call`,
    );
    await this.endCallInternal(session, CallEndReason.TIMEOUT);
  }

  private clearRingingAckTimeout(callId: string): void {
    const timer = this.ringingAckTimeouts.get(callId);
    if (timer) {
      clearTimeout(timer);
      this.ringingAckTimeouts.delete(callId);
    }
  }

  private clearDisconnectTimer(callId: string): void {
    const timer = this.disconnectTimers.get(callId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(callId);
    }
  }

  /**
   * For group calls: start a timer to end the call if only 1 participant remains.
   */
  private startLoneParticipantTimer(callId: string, session: any): void {
    // Safety check - only for group calls
    if (!session.isGroupCall) return;

    // Reset existing timer if any
    this.clearLoneParticipantTimer(callId);

    const timer = setTimeout(async () => {
      this.loneParticipantTimers.delete(callId);

      const sockets = await this.server.in(this.getCallRoom(callId)).fetchSockets();
      if (sockets.length <= 1) {
        this.logger.log(`Call ${callId}: auto-ending because user remained alone for 180s`);

        // Fix G9: Re-fetch session to avoid using stale data from 180s ago
        const latestSession = await this.callHistoryService.getSessionByCallId(callId);
        if (!latestSession) {
          this.logger.log(`Call ${callId}: already ended, skipping auto-end`);
          return;
        }
        await this.endCallInternal(latestSession, CallEndReason.TIMEOUT);
      }
    }, this.LONE_PARTICIPANT_TIMEOUT_MS);

    this.loneParticipantTimers.set(callId, timer);
    this.logger.debug(`Call ${callId}: started 180s lone participant timer`);
  }

  private clearLoneParticipantTimer(callId: string): void {
    const timer = this.loneParticipantTimers.get(callId);
    if (timer) {
      clearTimeout(timer);
      this.loneParticipantTimers.delete(callId);
      this.logger.debug(`Call ${callId}: lone participant timer cancelled`);
    }
  }

  private emitError(client: AuthenticatedSocket, message: string) {
    client.emit(SocketEvents.ERROR, { code: 'CALL_ERROR', message });
  }

  /**
   * Helper to check if client is using a mobile device for longer M3 timeout
   */
  private isMobileDevice(client: AuthenticatedSocket): boolean {
    return !!(
      client.deviceId ||
      /mobile|android|iphone|ipad/i.test(client.handshake.headers['user-agent'] || '')
    );
  }
}
