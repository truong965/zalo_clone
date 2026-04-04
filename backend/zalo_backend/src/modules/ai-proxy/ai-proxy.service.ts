import {
  Injectable,
  Logger,
  Inject,
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import type { ConfigType } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import aiConfig from '../../config/ai.config';
import { AiTriggerDto } from './dto/ai-trigger.dto';
import { PrismaService } from 'src/database/prisma.service';

@Injectable()
export class AiProxyService {
  private readonly logger = new Logger(AiProxyService.name);
  private readonly requestTimeoutMs = 30000;

  constructor(
    private readonly httpService: HttpService,
    private readonly prisma: PrismaService,
    @Inject(aiConfig.KEY)
    private readonly config: ConfigType<typeof aiConfig>,
  ) {}

  async prepareTranslateTrigger(dto: AiTriggerDto, userId: string): Promise<AiTriggerDto> {
    if (!dto.messageId) {
      throw new BadRequestException('messageId is required for translation enrichment');
    }

    const messageId = this.parseMessageId(dto.messageId);
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        conversationId: true,
        content: true,
        deletedAt: true,
      },
    });

    if (!message || message.deletedAt) {
      throw new NotFoundException('Message not found');
    }

    if (message.conversationId !== dto.conversationId) {
      throw new BadRequestException('messageId does not belong to the target conversation');
    }

    if (!message.content || !message.content.trim()) {
      throw new BadRequestException('Message content is empty');
    }

    this.logger.debug(
      `Resolved translation payload from message ${dto.messageId} for user ${userId}`,
    );

    return {
      ...dto,
      text: message.content,
    };
  }

  async triggerAi(dto: AiTriggerDto, userId: string) {
    return this.request('post', '/bot/trigger', { ...dto, userId }, dto.requestId);
  }

  async cancelAiStream(requestId: string, userId: string, conversationId?: string) {
    if (!requestId) {
      throw new BadRequestException('requestId is required for cancellation');
    }
    this.logger.log(`User ${userId} requested AI cancellation for: ${requestId}`);
    return this.request('post', '/bot/cancel', { requestId, userId, conversationId }, requestId);
  }

  async listSessions(
    userId: string,
    query: {
      conversationId?: string;
      featureType?: string;
      activeOnly?: string;
      limit?: string;
      offset?: string;
    },
    requestId?: string,
  ) {
    return this.request('get', '/sessions', undefined, requestId, {
      userId,
      conversationId: query.conversationId,
      featureType: query.featureType,
      activeOnly: query.activeOnly,
      limit: query.limit,
      offset: query.offset,
    });
  }

  async getSession(userId: string, sessionId: string, requestId?: string) {
    return this.request('get', `/sessions/${sessionId}`, undefined, requestId, {
      userId,
    });
  }

  async deleteSession(userId: string, sessionId: string, requestId?: string) {
    return this.request('delete', `/sessions/${sessionId}`, undefined, requestId, {
      userId,
    });
  }

  private parseMessageId(messageId: string): bigint {
    try {
      return BigInt(messageId);
    } catch {
      throw new BadRequestException('Invalid messageId');
    }
  }

  private async request(
    method: 'get' | 'post' | 'delete',
    path: string,
    data?: any,
    requestId?: string,
    params?: Record<string, string | undefined>,
  ) {
    const url = `${this.config.baseUrl}${path}`;
    const keyPrefix = this.config.apiKey ? `${this.config.apiKey.substring(0, 5)}***` : 'MISSING';
    try {
      const response = await lastValueFrom(
        this.httpService.request({
          method,
          url,
          data,
          params,
          timeout: this.requestTimeoutMs,
          headers: {
            'x-internal-api-key': this.config.apiKey,
            'x-request-id': requestId,
            'Content-Type': 'application/json',
          },
        }),
      );

      return response.data;
    } catch (err: any) {
      let status = err.response?.status || HttpStatus.SERVICE_UNAVAILABLE;
      const data = err.response?.data || { message: 'Internal AI Service Error' };

      // If AI service returns 401/403, map it to 502 so frontend doesn't log out user
      // This happens when INTERNAL_API_KEY is mismatched or AI service auth fails
      if (status === HttpStatus.UNAUTHORIZED || status === HttpStatus.FORBIDDEN) {
        this.logger.error(
          `AI service authentication failed (Internal API Key mismatch?): ${status}`,
        );
        status = HttpStatus.BAD_GATEWAY;
      }

      this.logger.error(`AI Proxy request failed [${status}]: ${err.message}`);
      throw new HttpException(data, status);
    }
  }
}
