import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { FriendshipsService } from './friendships.service';
import { CreateFriendshipDto } from './dto/create-friendship.dto';
import { UpdateFriendshipDto } from './dto/update-friendship.dto';
import { ResponseMessage } from 'src/common/decorator/customize'; // Dùng path của bạn
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Friendships')
@Controller('friendships')
export class FriendshipsController {
  constructor(private readonly friendshipsService: FriendshipsService) {}

  @Post()
  @ResponseMessage('Send friend request')
  create(@Body() createFriendshipDto: CreateFriendshipDto) {
    return this.friendshipsService.create(createFriendshipDto);
  }

  @Get()
  @ResponseMessage('Fetch friendships with pagination')
  findAll(
    @Query('current') currentPage: string,
    @Query('pageSize') limit: string,
    @Query() qs: string,
  ) {
    // Lưu ý: API này đang trả về raw data của bảng Friendships (dành cho Admin hoặc Debug).
    // Để lấy "Danh sách bạn bè của tôi", ta nên filter qs: filter={"$or":[{"user1Id":"MY_ID"},{"user2Id":"MY_ID"}]}
    return this.friendshipsService.findAll(+currentPage, +limit, qs);
  }

  @Get(':id')
  @ResponseMessage('Fetch friendship details')
  findOne(@Param('id') id: string) {
    return this.friendshipsService.findOne(id);
  }

  @Patch(':id')
  @ResponseMessage('Update friendship status (Accept/Decline)')
  update(
    @Param('id') id: string,
    @Body() updateFriendshipDto: UpdateFriendshipDto,
  ) {
    return this.friendshipsService.update(id, updateFriendshipDto);
  }

  @Delete(':id')
  @ResponseMessage('Unfriend or Cancel request')
  remove(@Param('id') id: string) {
    return this.friendshipsService.remove(id);
  }
}
