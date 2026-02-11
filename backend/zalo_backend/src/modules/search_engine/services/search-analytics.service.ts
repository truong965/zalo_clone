import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from 'src/database/prisma.service';
import type {
  SearchQueryLog,
  TrendingKeyword,
  SearchPerformanceMetrics,
} from '../interfaces/search-analytics.interface';

// Re-export for backward compatibility
export type { SearchQueryLog, TrendingKeyword, SearchPerformanceMetrics };

/**
 * Search Analytics Service (Phase 3)
 * Tracks search queries for analytics, trending topics, and ranking optimization.
 *
 * Features:
 * - Track search queries with metadata
 * - Get trending keywords
 * - Get search performance metrics
 * - Track user search history
 *
 * Phase C (TD-16): Interfaces extracted to interfaces/search-analytics.interface.ts
 * Phase C (TD-19): Replaced console.error with NestJS Logger
 */

@Injectable()
export class SearchAnalyticsService {
  private readonly logger = new Logger(SearchAnalyticsService.name);

  constructor(private prisma: PrismaService) { }

  /**
   * Log a search query for analytics
   */
  async logSearchQuery(data: SearchQueryLog): Promise<void> {
    try {
      await this.prisma.searchQuery.create({
        data: {
          userId: data.userId,
          keyword: data.keyword,
          searchType: data.searchType,
          resultCount: data.resultCount,
          executionTimeMs: data.executionTimeMs,
          filters: data.filters
            ? (data.filters as Prisma.InputJsonValue)
            : undefined,
        },
      });
    } catch (error) {
      // Don't fail the search if logging fails
      this.logger.error(
        'Failed to log search query',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Track result click - CREATE new query log instead of UPDATE
   * (Phase 3 refactor: Only log searches that result in clicks)
   * 
   * This reduces DB writes by 90-95% vs logging every search.
   * Analytics now represent actual user engagement (CTR = 100%).
   */
  async trackResultClick(
    userId: string,
    keyword: string,
    resultId: string,
  ): Promise<void> {
    try {
      // Create search query log with click data for ALL result types
      // clickedResultId can be message ID (BigInt), user UUID, or group UUID
      await this.prisma.searchQuery.create({
        data: {
          userId,
          keyword,
          searchType: 'GLOBAL', // Inferred from context
          resultCount: 1, // User found at least 1 result (the clicked one)
          executionTimeMs: 0, // Not tracked for clicked results
          clickedResultId: resultId,
          clickedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        'Failed to track result click',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Get trending keywords (last 7 days)
   */
  async getTrendingKeywords(limit = 50): Promise<TrendingKeyword[]> {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const results = await this.prisma.$queryRaw<TrendingKeyword[]>`
      SELECT 
        keyword,
        COUNT(*)::int as "searchCount",
        AVG(result_count)::int as "avgResultCount",
        AVG(execution_time_ms)::int as "avgExecutionTimeMs"
      FROM search_queries
      WHERE created_at > ${sevenDaysAgo}
      GROUP BY keyword
      ORDER BY "searchCount" DESC
      LIMIT ${limit}
    `;

    return results;
  }

  /**
   * Get search performance metrics
   */
  async getSearchPerformanceMetrics(
    sinceDate?: Date,
  ): Promise<SearchPerformanceMetrics> {
    const since = sinceDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago

    // Overall stats
    const overallStats = await this.prisma.searchQuery.aggregate({
      where: {
        createdAt: {
          gte: since,
        },
      },
      _count: true,
      _avg: {
        executionTimeMs: true,
        resultCount: true,
      },
    });

    // Unique keywords count
    const uniqueKeywords = await this.prisma.searchQuery.groupBy({
      by: ['keyword'],
      where: {
        createdAt: {
          gte: since,
        },
      },
    });

    // Slowest searches
    const slowestSearches = await this.prisma.searchQuery.findMany({
      where: {
        createdAt: {
          gte: since,
        },
      },
      orderBy: {
        executionTimeMs: 'desc',
      },
      take: 10,
      select: {
        keyword: true,
        executionTimeMs: true,
        createdAt: true,
      },
    });

    // Popular search types
    const searchTypes = await this.prisma.searchQuery.groupBy({
      by: ['searchType'],
      where: {
        createdAt: {
          gte: since,
        },
      },
      _count: true,
    });

    return {
      totalSearches: overallStats._count,
      uniqueKeywords: uniqueKeywords.length,
      avgExecutionTimeMs: Math.round(overallStats._avg.executionTimeMs || 0),
      avgResultCount: Math.round(overallStats._avg.resultCount || 0),
      slowestSearches,
      popularSearchTypes: searchTypes.map((st) => ({
        searchType: st.searchType,
        count: st._count,
      })),
    };
  }

  /**
   * Get user's search history
   */
  async getUserSearchHistory(
    userId: string,
    limit = 50,
  ): Promise<
    Array<{
      keyword: string;
      searchType: string;
      resultCount: number;
      createdAt: Date;
    }>
  > {
    const history = await this.prisma.searchQuery.findMany({
      where: { userId },
      distinct: ['keyword'],
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      select: {
        keyword: true,
        searchType: true,
        resultCount: true,
        createdAt: true,
      },
    });

    return history;
  }

  /**
   * Get search suggestions based on user's search history
   */
  async getSearchSuggestions(
    userId: string,
    prefix: string,
    limit = 10,
  ): Promise<string[]> {
    const results = await this.prisma.$queryRaw<
      Array<{ keyword: string }>
    >`
      SELECT keyword
      FROM (
        SELECT keyword, MAX(created_at) as last_used
        FROM search_queries
        WHERE user_id = ${userId}::uuid
          AND keyword ILIKE ${prefix + '%'}
        GROUP BY keyword
        ORDER BY last_used DESC
        LIMIT ${limit}
      ) sub
    `;

    return results.map((r) => r.keyword);
  }

  /**
   * Clean up old search queries (retention policy: 90 days)
   */
  async cleanupOldQueries(): Promise<number> {
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const result = await this.prisma.searchQuery.deleteMany({
      where: {
        createdAt: {
          lt: ninetyDaysAgo,
        },
      },
    });

    return result.count;
  }

  /**
   * Get search success rate (searches with results vs without)
   */
  async getSearchSuccessRate(sinceDate?: Date): Promise<number> {
    const since = sinceDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const stats = await this.prisma.searchQuery.groupBy({
      by: ['resultCount'],
      where: {
        createdAt: {
          gte: since,
        },
      },
      _count: true,
    });

    const totalSearches = stats.reduce((sum, s) => sum + s._count, 0);
    const successfulSearches = stats
      .filter((s) => s.resultCount > 0)
      .reduce((sum, s) => sum + s._count, 0);

    return totalSearches > 0 ? successfulSearches / totalSearches : 0;
  }
}
