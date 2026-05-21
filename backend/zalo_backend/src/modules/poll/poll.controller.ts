import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from 'src/common/decorator/customize';
import type { User } from '@prisma/client';
import { ParseBigIntPipe } from 'src/common/pipes/parse-bigint.pipe';
import { PollService } from './services/poll.service';
import { CreatePollDto } from './dto/create-poll.dto';
import { VotePollDto } from './dto/vote-poll.dto';
import { AddPollOptionDto } from './dto/add-poll-option.dto';

@ApiTags('Polls')
@ApiBearerAuth()
@Controller('polls')
@UseGuards(JwtAuthGuard)
export class PollController {
  constructor(private readonly pollService: PollService) {}

  @ApiOperation({ summary: 'Create a group poll' })
  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreatePollDto) {
    return this.pollService.create(user.id, dto);
  }

  @ApiOperation({ summary: 'Get poll by message id' })
  @ApiParam({ name: 'messageId', description: 'Message id' })
  @Get('message/:messageId')
  findByMessage(
    @CurrentUser() user: User,
    @Param('messageId', ParseBigIntPipe) messageId: string,
  ) {
    return this.pollService.findByMessageId(messageId, user.id);
  }

  @ApiOperation({ summary: 'Get poll by id (with full voter lists)' })
  @ApiParam({ name: 'id', description: 'Poll UUID' })
  @Get(':id')
  findOne(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pollService.findById(id, user.id, 500);
  }

  @ApiOperation({ summary: 'Vote or unvote poll options' })
  @ApiParam({ name: 'id', description: 'Poll UUID' })
  @Post(':id/vote')
  vote(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VotePollDto,
  ) {
    return this.pollService.vote(id, user.id, dto);
  }

  @ApiOperation({ summary: 'Add a new option to an open poll' })
  @ApiParam({ name: 'id', description: 'Poll UUID' })
  @Post(':id/options')
  addOption(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddPollOptionDto,
  ) {
    return this.pollService.addOption(id, user.id, dto);
  }

  @ApiOperation({ summary: 'Close poll (creator or group admin)' })
  @ApiParam({ name: 'id', description: 'Poll UUID' })
  @Patch(':id/close')
  close(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pollService.close(id, user.id);
  }
}
