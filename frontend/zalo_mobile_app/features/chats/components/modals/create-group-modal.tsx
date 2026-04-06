import React, { useState } from 'react';
import { View, TouchableOpacity, ActivityIndicator, TextInput as RNTextInput, Image } from 'react-native';
import { Text, Modal, Portal, IconButton, useTheme, Button, TextInput } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { MemberPicker } from '../member-picker';
import { useSocket } from '@/providers/socket-provider';
import { socketManager } from '@/lib/socket';
import { SocketEvents } from '@/constants/socket-events';
import { useAvatarPicker } from '../../hooks/use-avatar-picker';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { AvatarOptionsModal } from './avatar-options-modal';
import { AvatarConfirmModal } from './avatar-confirm-modal';
import type { PickedAvatar } from '../../hooks/use-avatar-picker';

interface CreateGroupModalProps {
  visible: boolean;
  onDismiss: () => void;
}

export function CreateGroupModal({ visible, onDismiss }: CreateGroupModalProps) {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isConnected } = useSocket();
  const { pickImage, uploadAvatar } = useAvatarPicker();
  const [groupName, setGroupName] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pickedAvatar, setPickedAvatar] = useState<PickedAvatar | null>(null);
  const [tempPickedAvatar, setTempPickedAvatar] = useState<PickedAvatar | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [avatarOptionsVisible, setAvatarOptionsVisible] = useState(false);
  const [avatarConfirmVisible, setAvatarConfirmVisible] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handlePickAvatar = () => {
    setAvatarOptionsVisible(true);
  };

  const onSourceSelect = async (source: 'camera' | 'library') => {
    const picked = await pickImage(source);
    if (picked) {
      setTempPickedAvatar(picked);
      setAvatarConfirmVisible(true);
    }
  };

  const handleConfirmAvatar = () => {
    setPickedAvatar(tempPickedAvatar);
    setAvatarConfirmVisible(false);
    setTempPickedAvatar(null);
  };

  const canCreate = groupName.trim().length > 0 && selectedIds.size >= 2 && !isCreating;

  const handleCreateGroup = async () => {
    if (!canCreate) return;

    if (!isConnected) {
      Toast.show({ type: 'error', text1: 'Lỗi', text2: 'Mất kết nối máy chủ' });
      return;
    }

    setIsCreating(true);
    try {
      let avatarUrl: string | undefined;

      // 1. Upload avatar if selected
      if (pickedAvatar) {
        try {
          avatarUrl = await uploadAvatar(pickedAvatar);
        } catch (error) {
          console.error('Failed to upload group avatar:', error);
          Toast.show({ 
            type: 'info', 
            text1: 'Thông báo', 
            text2: 'Tạo nhóm không có ảnh đại diện do lỗi tải ảnh' 
          });
        }
      }

      // 2. Emit group:create
      const payload = {
        name: groupName.trim(),
        memberIds: Array.from(selectedIds),
        avatarUrl,
      };

      const result = await socketManager.emitWithAck<any>(SocketEvents.GROUP_CREATE, payload);
      
      Toast.show({ 
        type: 'success', 
        text1: 'Thành công', 
        text2: `Đã tạo nhóm "${payload.name}"` 
      });

      // 3. Invalidate and Close
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      onDismiss();
      
      // Reset state
      setGroupName('');
      setSelectedIds(new Set());
      setPickedAvatar(null);

      // 4. Navigate to new conversation if possible
      if (result?.group?.id) {
        router.push(`/chat/${result.group.id}`);
      }
    } catch (error) {
      console.error('Failed to create group:', error);
      Toast.show({ 
        type: 'error', 
        text1: 'Lỗi', 
        text2: error instanceof Error ? error.message : 'Không thể tạo nhóm' 
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={{
          backgroundColor: 'white',
          flex: 1,
          margin: 0,
          marginTop: 50,
          borderTopLeftRadius: 15,
          borderTopRightRadius: 15,
          overflow: 'hidden'
        }}
      >
        <View className="flex-1">
          {/* Header */}
          <View className="flex-row items-center justify-between px-2 py-2 border-b border-gray-100">
            <IconButton icon="close" size={24} onPress={onDismiss} />
            <Text className="text-lg font-bold">Tạo nhóm mới</Text>
            <Button
              mode="text"
              onPress={handleCreateGroup}
              disabled={!canCreate}
              textColor={canCreate ? theme.colors.primary : "#ccc"}
            >
              {isCreating ? <ActivityIndicator size="small" /> : 'Tạo'}
            </Button>
          </View>

          {/* Group Info Input */}
          <View className="p-4 flex-row items-center border-b border-gray-100">
            <TouchableOpacity 
              onPress={handlePickAvatar}
              className="w-16 h-16 rounded-full bg-gray-100 items-center justify-center overflow-hidden border border-gray-200"
            >
              {pickedAvatar ? (
                <Image source={{ uri: pickedAvatar.uri }} className="w-full h-full" />
              ) : (
                <Ionicons name="camera" size={30} color={theme.colors.primary} />
              )}
            </TouchableOpacity>
            
            <View className="flex-1 ml-4">
              <TextInput
                placeholder="Đặt tên nhóm"
                value={groupName}
                onChangeText={setGroupName}
                mode="flat"
                style={{ backgroundColor: 'transparent', height: 40 }}
                dense
              />
            </View>
          </View>

          {/* Member Picker */}
          <View className="flex-1">
            <View className="px-4 py-2 bg-gray-50">
              <Text className="text-gray-500 font-medium">Chọn thành viên ({selectedIds.size})</Text>
            </View>
            <MemberPicker
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
            />
          </View>

          {/* Create Button Footer */}
          <View className="p-4 border-t border-gray-100 bg-white">
            <Button 
              mode="contained" 
              onPress={handleCreateGroup} 
              loading={isCreating} 
              disabled={!canCreate}
              className="py-1"
            >
              Tạo nhóm {selectedIds.size >= 2 ? `(${selectedIds.size})` : ''}
            </Button>
            {!canCreate && !isCreating && (
              <Text className="text-xs text-gray-400 text-center mt-2">
                {groupName.trim() === '' 
                  ? 'Vui lòng nhập tên nhóm' 
                  : `Chọn thêm ít nhất ${Math.max(0, 2 - selectedIds.size)} thành viên`}
              </Text>
            )}
          </View>
        </View>
      </Modal>
      <AvatarOptionsModal
        visible={avatarOptionsVisible}
        onDismiss={() => setAvatarOptionsVisible(false)}
        onSelectOption={onSourceSelect}
      />

      <AvatarConfirmModal
        visible={avatarConfirmVisible}
        onDismiss={() => {
          setAvatarConfirmVisible(false);
          setTempPickedAvatar(null);
        }}
        onConfirm={handleConfirmAvatar}
        imageUri={tempPickedAvatar?.uri || null}
        description="Bạn có muốn sử dụng ảnh này làm ảnh đại diện nhóm không?"
      />
    </Portal>
  );
}
