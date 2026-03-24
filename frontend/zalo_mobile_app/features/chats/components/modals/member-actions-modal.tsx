import React from 'react';
import { View } from 'react-native';
import { Modal, Text, List, Button, useTheme } from 'react-native-paper';
import Toast from 'react-native-toast-message';

interface MemberActionsModalProps {
  visible: boolean;
  onDismiss: () => void;
  member: any;
  isAdmin: boolean;
  onTransferAdmin: (member: any) => void;
  onRemoveMember: (userId: string) => void;
}

export const MemberActionsModal = ({
  visible,
  onDismiss,
  member,
  isAdmin,
  onTransferAdmin,
  onRemoveMember,
}: MemberActionsModalProps) => {
  const theme = useTheme();

  if (!member) return null;

  const displayName = member.displayName || member.user?.displayName || 'Thành viên';
  const memberId = member.userId || member.id;

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      contentContainerStyle={{
        backgroundColor: 'white',
        padding: 20,
        margin: 20,
        borderRadius: 12,
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        marginHorizontal: 0,
        marginBottom: 0,
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
      }}
    >
      <View className="items-center mb-4">
        <Text className="text-lg font-bold mt-2">
          {displayName}
        </Text>
      </View>

      <List.Item
        title="Xem trang cá nhân"
        left={props => <List.Icon {...props} icon="account-outline" />}
        onPress={() => {
          onDismiss();
          Toast.show({ 
            type: 'info', 
            text1: 'Tính năng đang phát triển', 
            text2: `Xem hồ sơ: ${memberId}` 
          });
        }}
      />

      {isAdmin && (
        <>
          <List.Item
            title="Chuyển quyền trưởng nhóm"
            left={props => <List.Icon {...props} icon="swap-horizontal" />}
            onPress={() => {
              onDismiss();
              onTransferAdmin(member);
            }}
          />
          <List.Item
            title="Xóa khỏi nhóm"
            titleStyle={{ color: theme.colors.error }}
            left={props => <List.Icon {...props} icon="trash-can-outline" color={theme.colors.error} />}
            onPress={() => {
              onDismiss();
              onRemoveMember(memberId);
            }}
          />
        </>
      )}

      <Button 
        mode="outlined" 
        onPress={onDismiss} 
        className="mt-4 border-gray-200"
        textColor={theme.colors.onSurfaceVariant}
      >
        Hủy
      </Button>
    </Modal>
  );
};
