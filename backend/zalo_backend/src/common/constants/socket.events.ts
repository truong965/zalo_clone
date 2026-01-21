export const SOCKET_EVENTS = {
  // Namespace chung
  CONNECT: 'connection',
  DISCONNECT: 'disconnect',

  // Notification / Friend System
  NOTIFICATION_NEW: 'notification.new', // Báo chung có noti mới
  FRIEND_REQUEST_RECEIVED: 'friend.request.received',
  FRIEND_REQUEST_ACCEPTED: 'friend.request.accepted',

  // Chat System (Dùng sau này)
  MESSAGE_NEW: 'message.new',
  MESSAGE_SEEN: 'message.seen',
  TYPING_START: 'typing.start',
  TYPING_END: 'typing.end',
};
