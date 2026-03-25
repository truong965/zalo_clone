import React, { useState, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, View, TouchableOpacity, Text } from 'react-native';
import { useTheme, Appbar, Searchbar, Badge } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { 
  useReceivedRequests, 
  useSentRequests, 
  useFriendsList, 
  useGroups,
  useAcceptRequest,
  useDeclineRequest,
  useCancelRequest,
  useGetOrCreateDirectConversation
} from '../friendship/api/friendship.api';
import { FriendList } from './components/friend-list';
import { InvitationList } from './components/invitation-list';
import { GroupList } from './components/group-list';
import { Friend, FriendRequest } from '@/types/friendship';
import { Conversation } from '@/types/conversation';
import { FriendshipSearchModal } from './components/friendship-search-modal';
import { useFriendshipUIStore } from '../friendship/stores/friendship-ui.store';

type MainTab = 'friends' | 'invitations' | 'groups';
type InvitationSubTab = 'received' | 'sent';

export function ContactsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<MainTab>('friends');
  const [invitationTab, setInvitationTab] = useState<InvitationSubTab>('received');
  const [searchQuery, setSearchQuery] = useState('');
  const [isFriendSearchOpen, setIsFriendSearchOpen] = useState(false);
  
  const { 
    lastSeenInvitationCount, 
    setLastSeenInvitationCount, 
    isBadgeDismissed, 
    dismissBadge, 
    resetBadge 
  } = useFriendshipUIStore();

  // Query Hooks
  const { 
    data: friendsData, 
    isLoading: isLoadingFriends, 
    refetch: refetchFriends,
    isFetchingNextPage: isFetchingMoreFriends,
    hasNextPage: hasMoreFriends,
    fetchNextPage: fetchMoreFriends
  } = useFriendsList({ search: searchQuery });

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

  const friends = friendsData?.pages.flatMap(page => page.data) || [];
  const groups = groupsData?.pages.flatMap(page => page.data) || [];
  const receivedRequests = receivedRequestsData?.pages.flatMap(page => page.data) || [];
  const sentRequests = sentRequestsData?.pages.flatMap(page => page.data) || [];
  const totalReceived = (receivedRequestsData?.pages[0]?.meta as any)?.totalCount ?? receivedRequests.length;

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
                    activeTab === 'invitations' ? (invitationTab === 'received' ? isLoadingReceived : isLoadingSent) :
                    isLoadingGroups;

  const onRefresh = async () => {
    if (activeTab === 'friends') await refetchFriends();
    else if (activeTab === 'invitations') {
      await refetchReceived();
      await refetchSent();
    }
    else if (activeTab === 'groups') await refetchGroups();
  };

  const handleAccept = (id: string) => {
    acceptRequest(id);
  };

  const handleDecline = (id: string) => {
    declineRequest(id);
  };

  const handleCancel = (id: string) => {
    cancelRequest(id);
  };

  const handlePressFriend = (friend: Friend) => {
    getOrCreateDirect(friend.userId, {
      onSuccess: (conversation: Conversation) => {
        router.navigate(`/chat/${conversation.id}` as any);
      }
    });
  };

  const handlePressGroup = (id: string) => {
    router.navigate(`/chat/${id}` as any);
  };

  const handleCall = (friend: Friend) => {
    console.log('Calling', friend.resolvedDisplayName || friend.displayName);
  };

  const searchPlaceholder = useMemo(() => {
    switch (activeTab) {
      case 'friends': return 'Tìm bạn bè';
      case 'groups': return 'Tìm nhóm';
      case 'invitations': return 'Tìm lời mời';
      default: return t('chats.searchPlaceholder');
    }
  }, [activeTab, t]);

  const renderTabHeader = () => (
    <View className="flex-row bg-primary px-2">
      {(['friends', 'invitations', 'groups'] as MainTab[]).map((tab) => {
        const isActive = activeTab === tab;
        const labels: Record<MainTab, string> = {
          friends: 'Bạn bè',
          invitations: 'Lời mời',
          groups: 'Nhóm',
        };
        return (
          <TouchableOpacity
            key={tab}
            onPress={() => {
              setActiveTab(tab);
              setSearchQuery(''); // Clear search when switching tabs
            }}
            className={`flex-1 items-center py-3 border-b-2 ${isActive ? 'border-white' : 'border-transparent'}`}
          >
            <View className="flex-row items-center">
              <Text className={`font-bold ${isActive ? 'text-white' : 'text-white/60'}`}>
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
    <View className="flex-row bg-white border-b border-border">
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
            className={`flex-1 items-center py-2.5 border-b-2 ${isActive ? 'border-primary' : 'border-transparent'}`}
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
      <Appbar.Header style={{ paddingHorizontal: 12, backgroundColor: '#1E88E5' }}>
        <View className="flex-1 flex-row items-center justify-between">
          <View className="flex-1 mr-2">
            <Searchbar
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChangeText={setSearchQuery}
              style={{ backgroundColor: 'rgba(255,255,255,0.2)', height: 40 }}
              inputStyle={{ minHeight: 0, fontSize: 14, color: '#fff' }}
              placeholderTextColor="rgba(255,255,255,0.6)"
              iconColor="rgba(255,255,255,0.7)"
              rippleColor="rgba(255,255,255,0.1)"
              // Override default icon and clear icon to white
              icon={() => <Ionicons name="search" size={20} color="rgba(255,255,255,0.7)" />}
              clearIcon={() => searchQuery ? <Ionicons name="close-circle" size={20} color="rgba(255,255,255,0.7)" /> : null}
            />
          </View>
          <Appbar.Action
            icon={({ size }) => <Ionicons name="person-add-outline" size={size} color="#fff" />}
            onPress={() => setIsFriendSearchOpen(true)}
          />
        </View>
      </Appbar.Header>

      <View className="flex-1 bg-[#f4f5f7]">
        {renderTabHeader()}

        {activeTab === 'invitations' && renderInvitationSubHeader()}

        <View className="flex-1">
          {isLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : (
            <>
              {activeTab === 'friends' && (
                <FriendList
                  friends={friends as any}
                  onCall={handleCall}
                  onPress={handlePressFriend}
                  isRefreshing={isLoadingFriends}
                  onRefresh={onRefresh}
                  onEndReached={fetchMoreFriends}
                  hasNextPage={hasMoreFriends}
                  isFetchingNextPage={isFetchingMoreFriends}
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
    </View>
  );
}
