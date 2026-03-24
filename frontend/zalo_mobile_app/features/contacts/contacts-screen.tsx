import React, { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View, TouchableOpacity, Text } from 'react-native';
import { useTheme } from 'react-native-paper';
import { useAuth } from '@/providers/auth-provider';
import { mobileApi } from '@/services/api';

import { FriendList } from './components/friend-list';
import { InvitationList } from './components/invitation-list';
import { GroupList } from './components/group-list';
import { Friend, FriendRequest } from '@/types/friendship';
import { Conversation } from '@/types/conversation';

type MainTab = 'friends' | 'invitations' | 'groups';
type InvitationSubTab = 'received' | 'sent';

export function ContactsScreen() {
  const { accessToken } = useAuth();
  const theme = useTheme();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<MainTab>('friends');
  const [invitationTab, setInvitationTab] = useState<InvitationSubTab>('received');

  const [friends, setFriends] = useState<Friend[]>([]);
  const [receivedRequests, setReceivedRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [groups, setGroups] = useState<Conversation[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    if (!accessToken) return;

    try {
      if (activeTab === 'friends') {
        const response = await mobileApi.getFriends(accessToken);
        setFriends(response.data as Friend[]);
      } else if (activeTab === 'invitations') {
        if (invitationTab === 'received') {
          const response = await mobileApi.getReceivedFriendRequests(accessToken);
          setReceivedRequests(response);
        } else {
          const response = await mobileApi.getSentFriendRequests(accessToken);
          setSentRequests(response);
        }
      } else if (activeTab === 'groups') {
        const response = await mobileApi.getGroups(accessToken);
        setGroups(response.data);
      }
    } catch (error) {
      console.error('Error loading contacts data:', error);
    }
  }, [accessToken, activeTab, invitationTab]);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      loadData().finally(() => setIsLoading(false));
    }, [loadData])
  );

  const onRefresh = async () => {
    setIsRefreshing(true);
    await loadData().finally(() => setIsRefreshing(false));
  };

  const handleAccept = async (id: string) => {
    if (!accessToken) return;
    await mobileApi.acceptFriendRequest(id, accessToken);
    loadData();
  };

  const handleDecline = async (id: string) => {
    if (!accessToken) return;
    await mobileApi.declineFriendRequest(id, accessToken);
    loadData();
  };

  const handleCancel = async (id: string) => {
    if (!accessToken) return;
    await mobileApi.cancelFriendRequest(id, accessToken);
    loadData();
  };

  const handlePressFriend = (friend: Friend) => {
    router.push({
      pathname: '/chat/new' as any,
      params: { userId: friend.userId }
    });
  };

  const handlePressGroup = (id: string) => {
    router.push({
      pathname: `/chat/${id}` as any
    });
  };

  const handleCall = (friend: Friend) => {
    console.log('Calling', friend.resolvedDisplayName || friend.displayName);
    // Placeholder for call functionality
  };

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
            onPress={() => setActiveTab(tab)}
            className={`flex-1 items-center py-3 border-b-2 ${isActive ? 'border-white' : 'border-transparent'}`}
          >
            <Text className={`font-bold ${isActive ? 'text-white' : 'text-white/60'}`}>
              {labels[tab]}
            </Text>
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
    <View className="flex-1 bg-[#f4f5f7]">
      {renderTabHeader()}

      {activeTab === 'invitations' && renderInvitationSubHeader()}

      <View className="flex-1">
        {isLoading && !isRefreshing ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : (
          <>
            {activeTab === 'friends' && (
              <FriendList
                friends={friends}
                onCall={handleCall}
                onPress={handlePressFriend}
                isRefreshing={isRefreshing}
                onRefresh={onRefresh}
              />
            )}
            {activeTab === 'invitations' && (
              <InvitationList
                requests={invitationTab === 'received' ? receivedRequests : sentRequests}
                mode={invitationTab === 'received' ? 'RECEIVED' : 'SENT'}
                onAccept={handleAccept}
                onDecline={handleDecline}
                onCancel={handleCancel}
                isRefreshing={isRefreshing}
                onRefresh={onRefresh}
              />
            )}
            {activeTab === 'groups' && (
              <GroupList
                groups={groups}
                onPress={handlePressGroup}
                isRefreshing={isRefreshing}
                onRefresh={onRefresh}
              />
            )}
          </>
        )}
      </View>
    </View>
  );
}
