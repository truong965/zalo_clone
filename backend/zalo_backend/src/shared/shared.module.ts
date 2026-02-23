import { Module } from '@nestjs/common';
import { DisplayNameResolver } from './services/display-name-resolver.service';

/**
 * SharedModule — Leaf cross-cutting module.
 *
 * Intentionally has NO feature module imports to prevent circular dependencies.
 * (AuthorizationModule → BlockModule/FriendshipModule → SharedModule must not cycle back)
 *
 * EXPORTS:
 *   - DisplayNameResolver: 3-level display name resolution (aliasName > phoneBookName > displayName)
 *
 * Guards:
 *   - NotBlockedGuard is exported by AuthorizationModule (its natural home).
 *     Modules needing it should import AuthorizationModule directly.
 */
@Module({
  providers: [DisplayNameResolver],
  exports: [DisplayNameResolver],
})
export class SharedModule { }
