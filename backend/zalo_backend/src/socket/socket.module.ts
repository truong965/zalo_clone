import { Global, Module } from '@nestjs/common';
import { SocketService } from './socket.service';
import { SocketGateway } from './socket.gateway';
import { JwtModule } from '@nestjs/jwt'; // Hoặc import AuthModule nếu đã export JwtService

@Global() // Quan trọng: Đặt Global để FriendshipsModule dùng được ngay mà không cần import lại
@Module({
  imports: [JwtModule],
  providers: [SocketGateway, SocketService],
  exports: [SocketService], // Export Service để module khác gọi
})
export class SocketModule {}
