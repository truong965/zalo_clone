// src/modules/messaging/messaging.controller.ts

import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Request,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  ParseBoolPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { MessageService } from './services/message.service';
import { ConversationService } from './services/conversation.service';
import { SendMessageDto } from './dto/send-message.dto';
import { GetMessagesDto } from './dto/get-messages.dto';
import { NotBlockedGuard } from '../social/guards/social.guard';
import { CanMessageGuard } from '../social/guards/social-permissions.guard.ts';
import { CurrentUser } from 'src/common/decorator/customize';
import { ApiOperation } from '@nestjs/swagger';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagingController {
  constructor(
    private readonly messageService: MessageService,
    private readonly conversationService: ConversationService,
  ) {}

  /**
   * Send message via HTTP (fallback if WebSocket unavailable)
   */
  @Post()
  @UseGuards(NotBlockedGuard, CanMessageGuard)
  async sendMessage(@CurrentUser() user, @Body() dto: SendMessageDto) {
    return this.messageService.sendMessage(dto, user.id);
  }

  /**
   * Get messages with pagination
   */
  @Get()
  async getMessages(@CurrentUser() user, @Query() dto: GetMessagesDto) {
    return this.messageService.getMessages(dto, user.id);
  }

  /**
   * Delete message
   */
  @Delete(':messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMessage(
    @CurrentUser() user,
    @Param('messageId') messageId: string,
    @Query('deleteForEveryone', new ParseBoolPipe({ optional: true }))
    deleteForEveryone: boolean = false,
  ) {
    await this.messageService.deleteMessage(
      BigInt(messageId),
      user.id,
      deleteForEveryone,
    );
  }

  /**
   * Get or create direct conversation
   */
  @Post('conversations/direct')
  @UseGuards(NotBlockedGuard, CanMessageGuard)
  async getOrCreateDirectConversation(
    @CurrentUser() user,
    @Body() body: { recipientId: string },
  ) {
    return this.conversationService.getOrCreateDirectConversation(
      user.id,
      body.recipientId,
    );
  }
  @Get('conversations')
  @ApiOperation({ summary: 'Get list of conversations' })
  async getConversations(
    @Request() req,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    const userId = req.user.id;
    return this.conversationService.getUserConversations(
      userId,
      cursor,
      limit ? +limit : 20,
    );
  }
}
