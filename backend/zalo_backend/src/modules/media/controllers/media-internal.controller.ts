// src/modules/media/controllers/media-internal.controller.ts
import {
  Controller,
  Post,
  Body,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { InternalAuthGuard } from 'src/common/guards/internal-auth.guard';
import { SocketGateway } from 'src/socket/socket.gateway';
import { Public } from 'src/common/decorator/customize';

/**
 * Internal API Controller for Media Module
 *
 * Routes registered WITHOUT global /api/v1 prefix.
 * Access via: /internal/media/* (not /api/v1/internal/media/*)
 *
 * This controller is designated for **internal service-to-service communication**
 * (e.g., Media Worker → Backend). It uses InternalAuthGuard (x-api-key)
 * instead of JWT authentication.
 *
 * Protection: InternalAuthGuard (x-api-key header)
 * Prefix: /internal/media (no api/v1 prefix)
 */
@Controller('media')
@Public() // Bypass global JwtAuthGuard — this endpoint uses InternalAuthGuard (x-api-key) instead
@UseGuards(InternalAuthGuard)
export class MediaInternalController {
  private readonly logger = new Logger(MediaInternalController.name);

  constructor(private readonly socketGateway: SocketGateway) { }

  @Post('broadcast')
  @HttpCode(HttpStatus.OK)
  async broadcastProgress(
    @Body() body: { userId: string; event: string; payload: any },
  ) {
    const { userId, event, payload } = body;
    this.logger.debug(
      `Received internal broadcast for user ${userId}, event: ${event}`,
    );
    // Pass the payload directly to the user via SocketGateway
    void this.socketGateway.emitToUser(userId, event, payload);

    return { success: true };
  }
}
