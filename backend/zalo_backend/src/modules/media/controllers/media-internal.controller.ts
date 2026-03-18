// src/modules/media/controllers/media-internal.controller.ts
import {
  Controller,
  Post,
  Body,
  UseGuards,
  Logger,
  HttpCode,
  HttpStatus,
  Version,
  VERSION_NEUTRAL,
  BadRequestException,
} from '@nestjs/common';
import { InternalAuthGuard } from 'src/common/guards/internal-auth.guard';
import { SocketGateway } from 'src/socket/socket.gateway';
import { Public } from 'src/common/decorator/customize';

/**
 * Internal API Controller for Media Module
 *
 * Routes registered WITHOUT global /api/v1 prefix.
 * Access via: /internal/media/* (not /api/v1/internal/media/*)`
 *
 * This controller is designated for **internal service-to-service communication**
 * (e.g., Media Worker → Backend). It uses InternalAuthGuard (x-api-key)
 * instead of JWT authentication.
 *
 * Protection: InternalAuthGuard (x-api-key header)
 * Prefix: /internal/media (no api/v1 prefix)
 */
@Controller({
  path: 'internal/media',
  version: VERSION_NEUTRAL,
})
@Public()
@UseGuards(InternalAuthGuard)
export class MediaInternalController {
  private readonly logger = new Logger(MediaInternalController.name);

  constructor(private readonly socketGateway: SocketGateway) {}

  /**
   * Broadcast media processing updates to connected users.
   * Called by the media worker to notify clients when image/video processing is complete.
   *
   * @param payload - {userId, event, payload} - User to notify, event name, and event data
   * @returns Success response
   */
  @Post('broadcast')
  @HttpCode(HttpStatus.OK)
  async broadcastProgress(
    @Body()
    payload: {
      userId: string;
      event: string;
      payload: Record<string, any>;
    },
  ): Promise<{ success: boolean }> {
    const { userId, event, payload: eventPayload } = payload;

    if (!userId || !event) {
      throw new BadRequestException('Missing userId or event in broadcast payload');
    }

    try {
      this.logger.debug(
        `[MediaInternalController] Broadcasting ${event} to user ${userId}`,
      );

      // Emit to user's connected sockets via Socket.IO gateway
      await this.socketGateway.emitToUser(userId, event, eventPayload);

      return { success: true };
    } catch (error) {
      this.logger.error(
        `[MediaInternalController] Failed to broadcast: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
