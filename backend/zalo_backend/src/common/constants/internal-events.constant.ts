/**
 * Internal event names for cross-module communication.
 * Centralized here to decouple modules like Auth and Socket.
 */
export const QR_INTERNAL_EVENTS = {
  /** Payload: { targetSocketId, event, data } */
  EMIT_TO_SOCKET: 'qr.internal.emit_to_socket',
  /** Payload: { userId, deviceIds, reason } */
  FORCE_LOGOUT_DEVICES: 'qr.internal.force_logout_devices',
} as const;
