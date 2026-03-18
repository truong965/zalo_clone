import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from 'src/common/decorator/customize';
import { RequestContextService } from 'src/common/context/request-context.service';

interface AuthenticatedRequestUser {
  id: string;
  roles?: unknown;
  currentSessionId?: string;
  currentDeviceId?: string;
}

/**
 * Global guard to protect routes with JWT authentication
 * Use @Public() decorator to bypass authentication
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(
    private reflector: Reflector,
    private readonly requestContext: RequestContextService,
  ) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }
  handleRequest<TUser = AuthenticatedRequestUser | null>(
    err: unknown,
    user: unknown,
    info: unknown,
    context: ExecutionContext,
    status?: unknown,
  ): TUser {
    void info;
    void status;

    // 1. Kiểm tra xem route hiện tại có phải là Public không
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // 2. Nếu có User (Token hợp lệ) -> Trả về User (áp dụng cho cả Public & Private)
    if (this.isAuthenticatedRequestUser(user)) {
      this.requestContext.setAuthenticatedUser({
        userId: user.id,
        roles: user.roles,
        sessionId: user.currentSessionId,
        deviceId: user.currentDeviceId,
      });
      return user as TUser;
    }

    // 3. Nếu là Public nhưng không có User (Token lỗi/hết hạn/không gửi) -> Cho qua
    // Trả về null để controller biết là "Guest"
    if (isPublic) {
      return null as TUser;
    }

    // 4. Nếu là Private mà không có User (hoặc có lỗi) -> Ném lỗi 401
    if (err instanceof Error) {
      throw err;
    }

    throw new UnauthorizedException('Token không hợp lệ hoặc không tồn tại');
  }

  private isAuthenticatedRequestUser(
    value: unknown,
  ): value is AuthenticatedRequestUser {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const user = value as Record<string, unknown>;
    return typeof user.id === 'string';
  }
}
