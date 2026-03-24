export const FRIENDSHIP_READ_PORT = Symbol('FRIENDSHIP_READ_PORT');

/**
 * Read-only friendship contract exposed for cross-domain usage.
 */
export interface IFriendshipReadPort {
  /**
   * Check if two users are currently friends.
   */
  areFriends(userId1: string, userId2: string): Promise<boolean>;

  /**
   * Resolve all friend IDs of a user for presence fanout use cases.
   */
  getFriendIdsForPresence(userId: string): Promise<string[]>;
}
