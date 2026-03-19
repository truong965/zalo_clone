import { Catch, ArgumentsHost, Logger, HttpException } from '@nestjs/common';
import { BaseWsExceptionFilter, WsException } from '@nestjs/websockets';
import { SocketEvents } from 'src/common/constants/socket-events.constant';
import { AuthenticatedSocket } from 'src/common/interfaces/socket-client.interface';
import { safeStringify } from 'src/common/utils/json.util';

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

            const pattern = host.switchToWs().getPattern?.() as string | undefined;
            const eventName = pattern || this.extractEventName(data);

            const headers = client.handshake?.headers || {};
            const clientIp = headers['x-forwarded-for'] || client.handshake?.address;
            const userAgent = headers['user-agent'] || 'unknown';

            const errorResponse = this.buildErrorResponse(exception);

            const logContext: Record<string, unknown> = {
                  socketId: client.id,
                  userId: client.userId || 'anonymous',
                  event: eventName,
                  ip: clientIp,
                  userAgent,
                  error: errorResponse.message,
                  errorCode: errorResponse.code,
                  stack: exception instanceof Error ? exception.stack : undefined,
                  timestamp: new Date().toISOString(),
            };

            const sanitizedPayload = this.sanitizePayload(data);
            if (sanitizedPayload) {
                  logContext.payload = sanitizedPayload;
            }

            const logMessage =
                  typeof errorResponse.message === 'string'
                        ? errorResponse.message
                        : safeStringify(errorResponse.message);

            if (errorResponse.code === 'INTERNAL_ERROR') {
                  this.logger.error(`WebSocket Error [${eventName}]`, logContext);
            } else {
                  this.logger.warn(
                        `WebSocket Warning [${eventName}]: ${logMessage}`,
                        logContext,
                  );
            }

            const args = host.getArgs();
            const ackCallback = args.find((arg) => typeof arg === 'function');
            const hasAckCallback = !!ackCallback;

            const clientMessageId =
                  data && typeof data === 'object' && 'clientMessageId' in data
                        ? (data as Record<string, unknown>).clientMessageId
                        : undefined;

            if (hasAckCallback) {
                  // If frontend used emitWithAck (callback provided), send the error back via ack
                  ackCallback({
                        error: typeof errorResponse.message === 'string'
                              ? errorResponse.message
                              : errorResponse.code
                  });
            } else {
                  // Fallback: emit global ERROR event
                  client.emit(SocketEvents.ERROR, {
                        ...errorResponse,
                        event: eventName,
                        ...(clientMessageId ? { clientMessageId } : {}),
                  });
            }
      }

      private extractEventName(data: unknown): string {
            if (typeof data === 'object' && data !== null && 'event' in data) {
                  return (data as { event: string }).event;
            }
            return 'unknown_event';
      }

      private sanitizePayload(data: unknown): Record<string, unknown> | null {
            if (!data) return null;
            if (typeof data !== 'object') return { data: safeStringify(data) };

            const sanitized = { ...(data as Record<string, unknown>) };
            const sensitiveKeys = ['password', 'token', 'accessToken', 'refreshToken'];
            sensitiveKeys.forEach((key) => {
                  if (Object.prototype.hasOwnProperty.call(sanitized, key)) {
                        sanitized[key] = '***MASKED***';
                  }
            });

            return sanitized;
      }

      private buildErrorResponse(exception: unknown): {
            message: string | object;
            code: string;
            timestamp: string;
            details?: unknown;
      } {
            let message: string | object = 'Internal server error';
            let code = 'INTERNAL_ERROR';
            let details: unknown = null;

            if (exception instanceof WsException) {
                  const errorResult = exception.getError();
                  code = 'WS_EXCEPTION';

                  if (typeof errorResult === 'string') {
                        message = errorResult;
                  } else if (typeof errorResult === 'object' && errorResult !== null) {
                        const wsError = errorResult as WsErrorResponse;
                        message = wsError.message || 'Unknown WS Exception';
                        details = wsError.details || wsError;
                  }
            } else if (exception instanceof HttpException) {
                  message = exception.message;
                  code = 'HTTP_EXCEPTION';
            } else if (exception instanceof Error) {
                  message = exception.message;
                  code = exception.name || 'INTERNAL_ERROR';
            }

            return {
                  message,
                  code,
                  details,
                  timestamp: new Date().toISOString(),
            };
      }
}
