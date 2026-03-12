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
import { Logger, UseFilters, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import type { AuthenticatedSocket } from 'src/common/interfaces/socket-client.interface';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import { SocketStateService } from 'src/socket/services/socket-state.service';
import { WsThrottleGuard } from 'src/socket/guards/ws-throttle.guard';
import { WsJwtGuard } from 'src/socket/guards/ws-jwt.guard';
import { WsExceptionFilter } from 'src/socket/filters/ws-exception.filter';
import { CallHistoryService } from './call-history.service';
import { PrivacyService } from 'src/modules/privacy/services/privacy.service';
import { CallEndReason } from './events/call.events';
import {
      canTransition,
      sessionStatusToCallState,
      transition,
      type CallState,
} from './services/call-state-machine';
import {
      InitiateCallDto,
      CallIdDto,
      CallOfferDto,
      CallAnswerDto,
      CallIceCandidateDto,
      SwitchToDailyDto,
} from './dto/call-signaling.dto';
import type { ActiveCallSession } from './dto/call-history.dto';
import { CallProvider, CallStatus, ConversationType } from '@prisma/client';
import { IceConfigService } from './services/ice-config.service';
import { DailyCoService } from './services/daily-co.service';
import { PrismaService } from 'src/database/prisma.service';

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

@WebSocketGateway({
      cors: { origin: '*', credentials: true },
      namespace: '/socket.io',
})
@UseGuards(WsJwtGuard, WsThrottleGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
@UseFilters(WsExceptionFilter)
export class CallSignalingGateway implements OnGatewayInit {
      @WebSocketServer()
      server: Server;

      private readonly logger = new Logger(CallSignalingGateway.name);

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
      private readonly iceBatchBuffers = new Map<
            string,
            { candidates: string[]; timer: NodeJS.Timeout }
      >();

      constructor(
            private readonly callHistoryService: CallHistoryService,
            private readonly socketState: SocketStateService,
            private readonly privacyService: PrivacyService,
            private readonly iceConfigService: IceConfigService,
            private readonly dailyCoService: DailyCoService,
            private readonly eventEmitter: EventEmitter2,
            private readonly prisma: PrismaService,
      ) { }

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
      @OnEvent(SocketEvents.USER_SOCKET_DISCONNECTED)
      async handleUserDisconnected(payload: { userId: string; socketId: string }) {
            const { userId } = payload;

            // Check remaining sockets — user may still be connected on another device
            const remainingSockets = await this.socketState.getUserSockets(userId);
            if (remainingSockets.length > 0) return;

            // User is fully offline — check for active call
            const session = await this.callHistoryService.getActiveCall(userId);
            if (!session) return;

            const callId = session.callId;
            const callRoom = this.getCallRoom(callId);
            const isInitiator = session.callerId === userId;

            // If still RINGING (caller disconnected before callee accepted)
            if (session.status === 'RINGING') {
                  // Notify callee that caller disconnected
                  this.server.to(callRoom).emit(SocketEvents.CALL_CALLER_DISCONNECTED, { callId });

                  // End call after short grace period
                  const timer = setTimeout(() => {
                        this.disconnectTimers.delete(callId);
                        void this.endCallInternal(
                              session,
                              CallEndReason.NETWORK_DROP,
                        );
                  }, DISCONNECT_GRACE_MS);
                  this.disconnectTimers.set(callId, timer);
                  return;
            }

            // If ACTIVE — start reconnection grace period
            if (session.status === 'ACTIVE') {
                  const currentState = sessionStatusToCallState(session.status);
                  if (canTransition(currentState, 'DISCONNECT')) {
                        await this.callHistoryService.updateCallStatus(callId, 'RECONNECTING' as any);
                  }

                  this.server.to(callRoom).emit(SocketEvents.CALL_CALLER_DISCONNECTED, { callId });

                  const timer = setTimeout(() => {
                        this.disconnectTimers.delete(callId);
                        void this.endCallInternal(session, CallEndReason.NETWORK_DROP);
                  }, DISCONNECT_GRACE_MS);
                  this.disconnectTimers.set(callId, timer);
            }
      }

      /**
       * When a user reconnects, cancel any pending disconnect timer for their call.
       */
      @OnEvent(SocketEvents.USER_SOCKET_CONNECTED)
      async handleUserConnected(payload: {
            userId: string;
            socketId: string;
            socket: AuthenticatedSocket;
      }) {
            const { userId, socket } = payload;

            const session = await this.callHistoryService.getActiveCall(userId);
            if (!session) return;

            const callId = session.callId;
            const callRoom = this.getCallRoom(callId);

            // Cancel disconnect timer if reconnecting
            const timer = this.disconnectTimers.get(callId);
            if (timer) {
                  clearTimeout(timer);
                  this.disconnectTimers.delete(callId);
                  this.logger.log(`Call ${callId}: user ${userId} reconnected, grace timer cancelled`);
            }

            // Re-join the call room
            socket.join(callRoom);

            // If callee reconnects while call is still RINGING, re-emit call:incoming
            // This handles the push notification flow: callee was offline → got push → opened app → socket connected
            if (session.status === 'RINGING' && session.calleeId === userId) {
                  this.logger.log(`Call ${callId}: callee ${userId} reconnected during RINGING, re-emitting call:incoming`);

                  const callerDisplayName = await this.getParticipantDisplayName(session.callerId);
                  const calleeIceConfig = await this.iceConfigService.getIceConfig(userId);
                  const callerAvatarUrl = await this.lookupUserAvatar(session.callerId);

                  socket.emit(SocketEvents.CALL_INCOMING, {
                        callId,
                        callType: session.callType,
                        conversationId: session.conversationId,
                        callerInfo: {
                              id: session.callerId,
                              displayName: callerDisplayName,
                              avatarUrl: callerAvatarUrl,
                        },
                        iceServers: calleeIceConfig.iceServers,
                        iceTransportPolicy: calleeIceConfig.iceTransportPolicy,
                  });
                  return;
            }

            // If was RECONNECTING, move back to ACTIVE
            if (session.status === 'RECONNECTING') {
                  await this.callHistoryService.updateCallStatus(callId, 'ACTIVE');
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
            const callerId = client.userId;
            if (!callerId) return this.emitError(client, 'Unauthenticated');

            const { calleeId, callType, conversationId, receiverIds } = dto;

            // Build complete receiver list: merge calleeId + receiverIds, dedupe, exclude caller
            const allReceiverIds = [...new Set([calleeId, ...(receiverIds ?? [])])]
                  .filter((id) => id !== callerId);

            if (allReceiverIds.length === 0) {
                  return this.emitError(client, 'Cannot call yourself');
            }

            const isGroupCall = allReceiverIds.length > 1;

            // Group calls require Daily.co
            if (isGroupCall && !this.dailyCoService.available) {
                  return this.emitError(client, 'Group calls require Daily.co configuration');
            }

            // Privacy & block check
            const privacyResult = await this.validateCallPrivacy(callerId, allReceiverIds, isGroupCall, conversationId);
            if (!privacyResult.allowed) {
                  return this.emitError(client, privacyResult.reason!);
            }
            const conversationName = privacyResult.conversationName;

            // Start call session
            const session = await this.startCallSession(client, callerId, allReceiverIds, callType, isGroupCall, conversationId);
            if (!session) return;

            const callId = session.callId;
            const callRoom = this.getCallRoom(callId);
            client.join(callRoom);

            const callerInfo = client.user
                  ? { id: callerId, displayName: client.user.displayName, avatarUrl: client.user.avatarUrl }
                  : { id: callerId, displayName: 'Unknown', avatarUrl: null };

            // Dispatch to group or 1-1 flow
            if (isGroupCall) {
                  const result = await this.initiateGroupCall(client, callId, callRoom, callType, conversationId, conversationName, callerInfo, allReceiverIds);
                  if (!result) return;
            } else {
                  this.initiate1v1Call(callId, callRoom, callType, conversationId, callerInfo, calleeId);
            }

            // Start ringing timeouts
            this.startRingingTimeouts(callId, allReceiverIds, isGroupCall);

            this.logger.log(
                  `Call ${callId}: ${callerId} → ${allReceiverIds.join(',')}` +
                  ` (${callType}${isGroupCall ? ', GROUP' : ''})`,
            );

            return { callId };
      }

      /**
       * Validate privacy/block settings for all receivers.
       */
      private async validateCallPrivacy(
            callerId: string,
            allReceiverIds: string[],
            isGroupCall: boolean,
            conversationId?: string,
      ): Promise<{ allowed: boolean; reason?: string; conversationName: string | null }> {
            let conversationName: string | null = null;

            if (isGroupCall && conversationId) {
                  const conv = await this.prisma.conversation.findUnique({
                        where: { id: conversationId },
                        select: { type: true, name: true },
                  });
                  if (conv?.type === ConversationType.GROUP) {
                        return { allowed: true, conversationName: conv.name ?? null };
                  }
                  conversationName = conv?.name ?? null;
            }

            for (const receiverId of allReceiverIds) {
                  const canCall = await this.privacyService.canUserCallMe(callerId, receiverId);
                  if (!canCall) {
                        return {
                              allowed: false,
                              reason: `Call not allowed: user ${receiverId} has blocked or restricted calls`,
                              conversationName,
                        };
                  }
            }

            return { allowed: true, conversationName };
      }

      /**
       * Create a call session, handling busy/error states.
       */
      private async startCallSession(
            client: AuthenticatedSocket,
            callerId: string,
            allReceiverIds: string[],
            callType: any,
            isGroupCall: boolean,
            conversationId?: string,
      ): Promise<ActiveCallSession | null> {
            const additionalReceiverIds = allReceiverIds.length > 1
                  ? allReceiverIds.slice(1)
                  : undefined;

            try {
                  return await this.callHistoryService.startCall(
                        callerId,
                        allReceiverIds[0],
                        callType,
                        isGroupCall ? CallProvider.DAILY_CO : CallProvider.WEBRTC_P2P,
                        conversationId,
                        additionalReceiverIds,
                  );
            } catch (error: any) {
                  if (error.status === 409) {
                        client.emit(SocketEvents.CALL_BUSY, { calleeId: allReceiverIds[0] });
                        return null;
                  }
                  this.emitError(client, error.message ?? 'Failed to start call');
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
            callType: any,
            conversationId: string | undefined,
            conversationName: string | null,
            callerInfo: { id: string; displayName: string; avatarUrl: string | null },
            allReceiverIds: string[],
      ): Promise<boolean> {
            try {
                  const room = await this.dailyCoService.createRoom(callId, {
                        maxParticipants: allReceiverIds.length + 1,
                        expireSeconds: 3600,
                  });

                  await this.callHistoryService.updateCallProvider(callId, CallProvider.DAILY_CO, room.name);
                  const roomUrl = this.dailyCoService.getRoomUrl(room.name);

                  const allParticipantIds = [callerInfo.id, ...allReceiverIds];
                  const tokenEntries = await Promise.all(
                        allParticipantIds.map(async (userId) => {
                              const displayName = userId === callerInfo.id
                                    ? callerInfo.displayName
                                    : await this.getParticipantDisplayName(userId);
                              const token = await this.dailyCoService.createMeetingToken(
                                    room.name, userId, displayName, userId === callerInfo.id,
                              );
                              return [userId, token] as const;
                        }),
                  );
                  const tokens = Object.fromEntries(tokenEntries);

                  for (const receiverId of allReceiverIds) {
                        const receiverSocketIds = await this.socketState.getUserSockets(receiverId);

                        if (receiverSocketIds.length === 0) {
                              this.eventEmitter.emit(SocketEvents.CALL_PUSH_NOTIFICATION_NEEDED, {
                                    callId, callType, callerId: callerInfo.id,
                                    callerName: callerInfo.displayName, callerAvatar: callerInfo.avatarUrl,
                                    calleeId: receiverId, conversationId, conversationName,
                                    reason: 'CALLEE_OFFLINE', isGroupCall: true,
                              });
                        } else {
                              for (const socketId of receiverSocketIds) {
                                    this.server.in(socketId).socketsJoin(callRoom);
                              }
                              this.server.to(receiverSocketIds).emit(SocketEvents.CALL_INCOMING, {
                                    callId, callType, conversationId, callerInfo,
                                    isGroupCall: true, participantCount: allParticipantIds.length,
                                    conversationName, dailyRoomUrl: roomUrl, dailyToken: tokens[receiverId],
                              });
                        }
                  }

                  client.emit(SocketEvents.CALL_DAILY_ROOM, { callId, roomUrl, tokens });
                  return true;
            } catch (error: any) {
                  this.logger.error(`Failed to create Daily.co room for group call ${callId}: ${error.message}`);
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
            callType: any,
            conversationId: string | undefined,
            callerInfo: { id: string; displayName: string; avatarUrl: string | null },
            calleeId: string,
      ): void {
            void (async () => {
                  const calleeSocketIds = await this.socketState.getUserSockets(calleeId);

                  if (calleeSocketIds.length === 0) {
                        this.logger.log(`Call ${callId}: callee ${calleeId} offline, sending push notification`);
                        this.eventEmitter.emit(SocketEvents.CALL_PUSH_NOTIFICATION_NEEDED, {
                              callId, callType, callerId: callerInfo.id,
                              callerName: callerInfo.displayName, callerAvatar: callerInfo.avatarUrl,
                              calleeId, conversationId, reason: 'CALLEE_OFFLINE',
                        });
                        return;
                  }

                  for (const socketId of calleeSocketIds) {
                        this.server.in(socketId).socketsJoin(callRoom);
                  }

                  const calleeIceConfig = await this.iceConfigService.getIceConfig(calleeId);

                  this.server.to(calleeSocketIds).emit(SocketEvents.CALL_INCOMING, {
                        callId, callType, conversationId, callerInfo,
                        iceServers: calleeIceConfig.iceServers,
                        iceTransportPolicy: calleeIceConfig.iceTransportPolicy,
                        isGroupCall: false,
                  });

                  const ackTimer = setTimeout(() => {
                        this.ringingAckTimeouts.delete(callId);
                        this.logger.log(`Call ${callId}: no ringing ack after ${RINGING_ACK_TIMEOUT_MS}ms, sending backup push`);
                        this.eventEmitter.emit(SocketEvents.CALL_PUSH_NOTIFICATION_NEEDED, {
                              callId, callType, callerId: callerInfo.id,
                              callerName: callerInfo.displayName, callerAvatar: callerInfo.avatarUrl,
                              calleeId, conversationId, reason: 'NO_RINGING_ACK',
                        });
                  }, RINGING_ACK_TIMEOUT_MS);
                  this.ringingAckTimeouts.set(callId, ackTimer);
            })();
      }

      /**
       * Start ringing timeouts for group or 1-1 calls.
       */
      private startRingingTimeouts(callId: string, allReceiverIds: string[], isGroupCall: boolean): void {
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
            if (!session) return this.emitError(client, 'Call not found or not authorized');

            // Validate state transition: RINGING → ACTIVE
            const currentState = sessionStatusToCallState(session.status);
            if (!canTransition(currentState, 'ACCEPT')) {
                  return this.emitError(client, `Cannot accept call in ${session.status} state`);
            }

            // Must be a receiver (callee or group participant)
            const isReceiver = session.calleeId === userId ||
                  (session.participantIds?.includes(userId) ?? false);
            if (!isReceiver) {
                  return this.emitError(client, 'Only a receiver can accept');
            }

            // Clear ringing timeout for this participant.
            // Group calls: clear only THIS participant’s individual timer (Option B).
            // 1-1 calls: clear the single global timer.
            if (session.isGroupCall) {
                  this.clearParticipantRingingTimeout(dto.callId, userId);
            } else {
                  this.clearRingingTimeout(dto.callId);
            }

            // Transition to ACTIVE
            await this.callHistoryService.updateCallStatus(dto.callId, 'ACTIVE');

            const callRoom = this.getCallRoom(dto.callId);

            if (session.isGroupCall) {
                  // Group call: emit participant-joined to the room
                  const displayName = await this.getParticipantDisplayName(userId);
                  this.server.to(callRoom).emit(SocketEvents.CALL_PARTICIPANT_JOINED, {
                        callId: dto.callId,
                        userId,
                        displayName,
                  });

                  this.logger.log(`Call ${dto.callId}: participant ${userId} joined (group)`);
            } else {
                  // 1-1 P2P call: emit call:accepted with ICE config
                  const callerIceConfig = await this.iceConfigService.getIceConfig(
                        session.callerId,
                  );

                  // Emit call:accepted only to the CALLER (not the whole room)
                  // to prevent callee from triggering startCallAsCaller.
                  const callerSocketIds = await this.socketState.getUserSockets(session.callerId);
                  if (callerSocketIds.length > 0) {
                        this.server.to(callerSocketIds).emit(SocketEvents.CALL_ACCEPTED, {
                              callId: dto.callId,
                              iceServers: callerIceConfig.iceServers,
                              iceTransportPolicy: callerIceConfig.iceTransportPolicy,
                        });
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
            if (!session) return this.emitError(client, 'Call not found or not authorized');

            const currentState = sessionStatusToCallState(session.status);
            if (!canTransition(currentState, 'REJECT')) {
                  return this.emitError(client, `Cannot reject call in ${session.status} state`);
            }

            // Must be a receiver
            const isReceiver = session.calleeId === userId ||
                  (session.participantIds?.includes(userId) ?? false);
            if (!isReceiver) {
                  return this.emitError(client, 'Only a receiver can reject');
            }

            if (session.isGroupCall) {
                  // Group call: this participant leaves, call continues for others
                  const callRoom = this.getCallRoom(dto.callId);
                  client.leave(callRoom);

                  // Clear this participant's individual ringing timer
                  this.clearParticipantRingingTimeout(dto.callId, userId);

                  // Remove user from Redis index so they're no longer "in a call"
                  await this.callHistoryService.removeUserFromCall(userId);

                  // Notify room that participant left
                  this.server.to(callRoom).emit(SocketEvents.CALL_PARTICIPANT_LEFT, {
                        callId: dto.callId,
                        userId,
                  });

                  // Check if all participants have rejected/timed out (no one accepted)
                  await this.checkAllParticipantsResponded(dto.callId);

                  this.logger.log(`Call ${dto.callId}: participant ${userId} rejected (group call continues)`);
            } else {
                  // 1-1: end the entire call
                  this.clearRingingTimeout(dto.callId);
                  await this.endCallInternal(session, CallEndReason.REJECTED);
                  this.logger.log(`Call ${dto.callId}: rejected by ${userId}`);
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
            if (!session) return this.emitError(client, 'Call not found or not authorized');

            const currentState = sessionStatusToCallState(session.status);
            const isHost = session.callerId === userId;

            // Group call: participant (non-host) hangs up → just leave
            if (session.isGroupCall && !isHost) {
                  const callRoom = this.getCallRoom(dto.callId);
                  client.leave(callRoom);
                  await this.callHistoryService.removeUserFromCall(userId);

                  this.server.to(callRoom).emit(SocketEvents.CALL_PARTICIPANT_LEFT, {
                        callId: dto.callId,
                        userId,
                  });

                  this.logger.log(`Call ${dto.callId}: participant ${userId} left (group)`);
                  return;
            }

            // Caller hanging up during RINGING = CANCEL
            if (currentState === 'RINGING' && isHost) {
                  this.clearRingingTimeout(dto.callId);
                  await this.endCallInternal(session, CallEndReason.USER_HANGUP);
                  this.logger.log(`Call ${dto.callId}: cancelled by caller ${userId}`);
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

            // Buffer candidates for server-side batching
            const batchKey = `${dto.callId}:${userId}`;
            const existing = this.iceBatchBuffers.get(batchKey);

            if (existing) {
                  // Append to existing batch
                  existing.candidates.push(dto.candidates);
            } else {
                  // Start new batch with a flush timer
                  const callRoom = this.getCallRoom(dto.callId);
                  const buffer = {
                        candidates: [dto.candidates],
                        timer: setTimeout(() => {
                              this.iceBatchBuffers.delete(batchKey);
                              // Flush: merge all buffered candidate arrays into one relay
                              const merged = buffer.candidates.join(',');
                              client.to(callRoom).emit(SocketEvents.CALL_ICE_CANDIDATE, {
                                    callId: dto.callId,
                                    candidates: `[${merged}]`,
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

            // Notify the other peer that an ICE restart is happening
            const callRoom = this.getCallRoom(dto.callId);
            client.to(callRoom).emit(SocketEvents.CALL_ICE_RESTART, {
                  callId: dto.callId,
                  fromUserId: userId,
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
            if (!session) return this.emitError(client, 'Call not found or not authorized');

            // Only switch from an active/reconnecting P2P call
            if (session.provider === CallProvider.DAILY_CO) {
                  return this.emitError(client, 'Call is already using Daily.co');
            }

            if (session.status !== 'ACTIVE' && session.status !== 'RECONNECTING') {
                  return this.emitError(client, `Cannot switch to Daily.co in ${session.status} state`);
            }

            try {
                  // Create Daily.co room
                  const allParticipantIds = session.participantIds
                        ? [session.callerId, ...session.participantIds]
                        : [session.callerId, session.calleeId];
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
                                    uid === session.callerId, // caller is owner
                              );
                              return [uid, token] as const;
                        }),
                  );
                  const tokens = Object.fromEntries(tokenEntries);

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
            } catch (error: any) {
                  this.logger.error(
                        `Failed to switch call ${dto.callId} to Daily.co: ${error.message}`,
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
                  session.callerId === userId ||
                  session.calleeId === userId ||
                  (session.participantIds?.includes(userId) ?? false)
            ) {
                  return session;
            }

            return null;
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
                  void this.dailyCoService.deleteRoom(session.dailyRoomName).catch((err) => {
                        this.logger.warn(`Failed to delete Daily.co room ${session.dailyRoomName}: ${err.message}`);
                  });
            }

            const status = this.resolveCallStatus(reason, session.status);

            // Calculate duration
            const startedAt = new Date(session.startedAt);
            const endedAt = new Date();
            const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));

            // Emit call:ended to all participants in the room
            this.server.to(callRoom).emit(SocketEvents.CALL_ENDED, { callId, reason, duration: durationSeconds, status });
            this.server.in(callRoom).socketsLeave(callRoom);

            // End call via service (writes to DB, emits domain event, cleans up Redis)
            try {
                  await this.callHistoryService.endCall({
                        callerId: session.callerId,
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
                  const allUserIds = new Set<string>([session.callerId, session.calleeId]);
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
      }

      /**
       * Handle ringing timeout — callee didn't answer within 30s.
       * Now uses getSessionByCallId for direct lookup (no userId needed).
       */
      private async handleRingingTimeout(callId: string): Promise<void> {
            this.logger.log(`Call ${callId}: ringing timeout (${RINGING_TIMEOUT_MS / 1000}s)`);

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
            return null;
      }

      /**
       * Resolve CallStatus from end reason and session status.
       */
      private resolveCallStatus(reason: string, sessionStatus: string): CallStatus {
            switch (reason) {
                  case CallEndReason.REJECTED:
                        return CallStatus.REJECTED;
                  case CallEndReason.NO_ANSWER:
                  case CallEndReason.TIMEOUT:
                        return sessionStatus === 'RINGING' ? CallStatus.NO_ANSWER : CallStatus.CANCELLED;
                  case CallEndReason.BLOCKED:
                        return CallStatus.CANCELLED;
                  case CallEndReason.NETWORK_DROP:
                        return sessionStatus === 'ACTIVE' ? CallStatus.COMPLETED : CallStatus.MISSED;
                  case CallEndReason.USER_HANGUP:
                  default:
                        return sessionStatus === 'ACTIVE' ? CallStatus.COMPLETED : CallStatus.CANCELLED;
            }
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
            this.logger.log(`Call ${callId}: all group participants timed out / rejected — ending call`);
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

      private emitError(client: AuthenticatedSocket, message: string) {
            client.emit(SocketEvents.ERROR, { code: 'CALL_ERROR', message });
      }
}
