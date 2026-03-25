import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs, useRouter } from 'expo-router';
import type { Href } from 'expo-router';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Appbar, Searchbar, Menu, Divider, Badge } from 'react-native-paper';
import { useReceivedRequests } from '@/features/friendship/api/friendship.api';
import { useFriendshipUIStore } from '@/features/friendship/stores/friendship-ui.store';
import { HapticTab } from '@/components/haptic-tab';
import { useAuth } from '@/providers/auth-provider';
import { FriendshipSearchModal } from '@/features/contacts/components/friendship-search-modal';
import { CreateGroupModal } from '@/features/chats/components/modals/create-group-modal';

export default function TabLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const loginHref = '/login' as Href;
  const [searchQuery, setSearchQuery] = useState('');
  const [menuVisible, setMenuVisible] = useState(false);
  const [isFriendSearchOpen, setIsFriendSearchOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  
  const { lastSeenInvitationCount, isBadgeDismissed } = useFriendshipUIStore();
  const { data: receivedRequestsData } = useReceivedRequests({ limit: 1 });
  
  const receivedRequests = receivedRequestsData?.pages.flatMap(page => page.data) || [];
  const totalReceived = (receivedRequestsData?.pages[0]?.meta as any)?.totalCount ?? receivedRequests.length;
  const showBadge = !isBadgeDismissed && totalReceived > lastSeenInvitationCount;

  const openMenu = () => setMenuVisible(true);
  const closeMenu = () => setMenuVisible(false);

  if (isLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return <Redirect href={loginHref} />;
  }

  const renderHeaderActions = (routeName: string) => {
    switch (routeName) {
      case 'index':
        return (
          <>
            <Appbar.Action
              icon={({ size, color }) => <Ionicons name="qr-code-outline" size={size} color={color} />}
              onPress={() => router.push('/qr-scanner')}
            />
            <Menu
              visible={menuVisible}
              onDismiss={closeMenu}
              anchor={
                <Appbar.Action
                  icon={({ size, color }) => <Ionicons name="add" size={size} color={color} />}
                  onPress={openMenu}
                />
              }
              contentStyle={{ backgroundColor: 'white' }}
            >
              <Menu.Item
                onPress={() => {
                  closeMenu();
                  setIsFriendSearchOpen(true);
                }}
                leadingIcon={({ size, color }) => <Ionicons name="person-add-outline" size={size} color={color} />}
                title="Thêm bạn"
              />
              <Divider />
              <Menu.Item
                onPress={() => {
                  closeMenu();
                  setIsCreateGroupOpen(true);
                }}
                leadingIcon={({ size, color }) => <Ionicons name="people-outline" size={size} color={color} />}
                title="Tạo nhóm"
              />
            </Menu>
          </>
        );
      case 'contacts':
        return (
          <Appbar.Action
            icon={({ size, color }) => <Ionicons name="person-add-outline" size={size} color={color} />}
            onPress={() => setIsFriendSearchOpen(true)}
          />
        );
      case 'profile':
        return (
          <Appbar.Action
            icon={({ size, color }) => <Ionicons name="settings-outline" size={size} color={color} />}
            onPress={() => router.push('/profile/settings' as Href)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <View className="flex-1 bg-background">
      <Tabs
        screenOptions={({ route }) => ({
          headerShown: true,
          header: () => (
            <Appbar.Header
              style={{
                paddingHorizontal: 12,
                backgroundColor: '#1E88E5'
              }}
            >
              <View className="flex-1 flex-row items-center justify-between">
                <View className="flex-1 mr-2">
                  <Pressable onPress={() => router.push('/search' as Href)}>
                    <View pointerEvents="none">
                      <Searchbar
                        placeholder={t('chats.searchPlaceholder')}
                        value=""
                        editable={false}
                        style={{ backgroundColor: 'rgba(255,255,255,0.2)', height: 40 }}
                        inputStyle={{ minHeight: 0, fontSize: 14, color: '#fff' }}
                        placeholderTextColor="rgba(255,255,255,0.6)"
                        iconColor="rgba(255,255,255,0.7)"
                      />
                    </View>
                  </Pressable>
                </View>
                <View className="flex-row items-center">
                  {renderHeaderActions(route.name)}
                </View>
              </View>
            </Appbar.Header>
          ),
          tabBarButton: HapticTab,
          tabBarShowLabel: false,
          tabBarStyle: {
            borderTopWidth: 1,
            borderTopColor: '#e5e7eb',
            paddingVertical: 0,
            paddingHorizontal: 0,
          },
        })}>
        <Tabs.Screen
          name="index"
          options={{
            title: t('tabs.chats'),
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="chatbubble-ellipses" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="contacts"
          options={{
            title: t('tabs.contacts'),
            headerShown: false,
            tabBarIcon: ({ color, size }) => (
              <View>
                <Ionicons name="people" size={size} color={color} />
                {showBadge && (
                  <Badge
                    size={16}
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -8,
                      backgroundColor: '#FF5252',
                    }}
                  >
                    {totalReceived}
                  </Badge>
                )}
              </View>
            ),
          }}
        />
        <Tabs.Screen
          name="calls"
          options={{
            title: t('tabs.calls'),
            tabBarIcon: ({ color, size }) => <Ionicons name="call" size={size} color={color} />,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: t('tabs.profile'),
            tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
          }}
        />
      </Tabs>
      <FriendshipSearchModal visible={isFriendSearchOpen} onClose={() => setIsFriendSearchOpen(false)} />
      <CreateGroupModal visible={isCreateGroupOpen} onDismiss={() => setIsCreateGroupOpen(false)} />
    </View>
  );
}
