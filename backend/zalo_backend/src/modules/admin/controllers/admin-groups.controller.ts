import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '@common/guards/roles.guard';
import { Roles } from '@common/decorator/roles.decorator';
import { CurrentUserId } from '@common/decorator/customize';
import { AdminGroupsService } from '../services/admin-groups.service';
import {
  AddAdminGroupMembersDto,
  CreateAdminGroupDto,
  GroupListQueryDto,
  UpdateAdminGroupDto,
  UpdateAdminGroupMemberRoleDto,
} from '../dto/admin-group.dto';

@ApiTags('Admin — Groups')
@ApiBearerAuth()
@Controller('admin/groups')
@UseGuards(RolesGuard)
@Roles('ADMIN')
export class AdminGroupsController {
  constructor(private readonly groupsService: AdminGroupsService) {}

  @ApiOperation({ summary: 'List group conversations with admin metadata' })
  @Get()
  getGroups(@Query() dto: GroupListQueryDto) {
    return this.groupsService.getGroups(dto);
  }

  @ApiOperation({ summary: 'Create a group as system admin' })
  @Post()
  createGroup(
    @Body() dto: CreateAdminGroupDto,
    @CurrentUserId() adminId: string,
  ) {
    return this.groupsService.createGroup(dto, adminId);
  }

  @ApiOperation({ summary: 'Get group detail and members' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @Get(':id')
  getGroupDetail(@Param('id') id: string) {
    return this.groupsService.getGroupDetail(id);
  }

  @ApiOperation({ summary: 'Update group metadata' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @Patch(':id')
  updateGroup(
    @Param('id') id: string,
    @Body() dto: UpdateAdminGroupDto,
    @CurrentUserId() adminId: string,
  ) {
    return this.groupsService.updateGroup(id, dto, adminId);
  }

  @ApiOperation({ summary: 'Add members to a group' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @Post(':id/members')
  addMembers(@Param('id') id: string, @Body() dto: AddAdminGroupMembersDto) {
    return this.groupsService.addMembers(id, dto);
  }

  @ApiOperation({ summary: 'Remove a member from a group' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @Delete(':id/members/:userId')
  removeMember(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @CurrentUserId() adminId: string,
  ) {
    return this.groupsService.removeMember(id, userId, adminId);
  }

  @ApiOperation({ summary: 'Promote or demote a group member' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @Patch(':id/members/:userId/role')
  updateMemberRole(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateAdminGroupMemberRoleDto,
    @CurrentUserId() adminId: string,
  ) {
    return this.groupsService.updateMemberRole(id, userId, dto, adminId);
  }

  @ApiOperation({ summary: 'Force close a group conversation' })
  @ApiParam({ name: 'id', description: 'Conversation ID' })
  @Post(':id/force-close')
  forceCloseGroup(@Param('id') id: string, @CurrentUserId() adminId: string) {
    return this.groupsService.forceCloseGroup(id, adminId);
  }
}
