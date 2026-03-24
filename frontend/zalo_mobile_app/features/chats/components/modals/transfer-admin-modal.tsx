import React from 'react';
import { View, FlatList } from 'react-native';
import { Modal, Portal, Text, IconButton, Avatar, List, Button } from 'react-native-paper';
import { ConversationMember } from '@/types/conversation';

interface TransferAdminModalProps {
  visible: boolean;
  onDismiss: () => void;
  members: ConversationMember[];
  onTransfer: (member: ConversationMember) => void;
  currentUserId?: string;
}

export const TransferAdminModal: React.FC<TransferAdminModalProps> = ({
  visible,
  onDismiss,
  members,
  onTransfer,
  currentUserId,
}) => {
  const eligibleMembers = members.filter(m => m.userId !== currentUserId);

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={{
          backgroundColor: 'white',
          padding: 20,
          margin: 20,
          borderRadius: 12,
          maxHeight: '80%',
        }}
      >
        <View className="flex-row items-center justify-between mb-4">
          <Text className="text-lg font-bold">Chuyển quyền trưởng nhóm</Text>
          <IconButton icon="close" size={20} onPress={onDismiss} />
        </View>
        <View className="mb-4">
          <Text className="text-sm text-balance text-muted-foreground">
            Chọn một thành viên để chuyển quyền trưởng nhóm. Sau khi chuyển, bạn sẽ trở thành thành viên.
          </Text>
        </View>
        <FlatList
          data={eligibleMembers}
          keyExtractor={(item) => item.userId}
          renderItem={({ item }) => (
            <List.Item
              title={item.displayName || item.user?.displayName || 'Unknown'}
              description={item.role === 'ADMIN' ? 'Admin' : 'Thành viên'}
              onPress={() => onTransfer(item)}
              left={props => (
                <View {...props} className="mr-2">
                  <Avatar.Image
                    size={40}
                    source={{ uri: item.avatarUrl || item.user?.avatarUrl || 'https://via.placeholder.com/40' }}
                  />
                </View>
              )}
              right={props => <List.Icon {...props} icon="chevron-right" />}
            />
          )}
          ItemSeparatorComponent={() => <View className="h-[1px] bg-gray-100" />}
          ListEmptyComponent={() => (
            <Text className="p-4 text-center text-muted-foreground italic">Không tìm thấy thành viên khác</Text>
          )}
        />
        <View className="mt-4">
          <Button mode="outlined" onPress={onDismiss}>Hủy</Button>
        </View>
      </Modal>
    </Portal>
  );
};
