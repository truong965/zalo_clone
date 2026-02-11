import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUserId } from '@common/decorator/customize';
import { SearchAnalyticsService } from './services/search-analytics.service';

/** DTO for POST /analytics/track-click */
class TrackClickDto {
  @IsString()
  @IsNotEmpty()
  keyword: string;

  @IsString()
  @IsNotEmpty()
  resultId: string;
}

/**
 * Search Engine Controller (B6: Cleaned up)
 *
 * HTTP endpoints for ANALYTICS ONLY.
 * All search operations (global, messages, contacts, groups, media) are handled
 * via WebSocket through SearchGateway → RealTimeSearchService.
 *
 * Kept endpoints:
 * - GET /search/analytics/trending — Admin trending keywords
 * - GET /search/analytics/performance — Admin performance metrics
 * - GET /search/analytics/history — User search history
 * - GET /search/analytics/suggestions — User autocomplete suggestions
 * - POST /search/analytics/track-click — CTR tracking
 */

@ApiTags('Search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchEngineController {
  constructor(private analyticsService: SearchAnalyticsService) { }

  // ============================================================================
  // SEARCH ANALYTICS
  // ============================================================================

  /**
   * Get trending search keywords
   * Phase C (TD-21): Restricted to ADMIN and SUPER_ADMIN roles
   */
  @Get('analytics/trending')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get trending search keywords (last 7 days) — Admin only',
  })
  async getTrendingKeywords(
    @Query('limit') limit?: number,
  ) {
    return this.analyticsService.getTrendingKeywords(limit || 50);
  }

  /**
   * Get search performance metrics
   * Phase C (TD-21): Restricted to ADMIN and SUPER_ADMIN roles
   */
  @Get('analytics/performance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get search performance metrics — Admin only' })
  async getSearchPerformance() {
    return this.analyticsService.getSearchPerformanceMetrics();
  }

  /**
   * Get user's search history
   */
  @Get('analytics/history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get user search history' })
  async getSearchHistory(
    @CurrentUserId() userId: string,
    @Query('limit') limit?: number,
  ) {
    return this.analyticsService.getUserSearchHistory(
      userId,
      limit || 50,
    );
  }

  /**
   * Get search suggestions based on user history
   */
  @Get('analytics/suggestions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get search suggestions' })
  async getSearchSuggestions(
    @CurrentUserId() userId: string,
    @Query('prefix') prefix: string,
    @Query('limit') limit?: number,
  ) {
    return this.analyticsService.getSearchSuggestions(
      userId,
      prefix,
      limit || 10,
    );
  }

  /**
   * Track result click (for CTR analytics)
   */
  @Post('analytics/track-click')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Track search result click' })
  async trackResultClick(
    @CurrentUserId() userId: string,
    @Body() body: TrackClickDto,
  ) {
    await this.analyticsService.trackResultClick(
      userId,
      body.keyword,
      body.resultId,
    );
    return { success: true };
  }
}
