import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Query,
  UseGuards,
  Param,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { ConversationService } from './services/conversation.service';
import {
  InteractionGuard,
  RequireInteraction,
} from '@modules/authorization/guards/interaction.guard';
import { PermissionAction } from '@common/constants/permission-actions.constant';
import { CurrentUser } from 'src/common/decorator/customize';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('conversations')
@Controller('conversations')
@UseGuards(JwtAuthGuard)
export class ConversationController {
  constructor(private readonly conversationService: ConversationService) { }

  @Post('direct')
  @UseGuards(InteractionGuard)
  @RequireInteraction(PermissionAction.MESSAGE)
  @ApiOperation({ summary: 'Get or create direct conversation' })
  async getOrCreateDirectConversation(
    @CurrentUser() user,
    @Body() body: { recipientId: string },
  ) {
    return this.conversationService.getOrCreateDirectConversation(
      user.id,
      body.recipientId,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Get list of conversations' })
  async getConversations(
    @CurrentUser() user,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    return this.conversationService.getUserConversations(
      user.id,
      cursor,
      limit ? +limit : 20,
    );
  }

  @Get('groups')
  @ApiOperation({ summary: 'Get list of group conversations' })
  async getGroups(
    @CurrentUser() user,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
  ) {
    return this.conversationService.getUserGroups(
      user.id,
      cursor,
      limit ? +limit : 20,
      search?.trim() || undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get conversation by ID' })
  async getConversationById(
    @CurrentUser() user,
    @Param('id') conversationId: string,
  ) {
    return this.conversationService.getConversationById(
      user.id,
      conversationId,
    );
  }

  @Get(':id/members')
  @ApiOperation({ summary: 'Get conversation members' })
  async getConversationMembers(
    @CurrentUser() user,
    @Param('id') conversationId: string,
  ) {
    return this.conversationService.getConversationMembers(
      user.id,
      conversationId,
    );
  }

  @Patch(':id/mute')
  @ApiOperation({ summary: 'Toggle mute/unmute a conversation' })
  async toggleMute(
    @CurrentUser() user,
    @Param('id') conversationId: string,
    @Body() body: { muted: boolean },
  ) {
    return this.conversationService.toggleMute(
      user.id,
      conversationId,
      body.muted,
    );
  }
}
