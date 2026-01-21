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
} from '@nestjs/common';
import { UsersService } from './users.service';
import { ResponseMessage } from 'src/common/decorator/customize';
import { UpdateUserDto } from './dto/update-user.dto';
import { ApiTags } from '@nestjs/swagger';
import { CreateUserAdminDto } from './dto/create-user-admin.dto';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';

//swagger
@ApiTags('users')
@Controller('users')
@UseInterceptors(ClassSerializerInterceptor) // Kích hoạt @Exclude
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // 2. ADMIN CREATE (Cần bảo vệ bằng Guard sau này)
  @Post() // Endpoint: /api/v1/users
  @ResponseMessage('Create user by Admin')
  create(@Body() createUserAdminDto: CreateUserAdminDto) {
    return this.usersService.createByAdmin(createUserAdminDto);
  }

  @Get()
  // @CanRead('User')
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

  // @Patch('admin-update')
  // // @CanUpdate('User')
  // @ResponseMessage('Update User by Admin')
  // updateByAdmin(@Body() body: UpdateUserAdminDto, @User() user: IUser) {
  //   // Chỉ Admin mới gọi được API này
  //   if (user.role.name !== SUPER_ADMIN) {
  //     throw new ForbiddenException(
  //       'Chỉ Admin mới có quyền truy cập endpoint này',
  //     );
  //   }
  //   return this.usersService.updateUser(body, user);
  // }

  @Patch(':id')
  // @CanUpdate('User')
  @ResponseMessage('Update a User')
  update(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.usersService.update(id, body);
  }

  @Patch(':id/admin-update')
  // @CanUpdate('User')
  @ResponseMessage('Update a User')
  adminUpdate(@Param('id') id: string, @Body() body: UpdateUserAdminDto) {
    return this.usersService.updateByAdmin(id, body);
  }

  @Delete(':id')
  // @CanDelete('User')
  @ResponseMessage('Delete a User')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}
