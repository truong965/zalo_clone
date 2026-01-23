import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '@prisma/client';
import { AuthenticatedSocket } from 'src/common/interfaces/socket-client.interface';

/**
 * Decorator to extract authenticated user from WebSocket connection
 * Usage: @WsUser() user: User
 */
export const WsUser = createParamDecorator(
  (data: keyof User | undefined, ctx: ExecutionContext) => {
    const client: AuthenticatedSocket = ctx.switchToWs().getClient();
    const user = client.user;

    return data && user ? user[data] : user;
  },
);
