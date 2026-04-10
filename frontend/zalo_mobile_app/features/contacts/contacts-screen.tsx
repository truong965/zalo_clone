import React, { useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, View, TouchableOpacity, Text } from 'react-native';
import { useTheme, Appbar, Searchbar, Badge, Portal, Modal, Button } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { 
  useReceivedRequests, 
  useSentRequests, 
  useFriendsList, 
  useGroups,
  useAcceptRequest,
  useDeclineRequest,
  useCancelRequest,
  useGetOrCreateDirectConversation,
  useSendFriendRequest
} from '../friendship/api/friendship.api';
import { FriendList } from './components/friend-list';
import { InvitationList } from './components/invitation-list';
import { GroupList } from './components/group-list';
import { Friend, FriendRequest } from '@/types/friendship';
import { Conversation } from '@/types/conversation';
import { FriendshipSearchModal } from './components/friendship-search-modal';
import { useFriendshipUIStore } from '../friendship/stores/friendship-ui.store';
import { useCallActions } from '../calls/hooks/use-call-actions';
import { CallType } from '../calls/stores/call.store';

import { useSyncedContacts } from './hooks/use-synced-contacts';
import { useSyncContacts } from './hooks/use-sync-contacts';
import { useContactSyncStore } from './stores/contact-sync.store';

type MainTab = 'friends' | 'contacts' | 'invitations' | 'groups';
type InvitationSubTab = 'received' | 'sent';

export function ContactsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<MainTab>('friends');
  const [invitationTab, setInvitationTab] = useState<InvitationSubTab>('received');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFriendSearchOpen, setIsFriendSearchOpen] = useState(false);
  const [showCallMenu, setShowCallMenu] = useState(false);
  const [selectedFriendForCall, setSelectedFriendForCall] = useState<Friend | null>(null);
  
  const { 
    lastSeenInvitationCount, 
    setLastSeenInvitationCount, 
    isBadgeDismissed, 
    dismissBadge, 
    resetBadge 
  } = useFriendshipUIStore();

  const { isSyncing, performSync } = useSyncContacts();
  const { isBackgroundProcessing, showModal } = useContactSyncStore();

  // Query Hooks
  const { 
    data: friendsData, 
    isLoading: isLoadingFriends, 
    refetch: refetchFriends,
    isFetchingNextPage: isFetchingMoreFriends,
    hasNextPage: hasMoreFriends,
    fetchNextPage: fetchMoreFriends
  } = useFriendsList({ search: searchQuery });

  // Synced contacts (suggestions) - only load if in friends tab or contacts tab or search is phone-like
  const {
    data: syncedData,
    isLoading: isLoadingSynced,
    refetch: refetchSynced,
    fetchNextPage: fetchMoreSynced,
    hasNextPage: hasMoreSynced,
    isFetchingNextPage: isFetchingMoreSynced,
  } = useSyncedContacts({ 
    search: searchQuery, 
    excludeFriends: true 
  });

  const { 
    data: receivedRequestsData, 
    isLoading: isLoadingReceived, 
    refetch: refetchReceived,
    isFetchingNextPage: isFetchingMoreReceived,
    hasNextPage: hasMoreReceived,
    fetchNextPage: fetchMoreReceived
  } = useReceivedRequests();

  const { 
    data: sentRequestsData, 
    isLoading: isLoadingSent, 
    refetch: refetchSent,
    isFetchingNextPage: isFetchingMoreSent,
    hasNextPage: hasMoreSent,
    fetchNextPage: fetchMoreSent
  } = useSentRequests();
  
  const { 
    data: groupsData, 
    isLoading: isLoadingGroups, 
    refetch: refetchGroups,
    isFetchingNextPage: isFetchingMoreGroups,
    hasNextPage: hasMoreGroups,
    fetchNextPage: fetchMoreGroups
  } = useGroups({ search: searchQuery });

  // Mutation Hooks
  const { mutate: acceptRequest } = useAcceptRequest();
  const { mutate: declineRequest } = useDeclineRequest();
  const { mutate: cancelRequest } = useCancelRequest();
  const { mutate: getOrCreateDirect } = useGetOrCreateDirectConversation();
  const { mutate: sendFriendRequest } = useSendFriendRequest();
  const { initiateCall } = useCallActions();

  const friends = friendsData?.pages.flatMap(page => page.data) || [];
  const groups = groupsData?.pages.flatMap(page => page.data) || [];
  const syncedContacts = syncedData?.pages.flatMap(page => page.data) || [];
  const receivedRequests = receivedRequestsData?.pages.flatMap(page => page.data) || [];
  const sentRequests = sentRequestsData?.pages.flatMap(page => page.data) || [];
  const totalReceived = (receivedRequestsData?.pages[0]?.meta as any)?.totalCount ?? receivedRequests.length;

  // Filter mutual suggestions (isMutual = true, and not already friends which is handled by excludeFriends=true)
  const mutualSuggestions = useMemo(() => {
    return syncedContacts.filter(c => c.isMutual);
  }, [syncedContacts]);

  // Badge Logic
  React.useEffect(() => {
    if (totalReceived > lastSeenInvitationCount) {
      resetBadge();
    }
  }, [totalReceived, lastSeenInvitationCount, resetBadge]);

  React.useEffect(() => {
    if (activeTab === 'invitations') {
      dismissBadge();
      setLastSeenInvitationCount(totalReceived);
    }
  }, [activeTab, totalReceived, dismissBadge, setLastSeenInvitationCount]);

  const showInvitationBadge = !isBadgeDismissed && totalReceived > 0;

  const isLoading = activeTab === 'friends' ? isLoadingFriends :
                    activeTab === 'contacts' ? isLoadingSynced :
                    activeTab === 'invitations' ? (invitationTab === 'received' ? isLoadingReceived : isLoadingSent) :
                    isLoadingGroups;

  const onRefresh = async () => {
    if (activeTab === 'friends') await refetchFriends();
    else if (activeTab === 'contacts') await refetchSynced();
    else if (activeTab === 'invitations') {
      await Promise.all([refetchReceived(), refetchSent()]);
    }
    else if (activeTab === 'groups') await refetchGroups();
  };

  const handleAccept = (id: string) => {
    acceptRequest(id, {
      onSuccess: () => {
        Toast.show({ type: 'success', text1: 'Thành công', text2: 'Đã chấp nhận kết bạn' });
      }
    });
  };

  const handleDecline = (id: string) => {
    declineRequest(id, {
      onSuccess: () => {
        Toast.show({ type: 'success', text1: 'Thành công', text2: 'Đã từ chối lời mời' });
      }
    });
  };

  const handleCancel = (id: string) => {
    cancelRequest(id, {
      onSuccess: () => {
        Toast.show({ type: 'success', text1: 'Thành công', text2: 'Đã hủy lời mời' });
      }
    });
  };

  const handlePressFriend = (friend: any) => {
    getOrCreateDirect(friend.userId || friend.contactUserId, {
      onSuccess: (conversation: Conversation) => {
        router.navigate(`/chat/${conversation.id}` as any);
      }
    });
  };

  const handleAddFriend = (userId: string) => {
    sendFriendRequest(userId, {
      onSuccess: () => {
        Toast.show({ type: 'success', text1: 'Thành công', text2: 'Đã gửi lời mời kết bạn' });
      }
    });
  };

  const handlePressGroup = (id: string) => {
    router.navigate(`/chat/${id}` as any);
  };

  const handleCall = (friend: Friend) => {
    setSelectedFriendForCall(friend);
    setShowCallMenu(true);
  };

  const handleConfirmCall = (callType: CallType) => {
    setShowCallMenu(false);
    if (!selectedFriendForCall) return;

    const friend = selectedFriendForCall;
    getOrCreateDirect(friend.userId, {
      onSuccess: (conversation: Conversation) => {
        initiateCall({
          callType,
          peerId: friend.userId,
          peerInfo: {
            displayName: friend.resolvedDisplayName || friend.displayName,
            avatarUrl: friend.avatarUrl || null,
          },
          conversationId: conversation.id,
          isGroupCall: false,
        });
      },
      onError: () => {
        Toast.show({ type: 'error', text1: 'Lỗi', text2: 'Không thể tạo hội thoại để thực hiện cuộc gọi' });
      }
    });
  };

  const searchPlaceholder = useMemo(() => {
    switch (activeTab) {
      case 'friends': return 'Tìm bạn bè';
      case 'contacts': return 'Tìm từ danh bạ';
      case 'groups': return 'Tìm nhóm';
      case 'invitations': return 'Tìm lời mời';
      default: return t('chats.searchPlaceholder');
    }
  }, [activeTab, t]);

  const renderTabHeader = () => (
    <View className="flex-row bg-[#1E88E5] px-2 shadow-sm">
      {(['friends', 'contacts', 'groups', 'invitations'] as MainTab[]).map((tab) => {
        const isActive = activeTab === tab;
        const labels: Record<MainTab, string> = {
          friends: 'Bạn bè',
          contacts: 'Danh bạ',
          invitations: 'Lời mời',
          groups: 'Nhóm',
        };
        return (
          <TouchableOpacity
            key={tab}
            onPress={() => {
              setActiveTab(tab);
            }}
            className={`flex-1 items-center py-3 border-b-2 ${isActive ? 'border-white' : 'border-transparent'}`}
          >
            <View className="flex-row items-center">
              <Text className={`font-bold ${isActive ? 'text-white' : 'text-white/60'}`} style={{ fontSize: 13 }}>
                {labels[tab]}
              </Text>
              {tab === 'invitations' && showInvitationBadge && (
                <Badge
                  size={16}
                  style={{
                    position: 'absolute',
                    top: -8,
                    right: -12,
                    backgroundColor: '#FF5252',
                    color: 'white',
                    fontSize: 10,
                  }}
                >
                  {totalReceived}
                </Badge>
              )}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderInvitationSubHeader = () => (
    <View className="flex-row bg-white border-b border-border shadow-sm">
      {(['received', 'sent'] as InvitationSubTab[]).map((tab) => {
        const isActive = invitationTab === tab;
        const labels: Record<InvitationSubTab, string> = {
          received: 'Đã nhận',
          sent: 'Đã gửi',
        };
        return (
          <TouchableOpacity
            key={tab}
            onPress={() => setInvitationTab(tab)}
            className={`flex-1 items-center py-3 border-b-2 ${isActive ? 'border-primary' : 'border-transparent'}`}
          >
            <Text className={`font-medium ${isActive ? 'text-primary' : 'text-gray-500'}`}>
              {labels[tab]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <View className="flex-1 bg-background">
      <Appbar.Header elevated style={{ paddingHorizontal: 12, backgroundColor: '#1E88E5' }}>
        <View className="flex-1 flex-row items-center justify-between">
          <View className="flex-1 mr-2">
            <Searchbar
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={{ backgroundColor: 'rgba(255,255,255,0.2)', height: 40, elevation: 0 }}
              inputStyle={{ minHeight: 0, fontSize: 14, color: '#fff' }}
              placeholderTextColor="rgba(255,255,255,0.6)"
              iconColor="rgba(255,255,255,0.7)"
              rippleColor="rgba(255,255,255,0.1)"
              icon={() => <Ionicons name="search" size={20} color="rgba(255,255,255,0.7)" />}
              clearIcon={() => searchQuery ? <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.7)" /> : null}
            />
          </View>
          <View className="flex-row items-center">
            <Appbar.Action
              icon={({ size }) => <Ionicons name="sync-outline" size={size} color="#fff" />}
              onPress={performSync}
              disabled={isSyncing}
            />
            <Appbar.Action
              icon={({ size }) => <Ionicons name="person-add-outline" size={size} color="#fff" />}
              onPress={() => setIsFriendSearchOpen(true)}
            />
          </View>
        </View>
      </Appbar.Header>

      <View className="flex-1 bg-[#f0f2f5]">
        {renderTabHeader()}

        {activeTab === 'invitations' && renderInvitationSubHeader()}

        {isBackgroundProcessing && (
          <TouchableOpacity 
            onPress={showModal}
            className="bg-blue-50 px-4 py-2 flex-row items-center border-b border-blue-100"
          >
            <ActivityIndicator size="small" color="#1E88E5" className="mr-3" />
            <Text className="text-blue-700 font-medium">Đang đồng bộ danh bạ ngầm (Bấm để xem)...</Text>
          </TouchableOpacity>
        )}

        <View className="flex-1">
          {isLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : (
            <>
              {activeTab === 'friends' && (
                <FriendList
                  friends={friends as any}
                  suggestions={[]} // Do not show suggestions in Friends tab anymore
                  onCall={handleCall}
                  onPress={handlePressFriend}
                  onAddFriend={handleAddFriend}
                  isRefreshing={isLoadingFriends}
                  onRefresh={onRefresh}
                  onEndReached={fetchMoreFriends}
                  hasNextPage={hasMoreFriends}
                  isFetchingNextPage={isFetchingMoreFriends}
                />
              )}
              {activeTab === 'contacts' && (
                <FriendList
                  friends={[]}
                  suggestions={syncedContacts as any} // Show ALL synced contacts in Contacts tab
                  onCall={handleCall}
                  onPress={handlePressFriend}
                  onAddFriend={handleAddFriend}
                  isRefreshing={isLoadingSynced}
                  onRefresh={onRefresh}
                  onEndReachedSuggestions={fetchMoreSynced}
                  hasNextPageSuggestions={hasMoreSynced}
                  isFetchingNextPageSuggestions={isFetchingMoreSynced}
                />
              )}
              {activeTab === 'invitations' && (
                <InvitationList
                  requests={(invitationTab === 'received' ? receivedRequests : sentRequests) || []}
                  search={searchQuery}
                  mode={invitationTab === 'received' ? 'RECEIVED' : 'SENT'}
                  onAccept={handleAccept}
                  onDecline={handleDecline}
                  onCancel={handleCancel}
                  isRefreshing={invitationTab === 'received' ? isLoadingReceived : isLoadingSent}
                  onRefresh={onRefresh}
                  onEndReached={invitationTab === 'received' ? fetchMoreReceived : fetchMoreSent}
                  hasNextPage={invitationTab === 'received' ? hasMoreReceived : hasMoreSent}
                  isFetchingNextPage={invitationTab === 'received' ? isFetchingMoreReceived : isFetchingMoreSent}
                />
              )}
              {activeTab === 'groups' && (
                <GroupList
                  groups={groups as any}
                  onPress={handlePressGroup}
                  isRefreshing={isLoadingGroups}
                  onRefresh={onRefresh}
                  onEndReached={fetchMoreGroups}
                  hasNextPage={hasMoreGroups}
                  isFetchingNextPage={isFetchingMoreGroups}
                />
              )}
            </>
          )}
        </View>
      </View>
      <FriendshipSearchModal visible={isFriendSearchOpen} onClose={() => setIsFriendSearchOpen(false)} />

      <Portal>
        <Modal
          visible={showCallMenu}
          onDismiss={() => setShowCallMenu(false)}
          contentContainerStyle={styles.modalContent}
        >
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Bắt đầu cuộc gọi</Text>
            <Text style={styles.modalSubtitle}>Sử dụng camera hay không?</Text>
          </View>
          
          <View style={styles.modalActions}>
            <TouchableOpacity 
              style={styles.modalOption} 
              onPress={() => handleConfirmCall('VOICE')}
            >
              <View style={[styles.modalIconBg, { backgroundColor: '#f3f4f6' }]}>
                <Ionicons name="call" size={24} color="#4b5563" />
              </View>
              <Text style={styles.modalOptionText}>Tắt Camera</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.modalOption} 
              onPress={() => handleConfirmCall('VIDEO')}
            >
              <View style={[styles.modalIconBg, { backgroundColor: '#eff6ff' }]}>
                <Ionicons name="videocam" size={24} color="#3b82f6" />
              </View>
              <Text style={styles.modalOptionText}>Bật Camera</Text>
            </TouchableOpacity>
          </View>

          <Button 
            mode="text" 
            onPress={() => setShowCallMenu(false)} 
            textColor="#ef4444"
            style={styles.cancelBtn}
          >
            Hủy
          </Button>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  modalContent: {
    backgroundColor: 'white',
    padding: 24,
    margin: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
    marginBottom: 16,
  },
  modalOption: {
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  modalIconBg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  cancelBtn: {
    marginTop: 8,
  },
});
