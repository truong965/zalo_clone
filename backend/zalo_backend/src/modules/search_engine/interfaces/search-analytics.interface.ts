import { SearchFilters } from '../dto/search.dto';

/**
 * Search Analytics Interfaces (Phase C: TD-16)
 *
 * Extracted from search-analytics.service.ts for proper separation of concerns.
 * These interfaces define the data structures used by the analytics service.
 */

/**
 * Represents a single search query log entry for analytics tracking.
 */
export interface SearchQueryLog {
  userId: string;
  keyword: string;
  searchType: 'GLOBAL' | 'CONVERSATION' | 'CONTACT' | 'MEDIA';
  resultCount: number;
  executionTimeMs: number;
  filters?: SearchFilters;
}

/**
 * Represents aggregated trending keyword data.
 */
export interface TrendingKeyword {
  keyword: string;
  searchCount: number;
  avgResultCount: number;
  avgExecutionTimeMs: number;
}

/**
 * Represents overall search performance metrics.
 */
export interface SearchPerformanceMetrics {
  totalSearches: number;
  uniqueKeywords: number;
  avgExecutionTimeMs: number;
  avgResultCount: number;
  slowestSearches: Array<{
    keyword: string;
    executionTimeMs: number;
    createdAt: Date;
  }>;
  popularSearchTypes: Array<{
    searchType: string;
    count: number;
  }>;
}
