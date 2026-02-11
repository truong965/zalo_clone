import { registerAs } from '@nestjs/config';

export interface SearchEngineConfig {
  cache: {
    ttlGlobalSearch: number; // seconds
    ttlUserScopedSearch: number; // seconds
    ttlContactSearch: number; // seconds
    ttlMediaSearch: number; // seconds
    enableCache: boolean;
  };
  pagination: {
    defaultMessageLimit: number;
    defaultContactLimit: number;
    defaultGlobalLimit: number;
    defaultGroupLimit: number;
    defaultMediaLimit: number;
    maxLimit: number;
    /** Initial load limits for WebSocket search (per search type) */
    initialLoad: {
      conversation: number;
      globalGrouped: number;
      contacts: number;
      groups: number;
      media: number;
    };
    /** Load more (pagination) limits */
    loadMore: {
      default: number;
      max: number;
    };
  };
  performance: {
    queryTimeoutMs: number; // Timeout per individual search query
    maxParallelQueries: number; // Max concurrent search queries
  };
  ranking: {
    fullTextMatchWeight: number; // 0.4
    recencyWeight: number; // 0.2
    relationshipWeight: number; // 0.2
    frequencyWeight: number; // 0.1
    interactionWeight: number; // 0.1
  };
}

export default registerAs<SearchEngineConfig>('search', () => ({
  cache: {
    ttlGlobalSearch: parseInt(process.env.SEARCH_CACHE_TTL_GLOBAL || '30', 10), // 30 seconds
    ttlUserScopedSearch: parseInt(
      process.env.SEARCH_CACHE_TTL_USER || '30',
      10,
    ), // 30 seconds
    ttlContactSearch: parseInt(
      process.env.SEARCH_CACHE_TTL_CONTACT || '30',
      10,
    ), // 30 seconds
    ttlMediaSearch: parseInt(process.env.SEARCH_CACHE_TTL_MEDIA || '30', 10), // 30 seconds
    enableCache: process.env.SEARCH_CACHE_ENABLED !== 'false',
  },
  pagination: {
    defaultMessageLimit: 50,
    defaultContactLimit: 100,
    defaultGlobalLimit: 20,
    defaultGroupLimit: 50,
    defaultMediaLimit: 50,
    maxLimit: 200,
    initialLoad: {
      conversation: 50,
      globalGrouped: 50,
      contacts: 100,
      groups: 50,
      media: 50,
    },
    loadMore: {
      default: 50,
      max: 200,
    },
  },
  performance: {
    queryTimeoutMs: parseInt(process.env.SEARCH_QUERY_TIMEOUT || '5000', 10), // 5 seconds
    maxParallelQueries: 4,
  },
  ranking: {
    fullTextMatchWeight: 0.4,
    recencyWeight: 0.2,
    relationshipWeight: 0.2,
    frequencyWeight: 0.1,
    interactionWeight: 0.1,
  },
}));
