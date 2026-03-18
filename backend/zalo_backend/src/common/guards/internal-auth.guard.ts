// src/common/guards/internal-auth.guard.ts
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Inject,
  Logger,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import workerConfig from '../../config/worker.config';

@Injectable()
export class InternalAuthGuard implements CanActivate {
  private readonly logger = new Logger(InternalAuthGuard.name);

  constructor(
    @Inject(workerConfig.KEY)
    private readonly config: ConfigType<typeof workerConfig>,
  ) { }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    // Check against the worker service's API key
    const expectedKey = this.config.internalApiKey;

    if (!apiKey || apiKey !== expectedKey) {
      this.logger.debug(
        `[InternalAuthGuard] Invalid API key: received ${apiKey ? apiKey.substring(0, 6) + '...' : 'none'}`,
      );
      throw new UnauthorizedException('Invalid or missing internal API key');
    }

    return true;
  }
}
