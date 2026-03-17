import { SocketEvents } from '@common/constants/socket-events.constant';
import { OUTBOUND_SOCKET_EVENT } from '@common/events/outbound-socket.event';

/**
 * Stage 7.1 internal event registry (typed names only).
 *
 * Scope of this stage:
 * - Start with high-priority transport/internal events.
 * - Keep runtime behavior unchanged.
 * - Provide a single source for event-name typing in upcoming refactors.
 */
export const InternalEventNames = {
      OUTBOUND_SOCKET: OUTBOUND_SOCKET_EVENT,
      USER_SOCKET_CONNECTED: SocketEvents.USER_SOCKET_CONNECTED,
      USER_SOCKET_DISCONNECTED: SocketEvents.USER_SOCKET_DISCONNECTED,
      SEARCH_INTERNAL_NEW_MATCH: SocketEvents.SEARCH_INTERNAL_NEW_MATCH,
      SEARCH_INTERNAL_RESULT_REMOVED: SocketEvents.SEARCH_INTERNAL_RESULT_REMOVED,
} as const;

export type InternalEventName =
      (typeof InternalEventNames)[keyof typeof InternalEventNames];
