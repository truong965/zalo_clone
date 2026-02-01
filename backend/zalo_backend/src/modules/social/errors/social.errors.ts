import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Base Exception for Social Graph Module
 */
export class SocialGraphException extends HttpException {
  constructor(message: string, status: HttpStatus) {
    super(message, status);
  }
}

// --- PRIVACY EXCEPTIONS ---

export class PrivacySettingsNotFoundException extends SocialGraphException {
  constructor(userId: string) {
    super(
      `Privacy settings not found for user ID: ${userId}`,
      HttpStatus.NOT_FOUND,
    );
  }
}

export class PrivacyViolationException extends SocialGraphException {
  constructor(message = 'User privacy settings do not allow this action') {
    super(message, HttpStatus.FORBIDDEN);
  }
}

// --- BLOCK EXCEPTIONS ---

export class BlockedException extends SocialGraphException {
  constructor(message = 'Interaction restricted due to block') {
    super(message, HttpStatus.FORBIDDEN);
  }
}

// Alias for BlockedException (used in some contexts)
export class UserBlockedException extends BlockedException {}

export class DuplicateBlockException extends SocialGraphException {
  constructor(message = 'User is already blocked') {
    super(message, HttpStatus.CONFLICT);
  }
}

export class BlockNotFoundException extends SocialGraphException {
  constructor(message = 'Block record not found') {
    super(message, HttpStatus.NOT_FOUND);
  }
}

// --- FRIENDSHIP EXCEPTIONS ---

export class FriendshipRequiredException extends SocialGraphException {
  constructor() {
    super('This action requires friendship', HttpStatus.FORBIDDEN);
  }
}

export class FriendshipNotFoundException extends SocialGraphException {
  constructor(message = 'Friendship not found') {
    super(message, HttpStatus.NOT_FOUND);
  }
}

export class DuplicateRequestException extends SocialGraphException {
  constructor(message = 'Friend request already exists') {
    super(message, HttpStatus.CONFLICT);
  }
}

export class InvalidFriendshipStateException extends SocialGraphException {
  constructor(message: string) {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

// --- COMMON LOGIC EXCEPTIONS ---

export class SelfActionException extends SocialGraphException {
  constructor(message = 'Cannot perform this action on yourself') {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

export class RateLimitException extends SocialGraphException {
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

export class DeclineCooldownException extends SocialGraphException {
  constructor(hours: number) {
    super(
      `Cannot resend request. Cooldown period active (${hours}h)`,
      HttpStatus.FORBIDDEN,
    );
  }
}

export class UnblockCooldownException extends SocialGraphException {
  constructor(days: number) {
    super(
      `Cannot re-block/friend immediately. Cooldown active (${days} days)`,
      HttpStatus.FORBIDDEN,
    );
  }
}
