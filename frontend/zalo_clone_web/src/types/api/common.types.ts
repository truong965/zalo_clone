/**
 * Common / Shared API Types
 *
 * Generic response wrappers and pagination contracts used across all modules.
 */

// ============================================================================
// RESPONSE WRAPPERS
// ============================================================================

/** Standard backend envelope for all HTTP responses */
export interface ApiResponse<T> {
      statusCode: number;
      message: string;
      data: T;
}

/** Standard backend error envelope */
export interface ErrorResponse {
      statusCode: number;
      message: string;
      error?: string;
}

// ============================================================================
// PAGINATION RESPONSES
// ============================================================================

/** Cursor-based pagination (infinite scroll) */
export interface CursorPaginatedResponse<T> {
      data: T[];
      meta: {
            limit: number;
            hasNextPage: boolean;
            nextCursor?: string;
            total?: number;
      };
}

/** Offset-based pagination (table/grid) */
export interface PagePaginatedResponse<T> {
      data: T[];
      meta: {
            current: number;
            pageSize: number;
            total: number;
            totalPages: number;
      };
}

// ============================================================================
// PAGINATION REQUESTS
// ============================================================================

export interface CursorPaginationRequest {
      limit?: number;
      cursor?: string;
}

export interface PagePaginationRequest {
      page?: number;
      pageSize?: number;
}
