import {
  Controller,
  Delete,
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
import { GroupService } from './services/group.service';
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
  constructor(
    private readonly conversationService: ConversationService,
    private readonly groupService: GroupService,
  ) { }

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

  @Post(':id/pin')
  @ApiOperation({ summary: 'Pin a conversation' })
  async pinConversation(
    @CurrentUser() user,
    @Param('id') conversationId: string,
  ) {
    return this.conversationService.pinConversation(user.id, conversationId);
  }

  @Delete(':id/pin')
  @ApiOperation({ summary: 'Unpin a conversation' })
  async unpinConversation(
    @CurrentUser() user,
    @Param('id') conversationId: string,
  ) {
    return this.conversationService.unpinConversation(user.id, conversationId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PIN / UNPIN MESSAGE (Phase 3)
  // ═══════════════════════════════════════════════════════════════════════

  @Get(':id/pinned-messages')
  @ApiOperation({ summary: 'Get pinned messages for a conversation' })
  async getPinnedMessages(
    @CurrentUser() user,
    @Param('id') conversationId: string,
  ) {
    return this.conversationService.getPinnedMessages(user.id, conversationId);
  }

  @Post(':id/pin-message')
  @ApiOperation({ summary: 'Pin a message in a conversation' })
  async pinMessage(
    @CurrentUser() user,
    @Param('id') conversationId: string,
    @Body() body: { messageId: string },
  ) {
    return this.groupService.pinMessage(
      conversationId,
      BigInt(body.messageId),
      user.id,
    );
  }

  @Delete(':id/pin-message')
  @ApiOperation({ summary: 'Unpin a message from a conversation' })
  async unpinMessage(
    @CurrentUser() user,
    @Param('id') conversationId: string,
    @Body() body: { messageId: string },
  ) {
    return this.groupService.unpinMessage(
      conversationId,
      BigInt(body.messageId),
      user.id,
    );
  }
}
