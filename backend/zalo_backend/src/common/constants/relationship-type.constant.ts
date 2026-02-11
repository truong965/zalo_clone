/**
 * RelationshipType Enum (Phase C: TD-15)
 *
 * Universal relationship classification between two users.
 * Moved from search_engine/utils/ranking.util.ts to common/constants
 * for reuse across modules (block, privacy, messaging, search).
 *
 * Maps to Prisma's FriendshipStatus enum with an additional BLOCKED state.
 */
export enum RelationshipType {
  FRIEND = 'FRIEND',
  REQUEST_PENDING = 'REQUEST_PENDING',
  NONE = 'NONE',
  BLOCKED = 'BLOCKED',
}
