import { registerAs } from '@nestjs/config';

export interface BlockRateLimitConfig {
  maxBlocksPerMinute: number;
  maxUnblocksPerMinute: number;
  cleanupThreshold: number;
}

export interface BlockConfig {
  rateLimit: BlockRateLimitConfig;
}

/**
 * Block Module Configuration (Module-Specific)
 *
 * NOTE: This is NOT a global config. It's only used by BlockModule.
 * If other modules need similar rate limiting, they should have their own config.
 *
 * Environment variables:
 * - BLOCK_RATE_LIMIT_BLOCKS_PER_MIN (default: 10)
 * - BLOCK_RATE_LIMIT_UNBLOCKS_PER_MIN (default: 20)
 * - BLOCK_RATE_LIMIT_CLEANUP_THRESHOLD (default: 10000)
 */
export default registerAs(
  'block',
  (): BlockConfig => ({
    rateLimit: {
      maxBlocksPerMinute: parseInt(
        process.env.BLOCK_RATE_LIMIT_BLOCKS_PER_MIN || '10',
        10,
      ),
      maxUnblocksPerMinute: parseInt(
        process.env.BLOCK_RATE_LIMIT_UNBLOCKS_PER_MIN || '20',
        10,
      ),
      cleanupThreshold: parseInt(
        process.env.BLOCK_RATE_LIMIT_CLEANUP_THRESHOLD || '10000',
        10,
      ),
    },
  }),
);
