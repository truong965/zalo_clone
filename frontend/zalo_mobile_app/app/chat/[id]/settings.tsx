import React, { useMemo, useState } from 'react';
import { View, ScrollView, Alert, ActivityIndicator, TouchableOpacity } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { SafeAreaView } from 'react-native-safe-area-context';
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
import * as ImagePicker from 'expo-image-picker';

import { DirectSettings } from '@/features/chats/components/settings/direct-settings';
import { GroupSettings } from '@/features/chats/components/settings/group-settings';
import { AvatarOptionsModal } from '@/features/chats/components/modals/avatar-options-modal';
import { AvatarConfirmModal } from '@/features/chats/components/modals/avatar-confirm-modal';
import { useUpdateAlias } from '@/features/chats/hooks/use-update-alias';
import { useConversationMembers } from '@/features/chats/hooks/use-members';
import { useAvatarPicker } from '@/features/chats/hooks/use-avatar-picker';
import Toast from 'react-native-toast-message';

export default function SettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken, user } = useAuth();
  const router = useRouter();

  const { data: conversation, isLoading } = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => mobileApi.getConversation(id, accessToken!),
    enabled: !!id && !!accessToken,
  });

  const { updateMutation } = useConversationSettings(id);
  const { mutate: updateAlias } = useUpdateAlias();

  const [editNameVisible, setEditNameVisible] = useState(false);
  const [avatarOptionsVisible, setAvatarOptionsVisible] = useState(false);
  const [avatarConfirmVisible, setAvatarConfirmVisible] = useState(false);
  const { pickImage, uploadAvatar, isUploading } = useAvatarPicker();
  const [newName, setNewName] = useState('');
  const [pickedImage, setPickedImage] = useState<any | null>(null);

  const { data: conversationMembers = [] } = useConversationMembers(
    id,
    20,
    !!conversation && conversation.type === 'GROUP'
  );

  const currentUserMember = useMemo(() => {
    if (!conversation) return null;
    // Try finding in conversation.members first (direct or small group)
    let member: any = conversation.members?.find((m: any) =>
      (m.userId === user?.id) || (m.id === user?.id)
    );

    // If not found, try finding in conversationMembers from hook
    if (!member) {
      member = conversationMembers.find((m: any) =>
        (m.id === user?.id) || (m.userId === user?.id)
      );
    }

    return member;
  }, [conversation, conversationMembers, user?.id]);

  const isAdmin = useMemo(() => {
    if (conversation?.type === 'DIRECT') return true;
    if (conversation?.myRole) {
      return conversation.myRole.toUpperCase() === 'ADMIN';
    }
    const role = currentUserMember?.role?.toUpperCase();
    return role === 'ADMIN';
  }, [conversation, currentUserMember]);

  const targetUserId = useMemo(() => {
    if (!conversation) return null;
    if (conversation.type === 'DIRECT') {
      const otherMember = conversation.members?.find((m: any) =>
        (m.userId !== user?.id) && (m.id !== user?.id)
      );
      return otherMember?.userId || otherMember?.id || conversation.otherUserId;
    }
    return null;
  }, [conversation, user?.id]);

  const handleUpdateName = () => {
    if (!newName.trim()) return;

    if (conversation?.type === 'DIRECT' && targetUserId) {
      updateAlias({
        contactUserId: targetUserId,
        aliasName: newName.trim(),
        conversationId: id
      }, {
        onSuccess: () => {
          setEditNameVisible(false);
          // Conversations list will be invalidated by hook
        }
      });
    } else {
      updateMutation.mutate({ name: newName.trim() }, {
        onSuccess: () => setEditNameVisible(false),
        onError: (error: any) => {
          Toast.show({ type: 'error', text1: 'Lỗi', text2: error?.message || 'Không thể cập nhật tên' });
        }
      });
    }
  };

  const handlePickImage = async (source: 'camera' | 'library') => {
    const picked = await pickImage(source);
    if (picked) {
      setPickedImage(picked);
      setAvatarConfirmVisible(true);
    }
  };

  const handleConfirmUpload = async () => {
    if (!pickedImage) return;

    try {
      const fileUrl = await uploadAvatar(pickedImage, id, 'GROUP');

      // Update conversation
      updateMutation.mutate({ avatarUrl: fileUrl }, {
        onSuccess: () => {
          setAvatarConfirmVisible(false);
          setPickedImage(null);
          Toast.show({ type: 'success', text1: 'Thành công', text2: 'Đã cập nhật ảnh đại diện' });
        },
        onError: (error: any) => {
          Toast.show({ type: 'error', text1: 'Lỗi', text2: error?.message || 'Không thể cập nhật ảnh đại diện' });
        },
      });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Lỗi', text2: error?.message || 'Không thể tải ảnh lên' });
    }
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
      <SafeAreaView className="bg-primary" edges={['top']}>
        <View
          className="flex-row items-center px-4 py-3"
        >
          <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          <Text className="text-white font-bold text-lg ml-2" numberOfLines={1}>
            {conversation.type === 'DIRECT' ? 'Thông tin' : 'Tùy chọn'}
          </Text>
        </View>
      </SafeAreaView>

      {conversation.type === 'DIRECT' ? (
        <DirectSettings
          conversation={conversation}
          members={conversation.members || []}
          onEditName={() => {
            setNewName(conversation.name || '');
            setEditNameVisible(true);
          }}
        />
      ) : (
        <GroupSettings
          conversation={conversation}
          members={conversationMembers}
          isAdmin={isAdmin}
          onEditName={() => {
            setNewName(conversation.name || '');
            setEditNameVisible(true);
          }}
          onEditAvatar={() => setAvatarOptionsVisible(true)}
        />
      )}

      {/* Common Modals */}
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

        <AvatarOptionsModal
          visible={avatarOptionsVisible}
          onDismiss={() => setAvatarOptionsVisible(false)}
          onSelectOption={handlePickImage}
        />

        <AvatarConfirmModal
          visible={avatarConfirmVisible}
          onDismiss={() => {
            setAvatarConfirmVisible(false);
            setPickedImage(null);
          }}
          onConfirm={handleConfirmUpload}
          imageUri={pickedImage?.uri || null}
          isLoading={isUploading}
        />
      </Portal>
    </View>
  );
}
