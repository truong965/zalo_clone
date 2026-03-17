import type { ISocketEmitEvent } from '@common/events/outbound-socket.event';
import type { AuthenticatedSocket } from '@common/interfaces/socket-client.interface';
import type { MessageWithSearchContext } from '@modules/search_engine/interfaces/search-raw-result.interface';
import { InternalEventNames } from './event-names';

/**
 * Runtime payload shape emitted by SocketGateway.
 *
 * Note:
 * - socketId can be null for cross-server presence relays.
 * - socket is optional and only available for same-process connect flow.
 */
export interface UserSocketConnectedEventPayload {
      userId: string;
      socketId: string | null;
      connectedAt: Date;
      socket?: AuthenticatedSocket;
}

/**
 * Runtime payload shape emitted by SocketGateway.
 *
 * Note:
 * - socketId can be null for cross-server presence relays.
 */
export interface UserSocketDisconnectedEventPayload {
      userId: string;
      socketId: string | null;
      reason: string;
}

/**
 * Internal batched match payload emitted by RealTimeSearchService
 * and consumed by SearchGateway.
 */
export interface SearchInternalNewMatchEventPayload {
      message: MessageWithSearchContext;
      subscriptions: Array<{
            socketId: string;
            keyword: string;
            userId: string;
      }>;
}

/**
 * Internal removal payload emitted by SearchEventListener
 * and consumed by SearchGateway.
 */
export interface SearchInternalResultRemovedEventPayload {
      messageId: string;
      conversationId: string;
}

/**
 * Stage 7.1 typed payload map for high-priority internal events.
 *
 * This map is intentionally scoped to the first event subset in the plan.
 * Additional domain events will be expanded in later sub-stages.
 */
export interface InternalEventPayloadMap {
      [InternalEventNames.OUTBOUND_SOCKET]: ISocketEmitEvent;
      [InternalEventNames.USER_SOCKET_CONNECTED]: UserSocketConnectedEventPayload;
      [InternalEventNames.USER_SOCKET_DISCONNECTED]: UserSocketDisconnectedEventPayload;
      [InternalEventNames.SEARCH_INTERNAL_NEW_MATCH]: SearchInternalNewMatchEventPayload;
      [InternalEventNames.SEARCH_INTERNAL_RESULT_REMOVED]: SearchInternalResultRemovedEventPayload;
}

export type InternalEventPayload<
      TEventName extends keyof InternalEventPayloadMap,
> = InternalEventPayloadMap[TEventName];
