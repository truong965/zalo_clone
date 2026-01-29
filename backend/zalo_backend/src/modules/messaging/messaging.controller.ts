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
  async sendMessage(@Request() req, @Body() dto: SendMessageDto) {
    const userId = req.user.id;
    return this.messageService.sendMessage(dto, userId);
  }

  /**
   * Get messages with pagination
   */
  @Get()
  async getMessages(@Request() req, @Query() dto: GetMessagesDto) {
    const userId = req.user.id;
    return this.messageService.getMessages(dto, userId);
  }

  /**
   * Delete message
   */
  @Delete(':messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMessage(
    @Request() req,
    @Param('messageId') messageId: string,
    @Query('deleteForEveryone', new ParseBoolPipe({ optional: true }))
    deleteForEveryone: boolean = false,
  ) {
    const userId = req.user.id;
    await this.messageService.deleteMessage(
      BigInt(messageId),
      userId,
      deleteForEveryone,
    );
  }

  /**
   * Get or create direct conversation
   */
  @Post('conversations/direct')
  async getOrCreateDirectConversation(
    @Request() req,
    @Body() body: { recipientId: string },
  ) {
    const userId = req.user.id;
    return this.conversationService.getOrCreateDirectConversation(
      userId,
      body.recipientId,
    );
  }
}
