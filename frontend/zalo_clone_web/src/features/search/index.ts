/**
 * Search Feature — Barrel Exports
 *
 * Single entry point for all search feature exports.
 * Usage: import { useSearch, useSearchStore, ... } from '@/features/search'
 */

// Types
export type {
      SearchType,
      SearchErrorCode,
      SearchTab,
      SearchStatus,
      RelationshipStatus,
      SearchFilters,
      SearchSubscribePayload,
      SearchUpdateQueryPayload,
      SearchResultsPayload,
      SearchNewMatchPayload,
      SearchResultRemovedPayload,
      SearchSuggestionsPayload,
      SearchErrorPayload,
      GlobalSearchResults,
      HighlightLocation,
      MessageSearchResult,
      ConversationMessageGroup,
      ContactSearchResult,
      GroupSearchResult,
      MediaSearchResult,
      MessageContextResponse,
      SearchHistoryItem,
      SearchSuggestion,
      TrendingKeyword,
      SearchSocketAck,
      SearchSubscribeAck,
      SearchUnsubscribeAck,
      SearchUpdateQueryAck,
} from './types';

export { SEARCH_TAB_TO_TYPE, EMPTY_SEARCH_RESULTS } from './types';

// Store
export { useGlobalSearchStore, useConversationSearchStore, useFriendSearchStore, useSearchStore } from './stores/search.store';
export type { SearchState, SearchStoreApi } from './stores/search.store';

// Hooks
export { useSearch } from './hooks/use-search';
export type { UseSearchOptions } from './hooks/use-search';

export { useSearchSocket } from './hooks/use-search-socket';
export { useSearchSuggestions } from './hooks/use-search-suggestions';
export type { UseSearchSuggestionsOptions } from './hooks/use-search-suggestions';

export { useSearchHistory, SEARCH_HISTORY_QUERY_KEY } from './hooks/use-search-history';
export type { UseSearchHistoryOptions } from './hooks/use-search-history';

// Service
export { searchService } from './api/search.service';

// Utils
export {
      getHighlightSegments,
      truncatePreview,
      formatFileSize,
      formatExecutionTime,
      formatSearchTimestamp,
      getConversationTypeLabel,
      getRelationshipLabel,
      isVisualMedia,
      getMediaTypeIcon,
} from './utils/search.util';
export type { TextSegment } from './utils/search.util';

// Components
export { SearchPanel } from './components/SearchPanel';
export { SearchBar } from './components/SearchBar';
export { SearchResults } from './components/SearchResults';
export { SearchSuggestions } from './components/SearchSuggestions';
export { MessageResult } from './components/MessageResult';
export { ContactResult } from './components/ContactResult';
export { GroupResult } from './components/GroupResult';
export { MediaResult, MediaResultGrid } from './components/MediaResult';
export { SearchEmpty } from './components/SearchEmpty';
export { SearchLoading } from './components/SearchLoading';
export { RealtimeBanner } from './components/RealtimeBanner';
