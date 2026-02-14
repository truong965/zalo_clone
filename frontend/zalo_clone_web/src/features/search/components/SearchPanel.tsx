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
import { FriendRequestModal } from '@/features/contacts/components/friend-request-modal';
import { conversationService } from '@/services/conversation.service';
import { searchService } from '../api/search.service';
import { handleInteractionError } from '@/utils/interaction-error';
import { useAcceptRequest, useCancelRequest } from '@/features/contacts/api/friendship.api';
import type {
      ConversationMessageGroup,
      ContactSearchResult,
      GroupSearchResult,
      MediaSearchResult,
} from '../types';

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

      const acceptRequest = useAcceptRequest();
      const cancelRequest = useCancelRequest();

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
       * 1. existingConversationId → navigate directly
       * 2. canMessage === false → show friend request modal
       * 3. canMessage === true → call API to create conversation, refresh list, navigate
       */
      const handleContactClick = useCallback(
            async (result: ContactSearchResult) => {
                  // Guard: prevent duplicate calls while async is in-flight
                  if (isContactActionLoading) return;

                  // Track click for search history (fire and forget)
                  const trimmedKw = keyword.trim();
                  if (trimmedKw) {
                        searchService.trackResultClick(trimmedKw, result.id).catch(() => { });
                  }

                  // Case 1: Already have a conversation → navigate directly
                  if (result.existingConversationId) {
                        onNavigateToConversation?.(result.existingConversationId);
                        return;
                  }

                  // Case 2: canMessage === false (privacy: CONTACTS only & not friend)
                  if (result.canMessage === false) {
                        setFriendRequestTarget({
                              userId: result.id,
                              displayName: result.displayNameFinal,
                              avatarUrl: result.avatarUrl,
                        });
                        return;
                  }

                  // Case 3: canMessage === true (or undefined for friends) → create conversation
                  setIsContactActionLoading(true);
                  try {
                        const conv = await conversationService.getOrCreateDirectConversation(result.id);
                        // Invalidate conversations cache so the new conversation appears in the list
                        await queryClient.invalidateQueries({ queryKey: ['conversations'] });
                        onNavigateToConversation?.(conv.id);
                  } catch (error) {
                        const errResult = handleInteractionError(error, {
                              target: { userId: result.id, displayName: result.displayNameFinal, avatarUrl: result.avatarUrl },
                        });
                        // 403 privacy restriction (not blocked) → show friend request modal
                        if (errResult.isPrivacyRestriction) {
                              setFriendRequestTarget({
                                    userId: result.id,
                                    displayName: result.displayNameFinal,
                                    avatarUrl: result.avatarUrl,
                              });
                        }
                        // isBlocked → notification already shown by handleInteractionError
                        // other errors → notification already shown by handleInteractionError
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
                                    ? { userId: contact.id, displayName: contact.displayNameFinal, avatarUrl: contact.avatarUrl }
                                    : undefined,
                        });
                        // 403 privacy restriction (not blocked) → show friend request modal
                        if (errResult.isPrivacyRestriction && contact) {
                              setFriendRequestTarget({
                                    userId: contact.id,
                                    displayName: contact.displayNameFinal,
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
                              displayName: contact.displayNameFinal,
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
                        notification.warning({ message: 'Thiếu mã lời mời để chấp nhận' });
                        return;
                  }

                  acceptRequest.mutate(contact.pendingRequestId, {
                        onSuccess: () => {
                              notification.success({ message: 'Đã chấp nhận lời mời kết bạn' });
                              triggerSearch(keyword);
                              void queryClient.invalidateQueries({ queryKey: ['friendship'] });
                        },
                        onError: () => {
                              notification.error({ message: 'Không thể chấp nhận lời mời' });
                        },
                  });
            },
            [acceptRequest, keyword, results, triggerSearch, queryClient],
      );

      const handleCancelFriendRequest = useCallback(
            (contactId: string) => {
                  const contact = results?.contacts.find((c) => c.id === contactId);
                  if (!contact?.pendingRequestId) {
                        notification.warning({ message: 'Thiếu mã lời mời để thu hồi' });
                        return;
                  }

                  cancelRequest.mutate(contact.pendingRequestId, {
                        onSuccess: () => {
                              notification.success({ message: 'Đã thu hồi lời mời kết bạn' });
                              triggerSearch(keyword);
                              void queryClient.invalidateQueries({ queryKey: ['friendship'] });
                        },
                        onError: () => {
                              notification.error({ message: 'Không thể thu hồi lời mời' });
                        },
                  });
            },
            [cancelRequest, keyword, results, triggerSearch, queryClient],
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
                        placeholder="Tìm kiếm tin nhắn, liên hệ..."
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
                              onAcceptRequest={(requestId, contactId) => handleAcceptFriendRequest(contactId)}
                              onCancelRequest={(requestId, contactId) => handleCancelFriendRequest(contactId)}
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
