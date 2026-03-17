import { SocketEventName } from '../constants/socket-events.constant';

/**
 * Interface chuẩn cho việc phát Event nội bộ để Socket Gateway hứng và đẩy xuống Client.
 * Giúp các module Domain (Friendship, Contact...) gửi dữ liệu Socket mà không cần inject SocketGateway.
 */
export interface ISocketEmitEvent {
  /**
   * Tên sự kiện (Event Name) gửi xuống Frontend. Điển hình nằm trong SocketEvents.
   */
  event: SocketEventName;

  /**
   * Payload (Dữ liệu) sẽ được gửi xuống Frontend.
   */
  data: any;

  /**
   * Gửi đích danh một user (gửi tới tất cả thiết bị của user đó).
   */
  userId?: string;

  /**
   * Gửi tới nhiều user cùng lúc.
   */
  userIds?: string[];

  /**
   * Gửi trực tiếp tới 1 socketId cụ thể (VD: QR Login session).
   */
  socketId?: string;
  
  /**
   * (Tùy chọn) Gửi vào một room xác định.
   */
  room?: string;
}

/** Tên event chuẩn nội bộ mà SocketGateway sẽ lắng nghe */
export const OUTBOUND_SOCKET_EVENT = 'socket.outbound';
