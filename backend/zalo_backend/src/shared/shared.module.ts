import { Module } from '@nestjs/common';
import { NotBlockedGuard } from './guards/not-blocked.guard';
import { AuthorizationModule } from '@modules/authorization/authorization.module';

/**
 * SharedModule (PHASE 2 - Uses AuthorizationModule)
 *
 * EXPORTS:
 *   - AuthorizationModule (InteractionAuthorizationService, InteractionGuard)
 *   - NotBlockedGuard: Block-only check (uses InteractionAuthorizationService.isBlocked)
 */
@Module({
  imports: [AuthorizationModule],
  providers: [NotBlockedGuard],
  exports: [AuthorizationModule, NotBlockedGuard],
})
export class SharedModule {}
