import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { SocketAuthService } from 'src/socket/services/socket-auth.service';
import { AuthenticatedSocket } from 'src/common/interfaces/socket-client.interface';

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(private readonly socketAuthService: SocketAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: AuthenticatedSocket = context.switchToWs().getClient();

      if (client.authenticated && client.user) {
        return true;
      }

      const user = await this.socketAuthService.authenticateSocket(client);

      if (!user) {
        throw new WsException('Unauthorized access');
      }

      client.user = user;
      client.userId = user.id;
      client.authenticated = true;

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unauthorized';
      this.logger.error(`Guard check failed: ${message}`);
      throw new WsException(message);
    }
  }
}
