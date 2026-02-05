/**
 * Block Repository Interface
 *
 * Abstraction for block data access.
 * Used by BlockService and BlockCheckerService (AuthorizationModule).
 * Enables read-through cache without direct Prisma dependency in consumers.
 */

import type { Block } from '@prisma/client';

export const BLOCK_REPOSITORY = Symbol('BLOCK_REPOSITORY');

export interface IBlockRepository {
  /**
   * Check if a block exists between two users
   */
  exists(blockerId: string, blockedId: string): Promise<boolean>;

  /**
   * Find block record by user pair (if exists)
   */
  findByPair(blockerId: string, blockedId: string): Promise<Block | null>;
}
