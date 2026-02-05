/**
 * IBlockChecker - Block status check interface
 *
 * Used by:
 * - FriendshipService: Check if blocked before sending friend request (avoid circular dep)
 * - InteractionAuthorizationService: canInteract() block check
 *
 * Implementation: BlockCheckerService (BlockModule) with Redis read-through via IBlockRepository.
 */

export const BLOCK_CHECKER = Symbol('BLOCK_CHECKER');

export interface IBlockChecker {
  /**
   * Check if there is a block between two users (either direction).
   * Uses Redis read-through: cache hit → return; cache miss → query DB, populate cache.
   */
  isBlocked(userId1: string, userId2: string): Promise<boolean>;

  /**
   * Check if requester is blocked by target (target has blocked requester).
   * Used for: "Can I interact with this user?" (target's perspective).
   */
  isBlockedByTarget(requesterId: string, targetId: string): Promise<boolean>;
}
