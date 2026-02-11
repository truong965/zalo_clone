/**
 * Search Service — REST API calls (Analytics Only)
 *
 * Tất cả search operations (global, messages, contacts, groups, media)
 * đều qua WebSocket (use-search-socket.ts).
 * Service này chỉ xử lý analytics endpoints:
 * - Search history
 * - Autocomplete suggestions
 * - CTR tracking
 */

import { API_ENDPOINTS } from '@/constants/api-endpoints';
import apiClient from '@/lib/axios';
import type { ApiResponse } from '@/types/api';
import type {
      SearchHistoryItem,
      SearchSuggestion,
      TrendingKeyword,
} from '../types';

export const searchService = {
      /**
       * Get user's search history
       * GET /api/v1/search/analytics/history?limit=50
       */
      async getSearchHistory(limit = 50): Promise<SearchHistoryItem[]> {
            const response = await apiClient.get<ApiResponse<SearchHistoryItem[]>>(
                  API_ENDPOINTS.SEARCH.HISTORY,
                  { params: { limit } },
            );
            return response.data.data;
      },

      /**
       * Get autocomplete suggestions based on prefix
       * GET /api/v1/search/analytics/suggestions?prefix=xxx&limit=10
       */
      async getSuggestions(
            prefix: string,
            limit = 10,
      ): Promise<SearchSuggestion[]> {
            const response = await apiClient.get<ApiResponse<SearchSuggestion[]>>(
                  API_ENDPOINTS.SEARCH.SUGGESTIONS,
                  { params: { prefix, limit } },
            );
            return response.data.data;
      },

      /**
       * Get trending keywords (admin only)
       * GET /api/v1/search/analytics/trending?limit=50
       */
      async getTrendingKeywords(limit = 50): Promise<TrendingKeyword[]> {
            const response = await apiClient.get<ApiResponse<TrendingKeyword[]>>(
                  API_ENDPOINTS.SEARCH.TRENDING,
                  { params: { limit } },
            );
            return response.data.data;
      },

      /**
       * Track search result click for CTR analytics
       * POST /api/v1/search/analytics/track-click
       */
      async trackResultClick(
            keyword: string,
            resultId: string,
      ): Promise<void> {
            await apiClient.post(API_ENDPOINTS.SEARCH.TRACK_CLICK, {
                  keyword,
                  resultId,
            });
      },
};
