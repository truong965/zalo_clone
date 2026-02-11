/**
 * Cursor Pagination Utility
 * Supports keyset-based pagination using [lastCreatedAt, lastId] tuple for optimal performance
 *
 * Key Features:
 * - Keyset pagination (no OFFSET, better performance)
 * - Deterministic ordering with timestamp + id
 * - Type-safe with generics
 */

export interface CursorPayload {
  lastId: bigint | string | number;
  lastCreatedAt: string; // ISO format timestamp
}

/**
 * Generic interface for items that can be paginated
 * Must have an id and a createdAt field
 */
export interface PaginatableItem {
  id: bigint | string | number;
  createdAt?: Date;
  created_at?: Date; // Support snake_case from Prisma raw queries
  [key: string]: unknown; // Allow additional fields
}

export class PaginationUtil {
  /**
   * Encode cursor to Base64
   */
  static encodeCursor(payload: CursorPayload): string {
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  /**
   * Decode cursor from Base64
   */
  static decodeCursor(cursor: string): CursorPayload | null {
    try {
      const decoded = Buffer.from(cursor, 'base64').toString('utf-8');
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }

  /**
   * Generate cursor from database record
   */
  static generateCursor(
    lastId: bigint | string | number,
    lastCreatedAt: Date,
  ): string {
    return this.encodeCursor({
      lastId,
      lastCreatedAt: lastCreatedAt.toISOString(),
    });
  }

  /**
   * Build WHERE clause for cursor-based pagination
   * Supports both ascending and descending order
   *
   * Example (DESC):
   * (created_at < '2025-02-08T10:00:00Z' OR (created_at = '2025-02-08T10:00:00Z' AND id < 5000))
   *
   * @returns Object with SQL string and parameter values
   */
  static buildCursorWhereClause(
    cursor: CursorPayload | null,
    orderDesc = true,
  ): { sql: string; params: Array<string | bigint | number> } {
    if (!cursor) {
      return { sql: '', params: [] };
    }

    const operator = orderDesc ? '<' : '>';

    // Return SQL fragment WITHOUT leading AND
    const sql = `(created_at ${operator} $CURSOR_TIME OR (created_at = $CURSOR_TIME AND id ${operator} $CURSOR_ID))`;

    return {
      sql,
      params: [cursor.lastCreatedAt, cursor.lastId],
    };
  }

  /**
   * Validate and normalize limit parameter
   * @param limit - Requested limit (can be null/undefined)
   * @param maxLimit - Maximum allowed limit (default: 100)
   * @returns Normalized limit value
   */
  static normalizeLimit(
    limit: number | null | undefined,
    maxLimit = 100,
  ): number {
    if (!limit || limit < 1) return 50;
    if (limit > maxLimit) return maxLimit;
    return Math.floor(limit);
  }

  /**
   * Check if more results exist (fetch limit+1, return limit)
   * @param items - Array of items fetched from database
   * @param limit - Requested limit
   * @returns true if there are more results
   */
  static hasMoreResults<T>(items: T[], limit: number): boolean {
    return items.length > limit;
  }

  /**
   * Trim results to limit and generate next cursor
   * Generic method that works with any paginatable item
   *
   * @param items - Array of items (should have length = limit + 1)
   * @param limit - Number of items to return
   * @param idField - Name of the ID field (default: 'id')
   * @param dateField - Name of the timestamp field (default: 'createdAt')
   * @returns Trimmed items and optional next cursor
   */
  static trimAndGetNextCursor<T extends PaginatableItem>(
    items: T[],
    limit: number,
    idField: keyof T = 'id',
    dateField: keyof T = 'createdAt',
  ): { items: T[]; nextCursor?: string } {
    const hasMore = items.length > limit;

    if (!hasMore) {
      return { items: items.slice(0, limit) };
    }

    const trimmedItems = items.slice(0, limit);
    const lastItem = trimmedItems[trimmedItems.length - 1];

    // Get the timestamp field value
    const timestampValue =
      lastItem[dateField] || lastItem['created_at' as keyof T];
    if (!timestampValue || !(timestampValue instanceof Date)) {
      throw new Error(
        `Item does not have a valid Date field: ${String(dateField)}`,
      );
    }

    const nextCursor = this.generateCursor(
      lastItem[idField] as bigint | string | number,
      timestampValue,
    );

    return { items: trimmedItems, nextCursor };
  }
}
