import {
      Injectable,
      CanActivate,
      ExecutionContext,
      ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@common/decorator/roles.decorator';

/**
 * RolesGuard — checks that request.user has one of the required roles.
 *
 * Works with the @Roles() decorator.
 * The user object on the request (set by JwtStrategy) includes `role`
 * via Prisma include + Object.assign in UserEntity.
 *
 * Usage (controller-level):
 *   @UseGuards(RolesGuard)
 *   @Roles('ADMIN')
 *   @Controller('admin')
 *   export class AdminController { ... }
 *
 * Usage (method-level):
 *   @Roles('ADMIN')
 *   @UseGuards(RolesGuard)
 *   @Get('stats')
 *   getStats() { ... }
 *
 * If no @Roles() metadata is found, the guard passes (non-restrictive by default).
 */
@Injectable()
export class RolesGuard implements CanActivate {
      constructor(private readonly reflector: Reflector) { }

      canActivate(context: ExecutionContext): boolean {
            // 1. Get required roles from decorator metadata
            const requiredRoles = this.reflector.getAllAndOverride<string[]>(
                  ROLES_KEY,
                  [context.getHandler(), context.getClass()],
            );

            // No @Roles() → allow through (guard is non-restrictive for undecorated routes)
            if (!requiredRoles || requiredRoles.length === 0) {
                  return true;
            }

            // 2. Extract user from request (set by JwtAuthGuard + JwtStrategy)
            const request = context.switchToHttp().getRequest();
            const user = request.user;

            if (!user) {
                  throw new ForbiddenException('Authentication required');
            }

            // 3. Check role — user.role is the Prisma Role object (from JwtStrategy include)
            //    role.name is the role string (e.g., 'ADMIN', 'USER')
            const userRoleName: string | undefined =
                  (user as any).role?.name ?? undefined;

            if (!userRoleName || !requiredRoles.includes(userRoleName)) {
                  throw new ForbiddenException(
                        'Bạn không có quyền truy cập tài nguyên này',
                  );
            }

            return true;
      }
}
