/**
 * ContactSearchInput — Reusable search input with Friends/Strangers tab switcher
 *
 * Generic component that accepts callbacks instead of being tied to a specific store.
 * Includes debouncing to prevent excessive API calls.
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { Input, Segmented } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

const DEBOUNCE_MS = 300;
const PHONE_HINT = 'Nhập số điện thoại để tìm (VD: 0901234567)';

export type SearchTab = 'friends' | 'strangers';

interface ContactSearchInputProps {
      /** Current active tab */
      tab: SearchTab;
      /** Callback when tab changes */
      onTabChange: (tab: SearchTab) => void;
      /** Callback when search keyword changes (debounced) */
      onSearchChange: (keyword: string) => void;
      /** Optional: show/hide the tab segmented control */
      showTabs?: boolean;
      /** Optional: custom placeholder */
      placeholder?: string;
}

export function ContactSearchInput({
      tab,
      onTabChange,
      onSearchChange,
      showTabs = true,
      placeholder,
}: ContactSearchInputProps) {
      const [localValue, setLocalValue] = useState('');
      const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

      // Clear local value when tab changes (from parent)
      useEffect(() => {
            setLocalValue('');
            if (debounceRef.current) clearTimeout(debounceRef.current);
      }, [tab]);

      const handleChange = useCallback(
            (value: string) => {
                  setLocalValue(value);
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  debounceRef.current = setTimeout(() => {
                        onSearchChange(value.trim());
                  }, DEBOUNCE_MS);
            },
            [onSearchChange],
      );

      const handleTabChange = useCallback(
            (newTab: SearchTab) => {
                  onTabChange(newTab);
                  setLocalValue('');
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  onSearchChange('');
            },
            [onTabChange, onSearchChange],
      );

      const handleClear = useCallback(() => {
            setLocalValue('');
            if (debounceRef.current) clearTimeout(debounceRef.current);
            onSearchChange('');
      }, [onSearchChange]);

      const inputPlaceholder =
            placeholder ??
            (tab === 'strangers' ? PHONE_HINT : 'Tìm bạn bè...');

      return (
            <div className="space-y-2">
                  <Input
                        prefix={<SearchOutlined className="text-gray-400" />}
                        placeholder={inputPlaceholder}
                        value={localValue}
                        onChange={(e) => handleChange(e.target.value)}
                        allowClear
                        onClear={handleClear}
                  />
                  {showTabs && (
                        <Segmented
                              block
                              value={tab}
                              onChange={(val) => handleTabChange(val as SearchTab)}
                              options={[
                                    { label: 'Bạn bè', value: 'friends' },
                                    { label: 'Tìm người lạ', value: 'strangers' },
                              ]}
                              size="small"
                        />
                  )}
            </div>
      );
}
