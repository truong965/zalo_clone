import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import {
  AuthenticatedSocket,
  SocketUserContext,
} from 'src/common/interfaces/socket-client.interface';

/**
 * Decorator to extract authenticated user from WebSocket connection
 * Usage: @WsUser() user: SocketUserContext
 */
export const WsUser = createParamDecorator(
  (data: keyof SocketUserContext | undefined, ctx: ExecutionContext) => {
    const client: AuthenticatedSocket = ctx.switchToWs().getClient();
    const user = client.user;

    return data && user ? user[data] : user;
  },
);
