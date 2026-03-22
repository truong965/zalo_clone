import React, { useMemo, useState } from 'react';
import { View, ScrollView, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import { ProfileHeader } from '@/features/chats/components/settings/profile-header';
import { SettingsListItem } from '@/features/chats/components/settings/settings-list-item';
import { MemberList } from '@/features/chats/components/settings/member-list';
import { useConversationSettings } from '@/features/chats/hooks/use-conversation-settings';
import { useConversationActions } from '@/features/chats/hooks/use-conversation-actions';
import { Modal, TextInput, Portal, Button, Text } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';

export default function SettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken, user } = useAuth();
  const router = useRouter();

  const { data: conversation, isLoading } = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => mobileApi.getConversation(id, accessToken!),
    enabled: !!id && !!accessToken,
  });

  const { updateMutation, leaveMutation, dissolveMutation } = useConversationSettings(id);
  const { pinConversation, muteConversation } = useConversationActions();

  const [editNameVisible, setEditNameVisible] = useState(false);
  const [newName, setNewName] = useState('');

  const currentUserMember = useMemo(() =>
    conversation?.members?.find((m: any) => m.userId === user?.id),
    [conversation, user?.id]
  );

  const isAdmin = useMemo(() =>
    conversation?.type === 'DIRECT' || currentUserMember?.role === 'ADMIN',
    [conversation, currentUserMember]
  );

  const handleUpdateName = () => {
    if (newName.trim()) {
      updateMutation.mutate({ name: newName.trim() });
      setEditNameVisible(false);
    }
  };

  const handleLeaveGroup = () => {
    Alert.alert(
      'Rời nhóm',
      'Bạn có chắc chắn muốn rời nhóm này không?',
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Rời nhóm', style: 'destructive', onPress: () => leaveMutation.mutate() },
      ]
    );
  };

  const handleDissolveGroup = () => {
    Alert.alert(
      'Giải tán nhóm',
      'Tất cả tin nhắn và thành viên sẽ bị xóa. Hành động này không thể hoàn tác.',
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Giải tán', style: 'destructive', onPress: () => dissolveMutation.mutate() },
      ]
    );
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!conversation) return null;

  return (
    <View className="flex-1 bg-background">
      {/* Custom Header */}
      <View
        className="flex-row items-center px-4 py-3 bg-primary"
        style={{ paddingTop: 12, paddingBottom: 12 }}
      >
        <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-white font-bold text-lg ml-2" numberOfLines={1}>
          Chi tiết nhóm
        </Text>
      </View>

      <ScrollView>
        <ProfileHeader
          conversation={conversation as any}
          isAdmin={isAdmin}
          onEditName={() => {
            setNewName(conversation.name || '');
            setEditNameVisible(true);
          }}
          onTogglePin={() => pinConversation({ id: conversation.id, isPinned: !conversation.isPinned })}
          onToggleMute={() => muteConversation(conversation.id)}
        />

        <View className="mt-2" />

        <SettingsListItem
          icon="time-outline"
          label="Danh sách nhắc hẹn"
          onPress={() => console.log('Reminders')}
        />
        <SettingsListItem
          icon="image-outline"
          label="Ảnh/File"
          onPress={() => console.log('Media/File')}
        />

        {conversation.type === 'GROUP' && (
          <>
            <View className="mt-2" />
            <MemberList
              members={conversation.members || []}
              isAdmin={isAdmin}
              onAddMember={() => console.log('Add member')}
              onMemberPress={(uid) => console.log('Member press', uid)}
            />

            <View className="mt-2" />
            <SettingsListItem
              icon="notifications-outline"
              label="Yêu cầu tham gia"
              onPress={() => console.log('Join requests')}
            />
            {isAdmin && (
              <SettingsListItem
                icon="settings-outline"
                label="Thiết lập nhóm"
                onPress={() => console.log('Group settings')}
              />
            )}

            <View className="mt-2" />
            <SettingsListItem
              icon="exit-outline"
              label="Rời nhóm"
              onPress={handleLeaveGroup}
              destructive
            />
            {isAdmin && (
              <SettingsListItem
                icon="trash-outline"
                label="Giải tán nhóm"
                onPress={handleDissolveGroup}
                destructive
              />
            )}
          </>
        )}

        {conversation.type === 'DIRECT' && (
          <>
            <View className="mt-2" />
            <SettingsListItem
              icon="eye-off-outline"
              label="Ẩn trò chuyện"
              onPress={() => console.log('Hide chat')}
            />
            <SettingsListItem
              icon="trash-outline"
              label="Xóa lịch sử trò chuyện"
              onPress={() => console.log('Delete history')}
              destructive
            />
          </>
        )}
      </ScrollView>

      <Portal>
        <Modal
          visible={editNameVisible}
          onDismiss={() => setEditNameVisible(false)}
          contentContainerStyle={{ backgroundColor: 'white', padding: 20, margin: 20, borderRadius: 8 }}
        >
          <Text className="text-lg font-bold mb-4">Đổi tên</Text>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            mode="outlined"
            placeholder="Nhập tên mới"
            autoFocus
          />
          <View className="flex-row justify-end mt-4">
            <Button onPress={() => setEditNameVisible(false)}>Hủy</Button>
            <Button onPress={handleUpdateName}>Lưu</Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}
