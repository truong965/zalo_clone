import {
  Controller,
  Get,
  Delete,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
  Logger,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUserId } from 'src/common/decorator/customize';
import { ConversationService } from '../conversation/services/conversation.service';
import { AiProxyService } from './ai-proxy.service';
import { AiTriggerDto, AiTriggerType } from './dto/ai-trigger.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiProxyController {
  private readonly logger = new Logger(AiProxyController.name);

  constructor(
    private readonly aiProxyService: AiProxyService,
    private readonly conversationService: ConversationService,
  ) {}

  @Post('translate')
  @HttpCode(HttpStatus.ACCEPTED)
  async translate(@Body() dto: AiTriggerDto, @CurrentUserId() userId: string) {
    const enriched = await this.aiProxyService.prepareTranslateTrigger(
      { ...dto, type: AiTriggerType.TRANSLATE },
      userId,
    );

    return this.triggerAi(enriched, userId);
  }

  @Post('summary')
  @HttpCode(HttpStatus.ACCEPTED)
  async summary(@Body() dto: AiTriggerDto, @CurrentUserId() userId: string) {
    return this.triggerAi({ ...dto, type: AiTriggerType.SUMMARY }, userId);
  }

  @Post('ask')
  @HttpCode(HttpStatus.ACCEPTED)
  async ask(@Body() dto: AiTriggerDto, @CurrentUserId() userId: string) {
    return this.triggerAi({ ...dto, type: AiTriggerType.ASK }, userId);
  }

  @Post('agent')
  @HttpCode(HttpStatus.ACCEPTED)
  async agent(@Body() dto: AiTriggerDto, @CurrentUserId() userId: string) {
    return this.triggerAi({ ...dto, type: AiTriggerType.AGENT }, userId);
  }

  @Get('sessions')
  async listSessions(
    @Query() query: Record<string, string>,
    @CurrentUserId() userId: string,
  ) {
    return this.aiProxyService.listSessions(userId, query);
  }

  @Get('sessions/:id')
  async getSession(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() userId: string,
  ) {
    return this.aiProxyService.getSession(userId, id);
  }

  @Delete('sessions/:id')
  async deleteSession(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUserId() userId: string,
  ) {
    return this.aiProxyService.deleteSession(userId, id);
  }

  /**
   * Internal helper to handle AI triggering after endpoint-specific validation
   */
  private async triggerAi(dto: AiTriggerDto, userId: string) {
    this.logger.log(`User ${userId} triggering AI ${dto.type} for conversation ${dto.conversationId}`);

    // 1. Security Check: Ensure user belongs to the conversation
    const isMember = await this.conversationService.isMember(dto.conversationId, userId);
    if (!isMember) {
      this.logger.warn(`User ${userId} attempted to trigger AI for conversation ${dto.conversationId} without membership.`);
      throw new ForbiddenException('You do not have access to this conversation.');
    }

    // 2. Forward request to AI Service
    return this.aiProxyService.triggerAi(dto, userId);
  }
}
