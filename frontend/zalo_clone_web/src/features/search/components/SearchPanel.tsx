/**
 * SearchPanel — Global search panel that replaces ConversationSidebar
 *
 * Phase 4 — Option A: Sidebar Search Panel (like Zalo desktop)
 * - Replaces conversation list when isSearchOpen = true
 * - Contains SearchBar + SearchResults
 * - Close button → return to conversation list
 *
 * Sử dụng useSearch hook để orchestrate toàn bộ logic.
 */

import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { notification } from 'antd';
import { useSearch } from '../hooks/use-search';
import { SearchBar } from './SearchBar';
import { SearchResults } from './SearchResults';
import { SearchEmpty } from './SearchEmpty';
import { FriendRequestModal, useAcceptRequest, useCancelRequest } from '@/features/contacts';
import { conversationService } from '@/features/conversation';
import { handleInteractionError } from '@/utils/interaction-error';
import { useTranslation } from 'react-i18next';
import type {
      ConversationMessageGroup,
      ContactSearchResult,
      GroupSearchResult,
      MediaSearchResult,
      RelationshipStatus,
} from '../types';

/**
 * Bug 7 fix: Resolve display name based on relationship status.
 * Only show alias (displayNameFinal) for friends. Strangers always see original name.
 */
function resolveContactName(contact: ContactSearchResult): string {
      if (contact.relationshipStatus === 'FRIEND') {
            return contact.displayNameFinal || contact.displayName;
      }
      return contact.displayName;
}

interface SearchPanelProps {
      /** Close search panel → return to conversation sidebar */
      onClose: () => void;
      /** Navigate to a conversation (when clicking contact/group result) */
      onNavigateToConversation?: (conversationId: string) => void;
      /** Navigate to a conversation and open in-conversation search with keyword prefilled */
      onNavigateToConversationSearch?: (conversationId: string, keyword: string) => void;
}

export function SearchPanel({
      onClose,
      onNavigateToConversation,
      onNavigateToConversationSearch,
}: SearchPanelProps) {
      const queryClient = useQueryClient();
      const { t } = useTranslation();
      const {
            keyword,
            activeTab,
            results,
            status,
            executionTimeMs,
            errorMessage,
            pendingMatchCount,
            handleKeywordChange,
            handleTabChange,
            handleResultClick,
            triggerSearch,
            mergeNewMatches,
            closeSearch,
      } = useSearch();

      const acceptRequest = useAcceptRequest({ meta: { skipGlobalError: true } });
      const cancelRequest = useCancelRequest({ meta: { skipGlobalError: true } });

      // --- Friend Request Modal state ---
      const [friendRequestTarget, setFriendRequestTarget] = useState<{
            userId: string;
            displayName: string;
            avatarUrl?: string;
      } | null>(null);

      // --- Loading guard for contact click (prevent duplicate conversation creation) ---
      const [isContactActionLoading, setIsContactActionLoading] = useState(false);

      // --- Result Click Handlers ---

      const handleConversationMessageClick = useCallback(
            (data: ConversationMessageGroup) => {
                  handleResultClick(data.conversationId);
                  onNavigateToConversationSearch?.(data.conversationId, keyword.trim());
            },
            [handleResultClick, onNavigateToConversationSearch, keyword],
      );

      /**
       * Contact click handler — 3 cases:
       * 1. canMessage === false → show friend request modal
       * 2. existingConversationId → navigate directl
       * 3. canMessage === true → call API to create conversation, refresh list, navigate
       */
      const handleContactClick = useCallback(
            async (
                  result: ContactSearchResult,
                  effectiveStatus: RelationshipStatus,
                  effectiveDirection?: 'OUTGOING' | 'INCOMING' | null,
                  _effectivePendingId?: string | null,
            ) => {
                  // Guard: prevent duplicate calls while async is in-flight
                  if (isContactActionLoading) return;

                  // Track click for search history (fire and forget)
                  handleResultClick(result.id);

                  // If the user is already friend, open conversation directly
                  if (effectiveStatus === 'FRIEND') {
                        if (result.existingConversationId) {
                              onNavigateToConversation?.(result.existingConversationId);
                              return;
                        }
                        setIsContactActionLoading(true);
                        try {
                              const conv = await conversationService.getOrCreateDirectConversation(result.id);
                              await queryClient.invalidateQueries({ queryKey: ['conversations'] });
                              onNavigateToConversation?.(conv.id);
                        } catch (error) {
                              handleInteractionError(error, {
                                    target: { userId: result.id, displayName: resolveContactName(result), avatarUrl: result.avatarUrl },
                              });
                        } finally {
                              setIsContactActionLoading(false);
                        }
                        return;
                  }

                  // If there's a pending friend request, do not show modal send-request again
                  if (effectiveStatus === 'REQUEST') {
                        if (effectiveDirection === 'OUTGOING') {
                              notification.info({ message: 'Bạn đã gửi lời mời kết bạn rồi.' });
                        } else if (effectiveDirection === 'INCOMING') {
                              notification.info({ message: 'Bạn có lời mời kết bạn đến từ người này.' });
                        } else {
                              notification.info({ message: 'Đang có lời mời kết bạn tồn tại.' });
                        }
                        return;
                  }

                  // Blocked user: không cho mở modal
                  if (effectiveStatus === 'BLOCKED') {
                        notification.warning({ message: 'Người dùng đã bị chặn, không thể gửi lời mời.' });
                        return;
                  }

                  // No relationship or declined path: can show friend request modal when cannot message
                  if (result.canMessage === false) {
                        return;
                  }

                  if (result.existingConversationId) {
                        onNavigateToConversation?.(result.existingConversationId);
                        return;
                  }

                  // No existing conv & can message → open/create conversation
                  setIsContactActionLoading(true);
                  try {
                        const conv = await conversationService.getOrCreateDirectConversation(result.id);
                        await queryClient.invalidateQueries({ queryKey: ['conversations'] });
                        onNavigateToConversation?.(conv.id);
                  } catch (error) {
                        const errResult = handleInteractionError(error, {
                              target: { userId: result.id, displayName: resolveContactName(result), avatarUrl: result.avatarUrl },
                        });
                        if (errResult.isPrivacyRestriction && effectiveStatus === 'NONE') {
                              setFriendRequestTarget({
                                    userId: result.id,
                                    displayName: resolveContactName(result),
                                    avatarUrl: result.avatarUrl,
                              });
                        }
                  } finally {
                        setIsContactActionLoading(false);
                  }
            },
            [isContactActionLoading, keyword, onNavigateToConversation, queryClient],
      );

      const handleGroupClick = useCallback(
            (result: GroupSearchResult) => {
                  handleResultClick(result.id);
                  onNavigateToConversation?.(result.id);
            },
            [handleResultClick, onNavigateToConversation],
      );

      const handleMediaClick = useCallback(
            (result: MediaSearchResult) => {
                  handleResultClick(result.id);
                  onNavigateToConversation?.(result.conversationId);
            },
            [handleResultClick, onNavigateToConversation],
      );

      const handleSuggestionSelect = useCallback(
            (selected: string) => {
                  handleKeywordChange(selected);
                  triggerSearch(selected);
            },
            [handleKeywordChange, triggerSearch],
      );

      /**
       * "Nhắn tin" icon button on ContactResult.
       * Same logic as handleContactClick Case 3 — create/find conversation then navigate.
       * Handles 403 (block → warning, privacy → friend request modal).
       */
      const handleSendMessage = useCallback(
            async (contactId: string) => {
                  if (isContactActionLoading) return;
                  setIsContactActionLoading(true);
                  try {
                        const conv = await conversationService.getOrCreateDirectConversation(contactId);
                        await queryClient.invalidateQueries({ queryKey: ['conversations'] });
                        onNavigateToConversation?.(conv.id);
                  } catch (error) {
                        const contact = results?.contacts.find((c) => c.id === contactId);
                        const errResult = handleInteractionError(error, {
                              target: contact
                                    ? { userId: contact.id, displayName: resolveContactName(contact), avatarUrl: contact.avatarUrl }
                                    : undefined,
                        });
                        // 403 privacy restriction (not blocked) → show friend request modal
                        if (errResult.isPrivacyRestriction && contact) {
                              setFriendRequestTarget({
                                    userId: contact.id,
                                    displayName: resolveContactName(contact),
                                    avatarUrl: contact.avatarUrl,
                              });
                        }
                  } finally {
                        setIsContactActionLoading(false);
                  }
            },
            [isContactActionLoading, queryClient, onNavigateToConversation, results],
      );

      /**
       * "Kết bạn" icon button on ContactResult.
       * Find the contact from results and show friend request modal.
       */
      const handleAddFriend = useCallback(
            (contactId: string) => {
                  const contact = results?.contacts.find((c) => c.id === contactId);
                  if (contact) {
                        setFriendRequestTarget({
                              userId: contact.id,
                              displayName: resolveContactName(contact),
                              avatarUrl: contact.avatarUrl,
                        });
                  }
            },
            [results],
      );

      const handleAcceptFriendRequest = useCallback(
            (contactId: string) => {
                  const contact = results?.contacts.find((c) => c.id === contactId);
                  if (!contact?.pendingRequestId) {
                        notification.warning({ message: t('search.missingAcceptId') });
                        return;
                  }

                  acceptRequest.mutate(contact.pendingRequestId, {
                        onSuccess: () => {
                              notification.success({ message: t('search.acceptSuccess') });
                              triggerSearch(keyword);
                              void queryClient.invalidateQueries({ queryKey: ['friendship'] });
                        },
                        onError: () => {
                              notification.error({ message: t('search.acceptFail') });
                        },
                  });
            },
            [acceptRequest, keyword, results, triggerSearch, queryClient, t],
      );

      const handleCancelFriendRequest = useCallback(
            (contactId: string) => {
                  const contact = results?.contacts.find((c) => c.id === contactId);
                  if (!contact?.pendingRequestId) {
                        notification.warning({ message: t('search.missingRecallId') });
                        return;
                  }

                  cancelRequest.mutate(contact.pendingRequestId, {
                        onSuccess: () => {
                              notification.success({ message: t('search.recallSuccess') });
                              triggerSearch(keyword);
                              void queryClient.invalidateQueries({ queryKey: ['friendship'] });
                        },
                        onError: () => {
                              notification.error({ message: t('search.recallFail') });
                        },
                  });
            },
            [cancelRequest, keyword, results, triggerSearch, queryClient, t],
      );

      const handleClose = useCallback(() => {
            closeSearch();
            onClose();
      }, [closeSearch, onClose]);

      const hasKeyword = keyword.trim().length > 0;

      return (
            <div className="w-[340px] h-full flex flex-col border-r border-gray-200 bg-white overflow-hidden">
                  {/* Search Bar */}
                  <SearchBar
                        keyword={keyword}
                        status={status}
                        onKeywordChange={handleKeywordChange}
                        onSuggestionSelect={handleSuggestionSelect}
                        onSearch={triggerSearch}
                        onBack={handleClose}
                        placeholder={t('search.placeholder')}
                        autoFocus
                  />

                  {/* Divider */}
                  <div className="border-b border-gray-100" />

                  {/* Results or Empty */}
                  {hasKeyword ? (
                        <SearchResults
                              activeTab={activeTab}
                              results={results}
                              status={status}
                              keyword={keyword}
                              executionTimeMs={executionTimeMs}
                              pendingMatchCount={pendingMatchCount}
                              errorMessage={errorMessage}
                              onTabChange={handleTabChange}
                              onMergeNewMatches={mergeNewMatches}
                              onConversationMessageClick={handleConversationMessageClick}
                              onContactClick={handleContactClick}
                              onGroupClick={handleGroupClick}
                              onMediaClick={handleMediaClick}
                              onSendMessage={handleSendMessage}
                              onAddFriend={handleAddFriend}
                              onAcceptRequest={(_requestId, contactId) => handleAcceptFriendRequest(contactId)}
                              onCancelRequest={(_requestId, contactId) => handleCancelFriendRequest(contactId)}
                        />
                  ) : (
                        <SearchEmpty />
                  )}

                  {/* Friend Request Modal */}
                  <FriendRequestModal
                        visible={!!friendRequestTarget}
                        target={friendRequestTarget}
                        onClose={() => setFriendRequestTarget(null)}
                  />
            </div>
      );
}
