// src/modules/media/controllers/media-internal.controller.ts
import { Controller, Post, Body, UseGuards, Logger, HttpCode, HttpStatus } from '@nestjs/common';
import { InternalAuthGuard } from 'src/common/guards/internal-auth.guard';
import { SocketGateway } from 'src/socket/socket.gateway';
import { Public } from 'src/common/decorator/customize';

@Controller('internal/media')
@Public() // Bypass global JwtAuthGuard — this endpoint uses InternalAuthGuard (x-api-key) instead
@UseGuards(InternalAuthGuard)
export class MediaInternalController {
  private readonly logger = new Logger(MediaInternalController.name);

  constructor(private readonly socketGateway: SocketGateway) {}

  @Post('broadcast')
  @HttpCode(HttpStatus.OK)
  async broadcastProgress(
    @Body() body: { userId: string; event: string; payload: any }
  ) {
    const { userId, event, payload } = body;
    this.logger.debug(`Received internal broadcast for user ${userId}, event: ${event}`);
    
    // Pass the payload directly to the user via SocketGateway
    void this.socketGateway.emitToUser(userId, event, payload);
    
    return { success: true };
  }
}
