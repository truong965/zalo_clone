import { SetMetadata } from '@nestjs/common';

/**
 * Key for the roles metadata.
 * Used by RolesGuard to check if the current user has the required role.
 */
export const ROLES_KEY = 'roles';

/**
 * Decorator to restrict endpoint access by role name(s).
 *
 * Usage:
 *   @Roles('ADMIN')
 *   @Get('/admin/dashboard')
 *   getDashboard() { ... }
 *
 * Requires RolesGuard applied via @UseGuards(RolesGuard)
 * or at the controller level.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
