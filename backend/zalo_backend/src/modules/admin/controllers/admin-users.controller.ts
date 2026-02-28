import {
      Controller,
      Get,
      Param,
      Patch,
      Post,
      Query,
      UseGuards,
} from '@nestjs/common';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorator/roles.decorator';
import { CurrentUserId } from '@common/decorator/customize';
import { AdminUsersService } from '../services/admin-users.service';
import { UserListQueryDto } from '../dto/user-list-query.dto';

/**
 * Admin Users Controller
 *
 * Endpoints:
 * - GET    /admin/users              → paginated user list
 * - GET    /admin/users/:id          → user detail
 * - PATCH  /admin/users/:id/suspend  → suspend user
 * - PATCH  /admin/users/:id/activate → reactivate suspended user
 * - POST   /admin/users/:id/force-logout → revoke all sessions
 *
 * Protected by JwtAuthGuard (global) + RolesGuard (ADMIN only).
 */
@Controller('admin/users')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AdminUsersController {
      constructor(private readonly usersService: AdminUsersService) { }

      @Get()
      getUsers(@Query() dto: UserListQueryDto) {
            return this.usersService.getUsers(dto);
      }

      @Get(':id')
      getUserDetail(@Param('id') id: string) {
            return this.usersService.getUserDetail(id);
      }

      @Patch(':id/suspend')
      suspendUser(@Param('id') id: string, @CurrentUserId() adminId: string) {
            return this.usersService.suspendUser(id, adminId);
      }

      @Patch(':id/activate')
      activateUser(@Param('id') id: string) {
            return this.usersService.activateUser(id);
      }

      @Post(':id/force-logout')
      forceLogoutUser(@Param('id') id: string) {
            return this.usersService.forceLogoutUser(id);
      }
}
