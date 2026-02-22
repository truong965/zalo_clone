/**
 * Barrel re-export for all shared API types.
 *
 * Import from '@/types/api' (resolves to this file when api.ts is deleted)
 * or from '@/types' for the full public surface.
 *
 * Domain files:
 *   common.types.ts       — response wrappers, pagination
 *   auth.types.ts         — user, IAM, device, auth DTOs
 *   social.types.ts       — friendship, blocks, events
 *   messaging.types.ts    — messages, receipts, media items
 *   conversation.types.ts — conversation, group membership, ConversationUI
 *   media.types.ts        — media upload & processing
 *   system.types.ts       — calls, socket connections, domain events
 */

export * from './common.types';
export * from './auth.types';
export * from './social.types';
export * from './media.types';
export * from './messaging.types';
export * from './conversation.types';
export * from './system.types';
