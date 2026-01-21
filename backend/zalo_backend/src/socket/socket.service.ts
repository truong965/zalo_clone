import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
@Injectable()
export class SocketService {
  private readonly logger = new Logger(SocketService.name);
  private server: Server;

  // Gateway sẽ set instance Server vào đây khi khởi tạo
  setServer(server: Server) {
    this.server = server;
  }

  /**
   * Gửi sự kiện đến một User cụ thể (trên mọi thiết bị)
   * @param userId ID của người nhận
   * @param event Tên sự kiện
   * @param payload Dữ liệu gửi đi
   */
  emitToUser(userId: string, event: string, payload: any) {
    if (!this.server) {
      this.logger.warn('Socket Server chưa khởi tạo!');
      return;
    }

    // Pattern: Room name = "user_UUID"
    const roomName = `user_${userId}`;

    // Gửi đến Room
    this.server.to(roomName).emit(event, payload);

    this.logger.debug(`Đã gửi event [${event}] tới room [${roomName}]`);
  }

  /**
   * Gửi sự kiện đến một Nhóm (Dùng cho Chat Group sau này)
   */
  emitToGroup(groupId: string, event: string, payload: any) {
    const roomName = `group_${groupId}`;
    this.server.to(roomName).emit(event, payload);
  }
}
