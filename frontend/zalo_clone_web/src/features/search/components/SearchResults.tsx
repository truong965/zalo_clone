/**
 * SearchResults — Tabbed search results display
 *
 * Tab layout:
 * - Tất cả (All): contacts → groups → messages → media (max 5 per category, with "Xem thêm")
 * - Tin nhắn (Messages): ALL message results
 * - Liên hệ (Contacts): ALL contact results
 * - Nhóm (Groups): ALL group results
 * - Media: ALL media results
 *
 * Features:
 * - Ant Design Tabs
 * - SearchLoading skeleton
 * - SearchEmpty when no results
 * - RealtimeBanner for new matches
 * - Execution time display
 * - "Xem thêm" button in All tab when a category has more than 5 results
 */

import { Tabs, Typography, Button } from 'antd';
import { RightOutlined } from '@ant-design/icons';
import type { SearchTab, GlobalSearchResults, ConversationMessageGroup, ContactSearchResult, GroupSearchResult, MediaSearchResult } from '../types';
import { ConversationSearchResult } from './ConversationSearchResult';
import { ContactResult } from './ContactResult';
import { GroupResult } from './GroupResult';
import { MediaResultGrid } from './MediaResult';
import { SearchEmpty } from './SearchEmpty';
import { SearchLoading } from './SearchLoading';
import { RealtimeBanner } from './RealtimeBanner';
import { formatExecutionTime } from '../utils/search.util';
import type { SearchStatus } from '../types';

const { Text } = Typography;

/** Max items shown per category in the "All" tab */
const ALL_TAB_PREVIEW_LIMIT = 5;

interface SearchResultsProps {
      /** Current active tab */
      activeTab: SearchTab;
      /** Search results data */
      results: GlobalSearchResults | null;
      /** Search status */
      status: SearchStatus;
      /** Search keyword (for empty state message) */
      keyword: string;
      /** Execution time (ms) */
      executionTimeMs: number;
      /** Number of pending realtime new matches */
      pendingMatchCount: number;
      /** Error message */
      errorMessage: string | null;
      /** Called when tab changes */
      onTabChange: (tab: SearchTab) => void;
      /** Called to merge pending new matches */
      onMergeNewMatches: () => void;
      /** Called when a conversation message group is clicked */
      onConversationMessageClick?: (data: ConversationMessageGroup) => void;
      /** Called when a contact result is clicked */
      onContactClick?: (result: ContactSearchResult) => void;
      /** Called when a group result is clicked */
      onGroupClick?: (result: GroupSearchResult) => void;
      /** Called when a media result is clicked */
      onMediaClick?: (result: MediaSearchResult) => void;
      /** Called when send message to contact */
      onSendMessage?: (contactId: string) => void;
      /** Called when add friend */
      onAddFriend?: (contactId: string) => void;
}

export function SearchResults({
      activeTab,
      results,
      status,
      keyword,
      executionTimeMs,
      pendingMatchCount,
      errorMessage,
      onTabChange,
      onMergeNewMatches,
      onConversationMessageClick,
      onContactClick,
      onGroupClick,
      onMediaClick,
      onSendMessage,
      onAddFriend,
}: SearchResultsProps) {
      const isLoading = status === 'loading';
      const hasSearched = status === 'success' || status === 'error';
      const hasResults =
            results !== null &&
            ((results.conversationMessages?.length ?? 0) > 0 ||
                  results.contacts.length > 0 ||
                  results.groups.length > 0 ||
                  results.media.length > 0);

      const msgCount = results?.conversationMessages?.length ?? 0;

      const tabItems = [
            { key: 'all' as SearchTab, label: 'Tất cả' },
            { key: 'messages' as SearchTab, label: `Tin nhắn${msgCount ? ` (${msgCount})` : ''}` },
            { key: 'contacts' as SearchTab, label: `Liên hệ${results?.contacts.length ? ` (${results.contacts.length})` : ''}` },
            { key: 'groups' as SearchTab, label: `Nhóm${results?.groups.length ? ` (${results.groups.length})` : ''}` },
            { key: 'media' as SearchTab, label: `Media${results?.media.length ? ` (${results.media.length})` : ''}` },
      ];

      return (
            <div className="flex flex-col flex-1 overflow-hidden">
                  {/* Tabs */}
                  <Tabs
                        activeKey={activeTab}
                        onChange={(key) => onTabChange(key as SearchTab)}
                        items={tabItems}
                        size="small"
                        className="search-tabs"
                        tabBarStyle={{ marginBottom: 0, paddingInline: 12 }}
                  />

                  {/* Results Area */}
                  <div className="flex-1 overflow-y-auto">
                        {/* Error message */}
                        {errorMessage && (
                              <div className="px-3 py-2 mx-2 mt-2 bg-red-50 border border-red-200 rounded-lg">
                                    <Text className="text-sm text-red-600">{errorMessage}</Text>
                              </div>
                        )}

                        {/* Realtime banner */}
                        <RealtimeBanner count={pendingMatchCount} onMerge={onMergeNewMatches} />

                        {/* Loading skeleton */}
                        {isLoading && !hasResults && <SearchLoading />}

                        {/* No results */}
                        {hasSearched && !hasResults && !isLoading && (
                              <SearchEmpty hasSearched keyword={keyword} />
                        )}

                        {/* Results */}
                        {hasResults && (
                              <div className="pb-4">
                                    {/* Execution time */}
                                    {executionTimeMs > 0 && (
                                          <div className="px-3 py-1.5">
                                                <Text className="text-[11px] text-gray-400">
                                                      {results!.totalCount} kết quả · {formatExecutionTime(executionTimeMs)}
                                                </Text>
                                          </div>
                                    )}

                                    {/* Tab: All — show max 5 per category with "Xem thêm" */}
                                    {activeTab === 'all' && (
                                          <>
                                                <ResultSection
                                                      title="Liên hệ"
                                                      count={results!.contacts.length}
                                                      show={results!.contacts.length > 0}
                                                      hasMore={results!.contacts.length > ALL_TAB_PREVIEW_LIMIT}
                                                      onSeeMore={() => onTabChange('contacts')}
                                                >
                                                      {results!.contacts.slice(0, ALL_TAB_PREVIEW_LIMIT).map((c) => (
                                                            <ContactResult
                                                                  key={c.id}
                                                                  data={c}
                                                                  onClick={onContactClick}
                                                                  onSendMessage={onSendMessage}
                                                                  onAddFriend={onAddFriend}
                                                            />
                                                      ))}
                                                </ResultSection>

                                                <ResultSection
                                                      title="Nhóm"
                                                      count={results!.groups.length}
                                                      show={results!.groups.length > 0}
                                                      hasMore={results!.groups.length > ALL_TAB_PREVIEW_LIMIT}
                                                      onSeeMore={() => onTabChange('groups')}
                                                >
                                                      {results!.groups.slice(0, ALL_TAB_PREVIEW_LIMIT).map((g) => (
                                                            <GroupResult key={g.id} data={g} onClick={onGroupClick} />
                                                      ))}
                                                </ResultSection>

                                                <ResultSection
                                                      title="Tin nhắn"
                                                      count={results!.conversationMessages?.length ?? 0}
                                                      show={(results!.conversationMessages?.length ?? 0) > 0}
                                                      hasMore={(results!.conversationMessages?.length ?? 0) > ALL_TAB_PREVIEW_LIMIT}
                                                      onSeeMore={() => onTabChange('messages')}
                                                >
                                                      {(results!.conversationMessages ?? []).slice(0, ALL_TAB_PREVIEW_LIMIT).map((cm) => (
                                                            <ConversationSearchResult key={cm.conversationId} data={cm} onClick={onConversationMessageClick} />
                                                      ))}
                                                </ResultSection>

                                                <ResultSection
                                                      title="Media"
                                                      count={results!.media.length}
                                                      show={results!.media.length > 0}
                                                      hasMore={results!.media.length > ALL_TAB_PREVIEW_LIMIT}
                                                      onSeeMore={() => onTabChange('media')}
                                                >
                                                      <MediaResultGrid items={results!.media.slice(0, ALL_TAB_PREVIEW_LIMIT)} onItemClick={onMediaClick} />
                                                </ResultSection>
                                          </>
                                    )}

                                    {/* Tab: Messages — show ALL */}
                                    {activeTab === 'messages' && (
                                          (results!.conversationMessages?.length ?? 0) > 0 ? (
                                                (results!.conversationMessages ?? []).map((cm) => (
                                                      <ConversationSearchResult key={cm.conversationId} data={cm} onClick={onConversationMessageClick} />
                                                ))
                                          ) : (
                                                <SearchEmpty hasSearched keyword={keyword} />
                                          )
                                    )}

                                    {/* Tab: Contacts — show ALL */}
                                    {activeTab === 'contacts' && (
                                          results!.contacts.length > 0 ? (
                                                results!.contacts.map((c) => (
                                                      <ContactResult
                                                            key={c.id}
                                                            data={c}
                                                            onClick={onContactClick}
                                                            onSendMessage={onSendMessage}
                                                            onAddFriend={onAddFriend}
                                                      />
                                                ))
                                          ) : (
                                                <SearchEmpty hasSearched keyword={keyword} />
                                          )
                                    )}

                                    {/* Tab: Groups — show ALL */}
                                    {activeTab === 'groups' && (
                                          results!.groups.length > 0 ? (
                                                results!.groups.map((g) => (
                                                      <GroupResult key={g.id} data={g} onClick={onGroupClick} />
                                                ))
                                          ) : (
                                                <SearchEmpty hasSearched keyword={keyword} />
                                          )
                                    )}

                                    {/* Tab: Media — show ALL */}
                                    {activeTab === 'media' && (
                                          results!.media.length > 0 ? (
                                                <MediaResultGrid items={results!.media} onItemClick={onMediaClick} />
                                          ) : (
                                                <SearchEmpty hasSearched keyword={keyword} />
                                          )
                                    )}
                              </div>
                        )}
                  </div>
            </div>
      );
}

// ============================================================================
// Section with title + "Xem thêm" — used in "All" tab
// ============================================================================

interface ResultSectionProps {
      title: string;
      count: number;
      show: boolean;
      /** Whether there are more items beyond the preview limit */
      hasMore?: boolean;
      /** Callback when "Xem thêm" is clicked — switches to the specific tab */
      onSeeMore?: () => void;
      children: React.ReactNode;
}

function ResultSection({ title, count, show, hasMore, onSeeMore, children }: ResultSectionProps) {
      if (!show) return null;

      return (
            <div className="mb-2">
                  <div className="px-3 py-1.5 flex items-center justify-between bg-gray-50/80 sticky top-0 z-10">
                        <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                              {title}
                        </Text>
                        <Text className="text-[11px] text-gray-400">
                              {count}
                        </Text>
                  </div>
                  {children}
                  {hasMore && onSeeMore && (
                        <div className="px-3 py-1">
                              <Button
                                    type="link"
                                    size="small"
                                    className="p-0 h-auto text-xs text-blue-500 hover:text-blue-600"
                                    onClick={onSeeMore}
                              >
                                    Xem thêm <RightOutlined className="text-[10px]" />
                              </Button>
                        </div>
                  )}
            </div>
      );
}
