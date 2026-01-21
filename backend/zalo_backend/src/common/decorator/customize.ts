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
