/**
 * SearchBar — Search input with suggestions dropdown
 *
 * Features:
 * - Ant Design Input.Search with allowClear
 * - onChange → handleKeywordChange (debounced via useSearch hook)
 * - onFocus → show suggestions dropdown
 * - onBlur → hide suggestions (delayed to allow click)
 * - Spinner khi status === 'loading'
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { Input, Spin, type InputRef } from 'antd';
import { SearchOutlined, ArrowLeftOutlined, LoadingOutlined } from '@ant-design/icons';
import { SearchSuggestions } from './SearchSuggestions';
import { useSearchSuggestions } from '../hooks/use-search-suggestions';
import { useSearchHistory } from '../hooks/use-search-history';
import type { SearchStatus } from '../types';

interface SearchBarProps {
      /** Current keyword */
      keyword: string;
      /** Search status for loading indicator */
      status: SearchStatus;
      /** Called on keyword change */
      onKeywordChange: (keyword: string) => void;
      /** Called when user selects a suggestion (immediate search) */
      onSuggestionSelect?: (keyword: string) => void;
      /** Called when user presses Enter */
      onSearch?: (keyword: string) => void;
      /** Called when back button is clicked (close search) */
      onBack?: () => void;
      /** Placeholder text */
      placeholder?: string;
      /** Auto-focus on mount */
      autoFocus?: boolean;
}

export function SearchBar({
      keyword,
      status,
      onKeywordChange,
      onSuggestionSelect,
      onSearch,
      onBack,
      placeholder = 'Tìm kiếm',
      autoFocus = false,
}: SearchBarProps) {
      const [showSuggestions, setShowSuggestions] = useState(false);
      const containerRef = useRef<HTMLDivElement>(null);
      const inputRef = useRef<InputRef>(null);
      const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

      // Suggestions data
      const { suggestions } = useSearchSuggestions({
            prefix: keyword,
            enabled: showSuggestions,
      });
      const { history } = useSearchHistory({ limit: 10 });

      // Auto-focus
      useEffect(() => {
            if (autoFocus) {
                  inputRef.current?.focus();
            }
      }, [autoFocus]);

      const handleFocus = useCallback(() => {
            setShowSuggestions(true);
      }, []);

      const handleBlur = useCallback(() => {
            // Delay to allow suggestion click
            blurTimeoutRef.current = setTimeout(() => {
                  setShowSuggestions(false);
            }, 200);
      }, []);

      // Cleanup timeout
      useEffect(() => {
            return () => {
                  if (blurTimeoutRef.current) {
                        clearTimeout(blurTimeoutRef.current);
                  }
            };
      }, []);

      const handleSuggestionSelect = useCallback(
            (selected: string) => {
                  // Fill input FIRST
                  if (onSuggestionSelect) {
                        onSuggestionSelect(selected);
                  } else {
                        onKeywordChange(selected);
                  }
                  // Close suggestions AFTER (delayed to ensure input is updated)
                  setTimeout(() => setShowSuggestions(false), 50);
            },
            [onSuggestionSelect, onKeywordChange],
      );

      const handleSearch = useCallback(
            (value: string) => {
                  setShowSuggestions(false);
                  onSearch?.(value);
            },
            [onSearch],
      );

      const isLoading = status === 'loading';

      return (
            <div ref={containerRef} className="relative">
                  <div className="flex items-center gap-2 px-3 py-2.5">
                        {/* Back button */}
                        {onBack && (
                              <button
                                    onClick={onBack}
                                    className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 transition-colors text-gray-500"
                              >
                                    <ArrowLeftOutlined />
                              </button>
                        )}

                        {/* Search input */}
                        <Input
                              ref={inputRef}
                              prefix={
                                    isLoading ? (
                                          <Spin indicator={<LoadingOutlined className="text-blue-500" style={{ fontSize: 14 }} spin />} />
                                    ) : (
                                          <SearchOutlined className="text-gray-400" />
                                    )
                              }
                              placeholder={placeholder}
                              value={keyword}
                              onChange={(e) => onKeywordChange(e.target.value)}
                              onFocus={handleFocus}
                              onBlur={handleBlur}
                              onPressEnter={(e) => handleSearch((e.target as HTMLInputElement).value)}
                              allowClear
                              className="bg-gray-100 border-none rounded-lg"
                        />
                  </div>

                  {/* Suggestions Dropdown */}
                  {showSuggestions && (
                        <SearchSuggestions
                              suggestions={suggestions}
                              history={history}
                              prefix={keyword}
                              onSelect={handleSuggestionSelect}
                        />
                  )}
            </div>
      );
}
