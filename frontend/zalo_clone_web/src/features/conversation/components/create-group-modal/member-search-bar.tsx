/**
 * MemberSearchBar — Search input with Friends/Strangers tab switcher
 *
 * Uses Segmented (antd) for tab switching.
 * Strangers tab requires phone number format validation.
 * Search keyword is debounced before updating store.
 */

import { useCallback } from 'react';
import {
      useCreateGroupStore,
      type SearchTab,
} from '../../stores/create-group.store';
import { ContactSearchInput } from '../shared/contact-search-input';

export function MemberSearchBar() {
      const searchTab = useCreateGroupStore((s) => s.searchTab);
      const setSearchTab = useCreateGroupStore((s) => s.setSearchTab);
      const setSearchKeyword = useCreateGroupStore((s) => s.setSearchKeyword);

      const handleTabChange = useCallback(
            (tab: SearchTab) => {
                  setSearchTab(tab);
                  setSearchKeyword('');
            },
            [setSearchTab, setSearchKeyword],
      );

      return (
            <div className="px-4 py-2 border-b border-gray-100">
                  <ContactSearchInput
                        tab={searchTab}
                        onTabChange={handleTabChange}
                        onSearchChange={setSearchKeyword}
                        showTabs
                  />
            </div>
      );
}
