import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { SocketAuthService } from '../services/socket-auth.service'; // Import Service
import { AuthenticatedSocket } from 'src/common/interfaces/socket-client.interface';

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    // Inject Service thay vì logic rời rạc
    private readonly socketAuthService: SocketAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: AuthenticatedSocket = context.switchToWs().getClient();

      // 1. Kiểm tra xem Socket đã được xác thực trước đó chưa (Optimized)
      // Nếu ở handleConnection đã gán user rồi thì không cần check lại DB
      if (client.authenticated && client.user) {
        return true;
      }

      // 2. Tái sử dụng logic xác thực từ Service
      const user = await this.socketAuthService.authenticateSocket(client);

      if (!user) {
        // Service trả về null nghĩa là xác thực thất bại
        throw new WsException('Unauthorized access');
      }

      // 3. Gán user vào client để các handler sau sử dụng
      client.user = user;
      client.userId = user.id;
      client.authenticated = true;

      return true;
    } catch (error) {
      // Xử lý lỗi
      const message = error instanceof Error ? error.message : 'Unauthorized';
      this.logger.error(`Guard check failed: ${message}`);
      throw new WsException(message);
    }
  }
}
