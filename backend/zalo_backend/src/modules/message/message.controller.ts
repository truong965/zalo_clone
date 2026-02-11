import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  ParseBoolPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { MessageService } from './services/message.service';
import { SendMessageDto } from './dto/send-message.dto';
import { GetMessagesDto } from './dto/get-messages.dto';
import { CurrentUser } from 'src/common/decorator/customize';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('messages')
@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessageController {
  constructor(private readonly messageService: MessageService) { }

  @Post()
  @ApiOperation({ summary: 'Send message via HTTP (fallback)' })
  async sendMessage(@CurrentUser() user, @Body() dto: SendMessageDto) {
    return this.messageService.sendMessage(dto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get messages with pagination' })
  async getMessages(@CurrentUser() user, @Query() dto: GetMessagesDto) {
    return this.messageService.getMessages(dto, user.id);
  }

  @Get('context')
  @ApiOperation({
    summary: 'Get messages around a target message (jump-to-message)',
  })
  getMessageContext(
    @CurrentUser() user,
    @Query('conversationId') conversationId: string,
    @Query('messageId') messageId: string,
    @Query('before') before?: string,
    @Query('after') after?: string,
  ) {
    return this.messageService.getMessagesContext(
      conversationId,
      messageId,
      user.id as string,
      before ? parseInt(before, 10) : 25,
      after ? parseInt(after, 10) : 25,
    );
  }

  @Delete(':messageId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete message' })
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
}
