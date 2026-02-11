/**
 * SearchSuggestions — Dropdown for search suggestions
 *
 * Hiển thị (bỏ trending theo yêu cầu):
 * - History: Lịch sử tìm kiếm gần đây
 * - Autocomplete: Gợi ý theo prefix nhập
 *
 * Sử dụng useSearchSuggestions hook + useSearchHistory hook.
 */

import { Typography } from 'antd';
import { HistoryOutlined, SearchOutlined } from '@ant-design/icons';
import type { SearchSuggestion, SearchHistoryItem } from '../types';

const { Text } = Typography;

interface SearchSuggestionsProps {
      /** Autocomplete suggestions (from hook) */
      suggestions: SearchSuggestion[];
      /** Recent search history */
      history: SearchHistoryItem[];
      /** Current input prefix — to highlight matching part */
      prefix: string;
      /** Loading state */
      isLoading?: boolean;
      /** Called when user selects a suggestion */
      onSelect: (keyword: string) => void;
}

export function SearchSuggestions({
      suggestions,
      history,
      prefix,
      onSelect,
}: SearchSuggestionsProps) {
      const trimmedPrefix = prefix.trim().toLowerCase();
      const hasContent = suggestions.length > 0 || history.length > 0;

      if (!hasContent) return null;

      return (
            <div
                  className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[360px] overflow-y-auto"
                  onMouseDown={(e) => e.preventDefault()} // Prevent input blur when clicking suggestions
            >
                  {/* Recent Search History */}
                  {history.length > 0 && !trimmedPrefix && (
                        <div className="py-1">
                              <div className="px-3 py-1.5 flex items-center gap-1.5">
                                    <HistoryOutlined className="text-gray-400 text-xs" />
                                    <Text className="text-xs text-gray-400 font-medium">
                                          Tìm kiếm gần đây
                                    </Text>
                              </div>
                              {history.slice(0, 5).map((item, i) => (
                                    <div
                                          key={`history-${i}`}
                                          className="px-3 py-2 cursor-pointer hover:bg-gray-50 flex items-center gap-2"
                                          onClick={() => onSelect(item.keyword)}
                                    >
                                          <HistoryOutlined className="text-gray-300 text-sm" />
                                          <Text className="text-sm text-gray-700">{item.keyword}</Text>
                                    </div>
                              ))}
                        </div>
                  )}

                  {/* Divider */}
                  {history.length > 0 && !trimmedPrefix && suggestions.length > 0 && (
                        <div className="border-t border-gray-100" />
                  )}

                  {/* Autocomplete Suggestions */}
                  {suggestions.length > 0 && (
                        <div className="py-1">
                              {trimmedPrefix && (
                                    <div className="px-3 py-1.5 flex items-center gap-1.5">
                                          <SearchOutlined className="text-gray-400 text-xs" />
                                          <Text className="text-xs text-gray-400 font-medium">
                                                Gợi ý
                                          </Text>
                                    </div>
                              )}
                              {suggestions.map((suggestion, i) => (
                                    <SuggestionItem
                                          key={`suggestion-${i}`}
                                          keyword={suggestion.keyword}
                                          prefix={trimmedPrefix}
                                          fromHistory={suggestion.fromHistory}
                                          onClick={() => onSelect(suggestion.keyword)}
                                    />
                              ))}
                        </div>
                  )}
            </div>
      );
}

// ============================================================================
// Sub-components
// ============================================================================

interface SuggestionItemProps {
      keyword: string;
      prefix: string;
      fromHistory?: boolean;
      onClick: () => void;
}

function SuggestionItem({ keyword, prefix, fromHistory, onClick }: SuggestionItemProps) {
      // Highlight matching prefix
      const lowerKeyword = keyword.toLowerCase();
      const matchIndex = lowerKeyword.indexOf(prefix);

      let display: React.ReactNode;
      if (prefix && matchIndex !== -1) {
            const before = keyword.slice(0, matchIndex);
            const match = keyword.slice(matchIndex, matchIndex + prefix.length);
            const after = keyword.slice(matchIndex + prefix.length);
            display = (
                  <>
                        {before}
                        <span className="font-semibold text-blue-600">{match}</span>
                        {after}
                  </>
            );
      } else {
            display = keyword;
      }

      return (
            <div
                  className="px-3 py-2 cursor-pointer hover:bg-gray-50 flex items-center gap-2"
                  onClick={onClick}
            >
                  {fromHistory ? (
                        <HistoryOutlined className="text-gray-300 text-sm" />
                  ) : (
                        <SearchOutlined className="text-gray-300 text-sm" />
                  )}
                  <Text className="text-sm text-gray-700">{display}</Text>
            </div>
      );
}
