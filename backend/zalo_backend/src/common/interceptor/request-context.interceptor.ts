import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Observable } from 'rxjs';
import { RequestContextService } from '@common/context/request-context.service';
import { ClsService } from 'nestjs-cls';

interface HttpRequestWithHeaders {
  headers: Record<string, string | string[] | undefined>;
}

interface HttpResponseWithHeaders {
  setHeader(name: string, value: string): void;
}

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestContextInterceptor.name);

  constructor(
    private readonly requestContext: RequestContextService,
    private readonly cls: ClsService,
  ) { }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<HttpRequestWithHeaders>();
    const response = context
      .switchToHttp()
      .getResponse<HttpResponseWithHeaders>();

    const requestId = this.resolveRequestId(request.headers['x-request-id']);

    // Wrap CLS operations in a try-catch to handle cases where CLS context is not yet initialized
    try {
      this.requestContext.setRequestId(requestId);
    } catch (error) {
      // If CLS context is not available, run within CLS context
      this.logger.debug(
        'CLS context not available in interceptor, wrapping in ClsService.run()',
      );
      return this.cls.run(() => {
        this.requestContext.setRequestId(requestId);
        response.setHeader('x-request-id', requestId);
        return next.handle();
      });
    }

    response.setHeader('x-request-id', requestId);
    return next.handle();
  }

  private resolveRequestId(rawHeader: string | string[] | undefined): string {
    if (typeof rawHeader === 'string' && rawHeader.trim().length > 0) {
      return rawHeader.trim();
    }

    if (Array.isArray(rawHeader) && rawHeader.length > 0) {
      const firstHeader = rawHeader[0]?.trim();
      if (firstHeader) {
        return firstHeader;
      }
    }

    return randomUUID();
  }
}