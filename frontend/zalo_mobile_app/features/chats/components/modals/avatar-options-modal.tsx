import React from 'react';
import { View } from 'react-native';
import { Modal, Text, List, Button, useTheme } from 'react-native-paper';

interface AvatarOptionsModalProps {
  visible: boolean;
  onDismiss: () => void;
  onSelectOption: (option: 'camera' | 'library') => void;
}

export const AvatarOptionsModal = ({
  visible,
  onDismiss,
  onSelectOption,
}: AvatarOptionsModalProps) => {
  const theme = useTheme();

  return (
    <Modal
      visible={visible}
      onDismiss={onDismiss}
      contentContainerStyle={{
        backgroundColor: 'white',
        padding: 20,
        margin: 0,
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
      }}
    >
      <View className="items-center mb-4">
        <View className="w-10 h-1 bg-gray-300 rounded-full mb-4" />
        <Text className="text-lg font-bold">Chọn ảnh đại diện</Text>
      </View>

      <List.Item
        title="Chụp ảnh mới"
        left={props => <List.Icon {...props} icon="camera-outline" />}
        onPress={() => {
          onDismiss();
          onSelectOption('camera');
        }}
        className="py-2"
      />

      <List.Item
        title="Chọn từ thư viện"
        left={props => <List.Icon {...props} icon="image-outline" />}
        onPress={() => {
          onDismiss();
          onSelectOption('library');
        }}
        className="py-2"
      />

      <Button
        mode="text"
        onPress={onDismiss}
        className="mt-2"
        textColor={theme.colors.primary}
      >
        Hủy
      </Button>
    </Modal>
  );
};
