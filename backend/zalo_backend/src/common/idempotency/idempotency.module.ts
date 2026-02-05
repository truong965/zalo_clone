import { Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';

/**
 * PHASE 3.3: IdempotencyModule
 *
 * Provides IdempotencyService as a shared module
 * Used by event handlers to ensure idempotency
 *
 * Imports:
 *   - PrismaService (via DATABASE_MODULE)
 *
 * Exports:
 *   - IdempotencyService (injectable)
 *
 * Usage in other modules:
 *   imports: [IdempotencyModule]
 *
 * Then inject in handlers:
 *   constructor(private idempotency: IdempotencyService) {}
 */
@Module({
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
