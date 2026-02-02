import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorator/customize';
import { BlockService } from './block.service';
import type { User } from '@prisma/client';

import { CursorPaginationDto } from 'src/common/dto/cursor-pagination.dto';
import { BlockUserDto } from './dto/block-privacy.dto';
@ApiTags('Block')
@Controller('block')
export class BlockController {
  constructor(private readonly blockService: BlockService) {}
  // ==============================
  // 3. BLOCKING
  // ==============================
  @Post('block')
  @ApiOperation({ summary: 'Block a user' })
  async blockUser(
    @CurrentUser() user: User,
    @Body() dto: BlockUserDto,
    // BlockUserDto đã có field `blockedUserId`.
    // LƯU Ý: Để Guard hoạt động tự động với DTO này, ta nên alias hoặc sửa DTO.
    // Tuy nhiên, BlockUserDto dùng `blockedUserId`.
    // Giải pháp Clean nhất: update Helper để check thêm `blockedUserId` hoặc sửa DTO thành `targetUserId`.
    // Ở đây tôi đề xuất sửa DTO ở bước dưới.
  ) {
    return this.blockService.blockUser(user.id, dto);
  }

  @Delete('block/:targetUserId')
  @ApiOperation({ summary: 'Unblock a user' })
  async unblockUser(
    @CurrentUser() user: User,
    @Param('targetUserId', ParseUUIDPipe) targetUserId: string,
  ) {
    return this.blockService.unblockUser(user.id, targetUserId);
  }

  @Get('blocked')
  @ApiOperation({ summary: 'Get list of blocked users' })
  async getBlockedUsers(
    @CurrentUser() user: User,
    @Query() query: CursorPaginationDto,
  ) {
    return await this.blockService.getBlockedList(user.id, query);
  }
}
