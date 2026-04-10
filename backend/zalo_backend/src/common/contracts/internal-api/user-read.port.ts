import { UserStatus } from '@prisma/client';

export const USER_READ_PORT = Symbol('USER_READ_PORT');

export interface IUserReadPort {
  /**
   * Get the current status of a user.
   * Internal common interface to prevent circular dependency between Auth/Users.
   */
  getUserStatus(userId: string): Promise<UserStatus | null>;
}
