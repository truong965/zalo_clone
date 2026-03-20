import { UseFilters, UseInterceptors, Logger, UseGuards, UsePipes } from '@nestjs/common';
import { WsExceptionFilter } from '../filters/ws-exception.filter';
import { WsTransformInterceptor } from '../interceptor/ws-transform.interceptor';
import { WsThrottleGuard } from '../guards/ws-throttle.guard';
import { WsValidationPipe } from '../pipes/ws-validation.pipe';

@UseFilters(WsExceptionFilter)
@UseInterceptors(WsTransformInterceptor)
@UseGuards(WsThrottleGuard)
@UsePipes(WsValidationPipe)
export abstract class BaseGateway {
  protected abstract readonly logger: Logger;
}
