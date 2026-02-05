/**
 * Cursor-Based Pagination Helper
 *
 * For Infinity Scroll (Mobile, Chat, Newsfeed)
 * Used with CursorPaginationDto and CursorPaginatedResult
 *
 * Key Characteristics:
 * - No offset calculation (O(1) performance)
 * - Suitable for real-time data streams
 * - Handles added/deleted items gracefully
 * - Memory efficient for large datasets
 *
 * Cursor Format: Can be ID (UUID/ULID), timestamp, or Base64 encoded
 *
 * Usage Example:
 * ```
 * const results = await this.prisma.block.findMany({
 *   ...CursorPaginationHelper.buildPrismaParams(limit, cursor),
 *   orderBy: { createdAt: 'desc' }
 * });
 *
 * return CursorPaginationHelper.buildResult({
 *   items: results,
 *   limit,
 *   getCursor: (item) => item.id,
 *   mapToDto: (item) => new BlockedUserDto(item)
 * });
 * ```
 */

import { CursorPaginatedResult } from '../interfaces/paginated-result.interface';

export interface CursorQueryOptions<T> {
  /**
   * Array of items from database (should query limit + 1 items)
   * This allows us to determine if there's a next page
   */
  items: T[];

  /**
   * How many items were requested (limit in the query)
   */
  limit: number;

  /**
   * Function to extract the cursor value from an item
   * Usually: (item) => item.id
   */
  getCursor: (item: T) => string;

  /**
   * Function to map database item to DTO
   * Usually: (item) => new SomeDto(item)
   */
  mapToDto: (item: T) => any;

  /**
   * Optional: Total count (if you have it from COUNT query)
   * If provided, will be included in meta
   */
  total?: number;

  /**
   * Optional: Custom transformation for the result
   */
  transform?: (item: any) => any;
}

export class CursorPaginationHelper {
  /**
   * Process cursor pagination result from database query
   *
   * This is the main method to use after querying the database
   *
   * @example
   * // In service method:
   * const dbResults = await prisma.user.findMany({
   *   take: limit + 1,  // Get one extra to check if has next page
   *   cursor: cursor ? { id: cursor } : undefined,
   *   skip: cursor ? 1 : 0,
   *   orderBy: { createdAt: 'desc' }
   * });
   *
   * return CursorPaginationHelper.buildResult({
   *   items: dbResults,
   *   limit,
   *   getCursor: (item) => item.id,
   *   mapToDto: (item) => new UserDto(item),
   *   total: await prisma.user.count()
   * });
   */
  static buildResult<T>(
    options: CursorQueryOptions<T>,
  ): CursorPaginatedResult<any> {
    const { items, limit, getCursor, mapToDto, total, transform } = options;

    // Check if there's a next page (we fetched limit + 1 items)
    const hasNextPage = items.length > limit;

    // Remove the extra item if exists
    const data = hasNextPage ? items.slice(0, -1) : items;

    // Map items to DTO
    const mappedData = data.map((item) => {
      const dto = mapToDto(item);
      return transform ? transform(dto) : dto;
    });

    // Get next cursor from the last item
    const nextCursor =
      hasNextPage && data.length > 0
        ? getCursor(data[data.length - 1])
        : undefined;

    return {
      data: mappedData,
      meta: {
        limit,
        hasNextPage,
        nextCursor,
        ...(total !== undefined && { total }),
      },
    };
  }

  /**
   * Build Prisma cursor query parameters
   *
   * This helper generates the skip/take/cursor parameters for Prisma findMany
   *
   * @param limit - Number of items to return
   * @param cursor - Cursor value from previous query
   * @param shouldSkipCursor - Set to true for keyset pagination (skip the cursor item itself)
   *
   * @returns Object with Prisma query parameters (take, cursor, skip)
   *
   * @example
   * const { take, cursor, skip } = CursorPaginationHelper.buildPrismaParams(
   *   limit: 20,
   *   cursor: "uuid-from-previous-query",
   *   shouldSkipCursor: true
   * );
   *
   * const results = await prisma.user.findMany({
   *   ...CursorPaginationHelper.buildPrismaParams(limit, cursor),
   *   orderBy: { createdAt: 'desc' }
   * });
   */
  static buildPrismaParams(
    limit: number,
    cursor?: string,
    shouldSkipCursor = true, // Set to true for keyset pagination
  ): {
    take: number;
    cursor?: { id: string };
    skip?: number;
  } {
    return {
      take: limit + 1, // Fetch one extra to check hasNextPage
      cursor: cursor ? { id: cursor } : undefined,
      skip: cursor && shouldSkipCursor ? 1 : undefined,
    };
  }

  /**
   * Decode cursor from query string (if cursor is Base64 encoded)
   *
   * @param cursor - Base64 encoded cursor or plain cursor value
   * @returns Decoded cursor string, or undefined
   *
   * @example
   * const cursor = CursorPaginationHelper.decodeCursor(encodedCursor);
   */
  static decodeCursor(cursor: string | undefined): string | undefined {
    if (!cursor) return undefined;

    try {
      // Try to decode as Base64
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      return decoded;
    } catch {
      // If not Base64, return as-is (probably a UUID or ID)
      return cursor;
    }
  }

  /**
   * Encode cursor value (if cursor needs to be Base64 encoded)
   *
   * @param value - String value to encode
   * @returns Base64 encoded cursor
   *
   * @example
   * const encodedCursor = CursorPaginationHelper.encodeCursor(userId);
   */
  static encodeCursor(value: string): string {
    return Buffer.from(value, 'utf-8').toString('base64');
  }

  /**
   * Validate pagination parameters
   *
   * Returns validation result with errors
   *
   * @param limit - Limit value to validate
   * @param cursor - Cursor value to validate
   * @returns Validation result with isValid flag and errors array
   *
   * @example
   * const { isValid, errors } = CursorPaginationHelper.validateParams(limit, cursor);
   * if (!isValid) {
   *   throw new BadRequestException(errors.join(', '));
   * }
   */
  static validateParams(
    limit?: number,
    cursor?: string,
  ): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (limit !== undefined) {
      if (!Number.isInteger(limit)) {
        errors.push('Limit must be an integer');
      }
      if (limit < 1) {
        errors.push('Limit must be at least 1');
      }
      if (limit > 100) {
        errors.push('Limit must not exceed 100');
      }
    }

    if (cursor !== undefined) {
      if (typeof cursor !== 'string') {
        errors.push('Cursor must be a string');
      }
      if (cursor.length > 500) {
        errors.push('Cursor is too long (max 500 characters)');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Create mock paginated result for testing/mocking
   *
   * @param data - Array of items
   * @param hasNextPage - Whether there's a next page
   * @param nextCursor - Cursor for next page
   * @param limit - Items per page
   * @returns Mock CursorPaginatedResult
   *
   * @example
   * const mockResult = CursorPaginationHelper.createMockResult(
   *   data: [user1, user2],
   *   hasNextPage: true,
   *   nextCursor: "next-uuid"
   * );
   */
  static createMockResult<T>(
    data: T[],
    hasNextPage = false,
    nextCursor?: string,
    limit = 20,
  ): CursorPaginatedResult<T> {
    return {
      data,
      meta: {
        limit,
        hasNextPage,
        nextCursor,
      },
    };
  }

  /**
   * Helper to calculate pagination stats
   *
   * @param total - Total number of items
   * @param currentPageSize - Number of items in current page
   * @param pageSize - Items per page
   * @returns Pagination stats object
   */
  static calculateStats(
    total: number,
    currentPageSize: number,
    pageSize: number,
  ) {
    return {
      total,
      currentPageSize,
      pageSize,
      hasNextPage: currentPageSize >= pageSize,
      percentageFetched: Math.round((currentPageSize / total) * 100),
    };
  }
}
