import { Catch, ArgumentsHost, Logger, HttpException } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import { AuthenticatedSocket } from 'src/common/interfaces/socket-client.interface';

/**
 * Interface định nghĩa cấu trúc lỗi trả về từ WsException
 * (Thường gặp khi dùng ValidationPipe)
 */
interface WsErrorResponse {
  message?: string | string[];
  error?: string;
  statusCode?: number;
  details?: unknown;
}

@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
  private readonly logger = new Logger(WsExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const client = host.switchToWs().getClient<AuthenticatedSocket>();
    const data = host.switchToWs().getData<unknown>();

    // 1. Extract Context Info
    const eventName = this.extractEventName(data);

    // Fix access an toàn cho headers
    const headers = client.handshake?.headers || {};
    const clientIp = headers['x-forwarded-for'] || client.handshake?.address;
    const userAgent = headers['user-agent'] || 'unknown';

    // 2. Build Error Response
    const errorResponse = this.buildErrorResponse(exception);

    // 3. Prepare Log Context
    // FIX 1: Định nghĩa type rõ ràng cho logContext để tránh "unsafe assignment"
    const logContext: Record<string, unknown> = {
      socketId: client.id,
      userId: client.userId || 'anonymous',
      event: eventName,
      ip: clientIp,
      userAgent: userAgent,
      error: errorResponse.message, // Có thể là string hoặc object
      errorCode: errorResponse.code,
      stack: exception instanceof Error ? exception.stack : undefined,
      timestamp: new Date().toISOString(),
    };

    // FIX 2: Xử lý sanitizePayload an toàn kiểu
    const sanitizedPayload = this.sanitizePayload(data);
    if (sanitizedPayload) {
      logContext.payload = sanitizedPayload;
    }

    // FIX 3: Xử lý log message để tránh lỗi "[object Object]"
    // Nếu message là object (Validation error), ta stringify nó để log dễ đọc
    const logMessage =
      typeof errorResponse.message === 'string'
        ? errorResponse.message
        : JSON.stringify(errorResponse.message);

    // 4. Intelligent Logging
    if (errorResponse.code === 'INTERNAL_ERROR') {
      this.logger.error(`WebSocket Error [${eventName}]`, logContext);
    } else {
      // Sử dụng logMessage đã xử lý
      this.logger.warn(
        `WebSocket Warning [${eventName}]: ${logMessage}`,
        logContext,
      );
    }

    // 5. Emit standardized error to client
    client.emit(SocketEvents.ERROR, errorResponse);
  }

  /**
   * Safe event name extraction
   */
  private extractEventName(data: unknown): string {
    if (typeof data === 'object' && data !== null && 'event' in data) {
      return (data as { event: string }).event;
    }
    return 'unknown_event';
  }

  /**
   * Sanitize payload (Fix lỗi Unsafe Return)
   * Trả về kiểu unknown hoặc Record cụ thể, không trả về any
   */
  private sanitizePayload(data: unknown): Record<string, unknown> | null {
    if (!data) return null;
    if (typeof data !== 'object') return { data: JSON.stringify(data) };

    // Ép kiểu an toàn sang Record để xử lý
    const sanitized = { ...(data as Record<string, unknown>) };

    const sensitiveKeys = ['password', 'token', 'accessToken', 'refreshToken'];
    sensitiveKeys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(sanitized, key)) {
        sanitized[key] = '***MASKED***';
      }
    });

    return sanitized;
  }

  /**
   * Build standardized error response
   */
  private buildErrorResponse(exception: unknown): {
    event: string;
    message: string | object;
    code: string;
    timestamp: string;
    details?: unknown;
  } {
    let message: string | object = 'Internal server error';
    let code = 'INTERNAL_ERROR';
    let details: unknown = null;

    if (exception instanceof WsException) {
      // FIX 4: Ép kiểu an toàn cho object lỗi từ WsException
      const errorResult = exception.getError();
      code = 'WS_EXCEPTION';

      if (typeof errorResult === 'string') {
        message = errorResult;
      } else if (typeof errorResult === 'object' && errorResult !== null) {
        // Ép kiểu về Interface đã định nghĩa ở trên
        const wsError = errorResult as WsErrorResponse;
        message = wsError.message || 'Unknown WS Exception';
        details = wsError.details || wsError; // Lấy details hoặc lấy cả cục error làm details
      }
    } else if (exception instanceof HttpException) {
      message = exception.message;
      code = 'HTTP_EXCEPTION';
    } else if (exception instanceof Error) {
      message = exception.message;
      code = exception.name || 'INTERNAL_ERROR';
    }

    return {
      event: SocketEvents.ERROR,
      message,
      code,
      details,
      timestamp: new Date().toISOString(),
    };
  }
}
