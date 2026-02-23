import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BlockModule } from '@modules/block/block.module';
import { PrivacyModule } from '@modules/privacy/privacy.module';
import { FriendshipModule } from '@modules/friendship/friendship.module';
import { InteractionAuthorizationService } from './services/interaction-authorization.service';
import { InteractionGuard } from './guards/interaction.guard';
import { NotBlockedGuard } from '@shared/guards/not-blocked.guard';

/**
 * AuthorizationModule - PHASE 2
 *
 * Centralized authorization for user interactions.
 * Implements canInteract(requesterId, targetId, action).
 *
 * Dependencies (no circular):
 * - BlockModule: BLOCK_CHECKER (BlockCheckerService)
 * - PrivacyModule: PrivacyService (getSettings)
 * - FriendshipModule: FriendshipService (areFriends)
 *
 * Note: FriendshipModule does NOT import AuthorizationModule.
 * For friend_request, FriendshipService uses IBlockChecker from BlockModule directly.
 *
 * NotBlockedGuard lives here (not in SharedModule) to avoid circular dependency:
 *   SharedModule ← BlockModule/FriendshipModule ← AuthorizationModule ← SharedModule (cycle broken)
 */
@Module({
  imports: [ConfigModule, BlockModule, PrivacyModule, FriendshipModule],
  providers: [InteractionAuthorizationService, InteractionGuard, NotBlockedGuard],
  exports: [InteractionAuthorizationService, InteractionGuard, NotBlockedGuard],
})
export class AuthorizationModule { }
