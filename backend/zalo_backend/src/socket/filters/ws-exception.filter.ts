import { Catch, ArgumentsHost, Logger } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import { AuthenticatedSocket } from 'src/common/interfaces/socket-client.interface';

/**
 * Global exception filter for WebSocket
 * Prevents server crash and standardizes error responses
 */
@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
  private readonly logger = new Logger(WsExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<AuthenticatedSocket>();

    const data = host.switchToWs().getData<unknown>();

    // An toàn lấy tên event (nếu có) để log
    // Kiểm tra xem data có phải là object và có thuộc tính 'event' hay không
    const eventName =
      typeof data === 'object' && data !== null && 'event' in data
        ? (data as { event: string }).event
        : 'unknown_event';

    // Log error with context
    this.logger.error('WebSocket Error:', {
      socketId: client.id,
      userId: client.userId,
      event: eventName,
      error: exception instanceof Error ? exception.message : String(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
    });

    // Build error response
    const errorResponse = this.buildErrorResponse(exception);

    // Emit error to client
    client.emit(SocketEvents.ERROR, errorResponse);

    // Don't propagate to base class to prevent crash
    // super.catch(exception, host);
  }

  /**
   * Build standardized error response
   */
  private buildErrorResponse(exception: unknown): {
    event: string;
    message: string;
    code?: string;
    timestamp: string;
  } {
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof WsException) {
      message = exception.message;
      code = 'WS_EXCEPTION';
    } else if (exception instanceof Error) {
      message = exception.message;
      code = exception.name || 'ERROR';
    }

    return {
      event: SocketEvents.ERROR,
      message,
      code,
      timestamp: new Date().toISOString(),
    };
  }
}
