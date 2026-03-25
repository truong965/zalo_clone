import React, { useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { Text, Modal, Portal, IconButton, useTheme, Button } from 'react-native-paper';
import { MemberPicker } from '../member-picker';

interface AddMembersModalProps {
  visible: boolean;
  onDismiss: () => void;
  onAdd: (userIds: string[]) => void;
  excludeIds?: string[];
  conversationId?: string;
  isLoading?: boolean;
}

const EMPTY_IDS: string[] = [];

/**
 * AddMembersModal - Refactored to use reusable MemberPicker component.
 */
export function AddMembersModal({ visible, onDismiss, onAdd, excludeIds = EMPTY_IDS, conversationId, isLoading: isSubmitting }: AddMembersModalProps) {
  const theme = useTheme();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
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

  const handleApply = () => {
    if (selectedIds.size > 0) {
      onAdd(Array.from(selectedIds));
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
            <Text className="text-lg font-bold">Thêm vào nhóm</Text>
            <Button
              mode="text"
              onPress={handleApply}
              disabled={selectedIds.size === 0 || isSubmitting}
              textColor={selectedIds.size > 0 ? theme.colors.primary : "#ccc"}
            >
              {isSubmitting ? <ActivityIndicator size="small" /> : 'Xong'}
            </Button>
          </View>

          {/* Member Picker */}
          <MemberPicker
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            excludeIds={excludeIds}
            conversationId={conversationId}
          />

          {/* Selected Count Footer */}
          {selectedIds.size > 0 && (
            <View className="p-4 border-t border-gray-100 bg-gray-50 flex-row items-center justify-between">
              <Text className="font-medium">Đã chọn: {selectedIds.size}</Text>
              <Button mode="contained" onPress={handleApply} loading={isSubmitting} disabled={isSubmitting}>
                Thêm vào nhóm
              </Button>
            </View>
          )}
        </View>
      </Modal>
    </Portal>
  );
}
