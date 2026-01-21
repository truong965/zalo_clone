import { Injectable, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from 'src/common/decorator/customize';

/**
 * Global guard to protect routes with JWT authentication
 * Use @Public() decorator to bypass authentication
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
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
  // handleRequest(err, user, info: any, context: ExecutionContext) {
  // // 1. Kiểm tra xem route hiện tại có phải là Public không
  // const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
  //   context.getHandler(),
  //   context.getClass(),
  // ]);

  // // 2. Nếu có User (Token hợp lệ) -> Trả về User (áp dụng cho cả Public & Private)
  // if (user) {
  //   this.cls.set('userId', user.id);
  //   // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  //   return user;
  // }

  // // 3. Nếu là Public nhưng không có User (Token lỗi/hết hạn/không gửi) -> Cho qua
  // // Trả về null để controller biết là "Guest"
  // if (isPublic) {
  //   return null;
  // }

  // // 4. Nếu là Private mà không có User (hoặc có lỗi) -> Ném lỗi 401
  // throw (
  //   err || new UnauthorizedException('Token không hợp lệ hoặc không tồn tại')
  // );
}
