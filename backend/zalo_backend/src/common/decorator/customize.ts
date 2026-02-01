import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { User } from '@prisma/client';
import { DeviceInfo } from 'src/modules/auth/interfaces/device-info.interface';

export const IS_PUBLIC_KEY = 'isPublic';
/**
 * Decorator to mark routes as public (no authentication required)
 * Usage: @Public()
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const RESPONSE_MESSAGE = 'response_message';
export const ResponseMessage = (message: string) =>
  SetMetadata(RESPONSE_MESSAGE, message);

/**
 * Decorator to extract current authenticated user from request
 * Usage: @CurrentUser() user: User
 */
export const CurrentUser = createParamDecorator(
  (data: keyof User | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    return data ? user?.[data] : user;
  },
);

/**
 * Decorator to extract device information from request
 * Must be used after DeviceFingerprintService has processed the request
 * Usage: @GetDeviceInfo() deviceInfo: DeviceInfo
 */
export const GetDeviceInfo = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): DeviceInfo => {
    const request = ctx.switchToHttp().getRequest();
    return request.deviceInfo;
  },
);

export const IS_PUBLIC_PERMISSION = 'isPublicPermission';
// Decorator này dùng để bypass việc check quyền trong DB
export const SkipCheckPermission = () =>
  SetMetadata(IS_PUBLIC_PERMISSION, true);
/**
 * Get current user ID only (lighter than full user object)
 *
 * Usage:
 * @Get('friends')
 * async getFriends(@CurrentUserId() userId: string) {...}
 */
export const CurrentUserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.id;
  },
);

/**
 * Extract target user ID from various sources
 *
 * Usage:
 * @Post('message')
 * async sendMessage(
 *   @CurrentUserId() senderId: string,
 *   @TargetUserId() recipientId: string,
 * ) {...}
 */
export const TargetUserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return (
      request.params?.userId ||
      request.params?.targetUserId ||
      request.body?.targetUserId ||
      request.body?.userId ||
      request.query?.userId
    );
  },
);
