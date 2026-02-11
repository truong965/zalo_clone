import {
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';

/**
 * Shared error handler for all search services (Phase B: TD-08).
 *
 * Eliminates the copy-pasted `handleError()` method from:
 * - MessageSearchService
 * - ContactSearchService
 * - GlobalSearchService
 *
 * Provides consistent error classification and logging across all search operations.
 */
export class SearchErrorHandler {
  /**
   * Classify and re-throw errors with consistent logic.
   *
   * Error classification:
   * 1. Known HTTP exceptions (Forbidden, BadRequest) → re-throw as-is
   * 2. Access-related messages → ForbiddenException
   * 3. Validation-related messages → BadRequestException
   * 4. Unknown errors → BadRequestException with generic message
   *
   * @param error - The caught error (unknown type)
   * @param context - Human-readable operation name for logging (e.g., 'Message search', 'Contact search')
   * @param logger - Optional NestJS Logger instance for structured logging
   */
  static handle(error: unknown, context: string, logger?: Logger): never {
    // 1. Re-throw known NestJS HTTP exceptions
    if (error instanceof ForbiddenException) {
      throw error;
    }

    if (error instanceof BadRequestException) {
      throw error;
    }

    // 2. Extract error message safely (TD-10: type-safe access)
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';

    // 3. Classify by message content
    if (
      errorMessage.includes('No access') ||
      errorMessage.includes('not a member') ||
      errorMessage.includes('blocked')
    ) {
      throw new ForbiddenException(errorMessage);
    }

    if (
      errorMessage.includes('empty') ||
      errorMessage.includes('exceeds') ||
      errorMessage.includes('not found')
    ) {
      throw new BadRequestException(errorMessage);
    }

    // 4. Log unexpected errors with structured logging
    if (logger) {
      logger.error(
        `${context} failed: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    throw new BadRequestException(`${context} failed: ${errorMessage}`);
  }
}
