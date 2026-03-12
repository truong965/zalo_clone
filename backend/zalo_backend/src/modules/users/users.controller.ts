import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseInterceptors,
  ClassSerializerInterceptor,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CurrentUser, ResponseMessage } from 'src/common/decorator/customize';
import { UpdateUserDto } from './dto/update-user.dto';
import { ApiTags } from '@nestjs/swagger';
import { CreateUserAdminDto } from './dto/create-user-admin.dto';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';
import { Roles } from '@common/decorator/roles.decorator';
import { RolesGuard } from '@common/guards/roles.guard';
import type { User } from '@prisma/client';

//swagger
@ApiTags('users')
@Controller('users')
@UseInterceptors(ClassSerializerInterceptor) // Kích hoạt @Exclude
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ResponseMessage('Create user by Admin')
  create(@Body() createUserAdminDto: CreateUserAdminDto) {
    return this.usersService.createByAdmin(createUserAdminDto);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ResponseMessage('fetch users with pagination')
  findAll(
    @Query('current') currentPage: string,
    @Query('pageSize') limit: string,
    @Query() qs: string,
  ) {
    return this.usersService.findAll(+currentPage, +limit, qs);
  }

  @ResponseMessage('fetch user by id')
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @ResponseMessage('Update a User')
  update(
    @Param('id') id: string,
    @Body() body: UpdateUserDto,
    @CurrentUser() currentUser: User,
  ) {
    if (
      currentUser.id !== id &&
      (currentUser as any).role?.name !== 'ADMIN'
    ) {
      throw new ForbiddenException(
        'Bạn chỉ có thể cập nhật hồ sơ của chính mình',
      );
    }
    return this.usersService.update(id, body);
  }

  @Patch(':id/admin-update')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ResponseMessage('Update a User by Admin')
  adminUpdate(@Param('id') id: string, @Body() body: UpdateUserAdminDto) {
    return this.usersService.updateByAdmin(id, body);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  @ResponseMessage('Delete a User')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
