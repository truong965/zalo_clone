import React, { useEffect, useState, useMemo } from 'react';
import { View, Alert, Keyboard, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Appbar, Searchbar } from 'react-native-paper';
import { useSearch } from '@/features/search/hooks/use-search';
import { SearchResults } from '@/features/search/components/search-results';
import { useAuth } from '@/providers/auth-provider';
import { mobileApi, ApiRequestError } from '@/services/api';
import Toast from 'react-native-toast-message';
import { useSendFriendRequest, useCancelRequest, useAcceptRequest } from '@/features/friendship/api/friendship.api';
import type { ContactSearchResult, GroupSearchResult, RelationshipStatus, ConversationMessageGroup, MediaSearchResult } from '@/features/search/types';
import { SearchSuggestions } from '@/features/search/components/search-suggestions';
import { SearchLoading } from '@/features/search/components/search-loading';
import { useChatStore } from '@/features/chats/stores/chat.store';

export default function SearchScreen() {
  const router = useRouter();
  const { accessToken } = useAuth();
  const [isActionLoading, setIsActionLoading] = useState(false);

  const sendRequest = useSendFriendRequest();
  const cancelReq = useCancelRequest();
  const acceptReq = useAcceptRequest();

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
    triggerSearch,
    mergeNewMatches,
    closeSearch,
    handleResultClick,
  } = useSearch();

  const searchbarStyle = useMemo(() => ({ backgroundColor: 'white', height: 40, borderRadius: 8 }), []);
  const searchbarInputStyle = useMemo(() => ({ minHeight: 0, fontSize: 14, paddingBottom: 6 }), []);

  useEffect(() => {
    return () => closeSearch();
  }, [closeSearch]);

  const handleMessageUser = async (contactId: string) => {
    const contact = results?.contacts.find(c => c.id === contactId);
    if (!contact || !accessToken || isActionLoading) return;

    if (contact.canMessage === false) {
      Alert.alert(
        `Kết bạn: ${contact.displayName}`,
        'Người này chặn nhận tin nhắn từ người lạ. Bạn cần gửi yêu cầu kết bạn để nhắn tin.',
        [
          { text: 'Hủy', style: 'cancel' },
          {
            text: 'Kết bạn',
            onPress: () => handleAddFriend(contactId)
          }
        ]
      );
      return;
    }

    handleResultClick(contactId);
    setIsActionLoading(true);
    try {
      const conversationId = contact.existingConversationId
        ? contact.existingConversationId
        : (await mobileApi.getOrCreateDirectConversation(contact.id, accessToken)).id;

      closeSearch();
      router.navigate({ pathname: '/chat/[id]', params: { id: conversationId } } as any);
    } catch (error) {
      Toast.show({ type: 'error', text1: 'Lỗi', text2: 'Không thể mở cuộc trò chuyện' });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleContactClick = (
    result: ContactSearchResult,
    effectiveStatus: RelationshipStatus,
    effectiveDirection?: 'OUTGOING' | 'INCOMING' | null,
    effectivePendingId?: string | null
  ) => {
    handleResultClick(result.id);
    if (effectiveStatus === 'FRIEND') {
      handleMessageUser(result.id);
    } else if (effectiveStatus === 'BLOCKED') {
      Toast.show({ type: 'info', text1: 'Đã chặn', text2: 'Trò chuyện bị vô hiệu hóa' });
    } else {
      handleMessageUser(result.id);
    }
  };

  const handleAddFriend = (contactId: string) => {
    handleResultClick(contactId);
    sendRequest.mutate(contactId, {
      onSuccess: () => {
        Toast.show({ type: 'success', text1: 'Thành công', text2: 'Đã gửi yêu cầu kết bạn' });
        triggerSearch(keyword);
      },
      onError: (error: any) => {
        const message = error instanceof ApiRequestError && error.status === 409
          ? 'Yêu cầu kết bạn đã tồn tại hoặc đang chờ'
          : error?.message || 'Không thể gửi yêu cầu kết bạn';
        Toast.show({ type: 'error', text1: 'Lỗi', text2: message });
      }
    });
  };

  const handleAcceptRequest = (requestId: string, contactId: string) => {
    acceptReq.mutate(requestId, {
      onSuccess: () => {
        Toast.show({ type: 'success', text1: 'Thành công', text2: 'Đã chấp nhận kết bạn' });
        triggerSearch(keyword);
      },
      onError: () => Toast.show({ type: 'error', text1: 'Lỗi', text2: 'Không thể chấp nhận kết bạn' })
    });
  };

  const handleCancelRequest = (requestId: string, contactId: string) => {
    cancelReq.mutate(requestId, {
      onSuccess: () => {
        Toast.show({ type: 'success', text1: 'Thành công', text2: 'Đã hủy yêu cầu kết bạn' });
        triggerSearch(keyword);
      },
      onError: () => Toast.show({ type: 'error', text1: 'Lỗi', text2: 'Không thể hủy yêu cầu' })
    });
  };

  const handleGroupClick = (group: GroupSearchResult) => {
    handleResultClick(group.id);
    closeSearch();
    router.navigate({ pathname: '/chat/[id]', params: { id: group.id } } as any);
  };

  const handleConversationMessageClick = (data: ConversationMessageGroup) => {
    handleResultClick(data.conversationId);
    closeSearch();
    router.navigate({ 
      pathname: '/chat/[id]/search', 
      params: { id: data.conversationId, keyword } 
    } as any);
  };

  const { setJumpToMessageId } = useChatStore();

  const handleMediaClick = (result: MediaSearchResult) => {
    handleResultClick(result.id);
    closeSearch();
    // Use jump to message logic
    setJumpToMessageId(result.messageId);
    router.navigate({ pathname: '/chat/[id]', params: { id: result.conversationId } } as any);
  };

  return (
    <View className="flex-1 bg-background">
      <Appbar.Header className="bg-[#1E88E5]">
        <View className="flex-1 mr-3">
          <Searchbar
            autoFocus
            placeholder="Tìm kiếm"
            returnKeyType="search"
            onChangeText={handleKeywordChange}
            value={keyword}
            onSubmitEditing={(e) => {
              triggerSearch(e.nativeEvent.text);
              Keyboard.dismiss();
            }}
            loading={status === 'loading'}
            style={searchbarStyle}
            inputStyle={searchbarInputStyle}
          />
        </View>
      </Appbar.Header>

      <View className="flex-1">
        {status === 'loading' && !results && <SearchLoading />}

        {keyword.trim() === '' && !results && (
          <SearchSuggestions onSelect={(k) => handleKeywordChange(k)} />
        )}

        {keyword.trim().length > 0 && keyword.trim().length < 3 && !results && status !== 'loading' && (
          <View className="px-6 py-10 items-center justify-center">
            <Text className="text-gray-400 text-sm text-center">
              Nhập tối thiểu 3 ký tự để tìm kiếm
            </Text>
          </View>
        )}

        {(results || (status === 'success' && keyword.trim() !== '')) && (
          <SearchResults
            activeTab={activeTab}
            results={results}
            status={status}
            keyword={keyword}
            executionTimeMs={executionTimeMs}
            errorMessage={errorMessage}
            pendingMatchCount={pendingMatchCount}
            isActionLoading={isActionLoading}
            onTabChange={handleTabChange}
            onMergeNewMatches={mergeNewMatches}
            onContactClick={handleContactClick}
            onSendMessage={handleMessageUser}
            onAddFriend={handleAddFriend}
            onGroupClick={handleGroupClick}
            onAcceptRequest={handleAcceptRequest}
            onCancelRequest={handleCancelRequest}
            onConversationMessageClick={handleConversationMessageClick}
            onMediaClick={handleMediaClick}
          />
        )}
      </View>
    </View>
  );
}
