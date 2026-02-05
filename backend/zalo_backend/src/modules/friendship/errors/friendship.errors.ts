import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base Exception for Friendship Module
 */
export class FriendshipException extends HttpException {
  constructor(message: string, status: HttpStatus) {
    super(message, status);
  }
}

// --- FRIENDSHIP-SPECIFIC EXCEPTIONS ---

export class FriendshipRequiredException extends FriendshipException {
  constructor() {
    super('This action requires friendship', HttpStatus.FORBIDDEN);
  }
}

export class FriendshipNotFoundException extends FriendshipException {
  constructor(message = 'Friendship not found') {
    super(message, HttpStatus.NOT_FOUND);
  }
}

export class DuplicateRequestException extends FriendshipException {
  constructor(message = 'Friend request already exists') {
    super(message, HttpStatus.CONFLICT);
  }
}

export class InvalidFriendshipStateException extends FriendshipException {
  constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

// --- COMMON LOGIC EXCEPTIONS ---

export class SelfActionException extends FriendshipException {
  constructor(message = 'Cannot perform this action on yourself') {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

export class BlockedException extends FriendshipException {
  constructor(message = 'Interaction restricted due to block') {
    super(message, HttpStatus.FORBIDDEN);
  }
}

export class RateLimitException extends FriendshipException {
  constructor(message = 'Too many requests') {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}

export class FriendRequestLimitException extends RateLimitException {
  constructor(limit: number, period: string, retryAfter: number) {
    super(
      `Friend request limit reached (${limit}/${period}). Retry after ${retryAfter}s`,
    );
  }
}

export class DeclineCooldownException extends FriendshipException {
  constructor(hours: number) {
    super(
      `Cannot resend request. Cooldown period active (${hours}h)`,
      HttpStatus.FORBIDDEN,
    );
  }
}

export class UnblockCooldownException extends FriendshipException {
  constructor(days: number) {
    super(
      `Cannot re-block/friend immediately. Cooldown active (${days} days)`,
      HttpStatus.FORBIDDEN,
    );
  }
}
