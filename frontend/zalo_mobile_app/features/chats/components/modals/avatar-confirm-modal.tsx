import React from 'react';
import { View, Image, ActivityIndicator } from 'react-native';
import { Modal, Text, Button, useTheme } from 'react-native-paper';

interface AvatarConfirmModalProps {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
  imageUri: string | null;
  isLoading?: boolean;
  description?: string;
}

export const AvatarConfirmModal = ({
  visible,
  onDismiss,
  onConfirm,
  imageUri,
  isLoading,
  description = 'Bạn có muốn sử dụng ảnh này làm ảnh đại diện không?',
}: AvatarConfirmModalProps) => {
  const theme = useTheme();

  return (
    <Modal
      visible={visible}
      onDismiss={isLoading ? undefined : onDismiss}
      contentContainerStyle={{
        backgroundColor: 'white',
        padding: 24,
        margin: 20,
        borderRadius: 16,
        alignItems: 'center',
      }}
    >
      <Text className="text-xl font-bold mb-6">Xác nhận lưu ảnh</Text>
      
      <View className="relative">
        <View className="w-48 h-48 rounded-full overflow-hidden border-4 border-gray-100 bg-gray-50 mb-6">
            {imageUri && (
                <Image 
                    source={{ uri: imageUri }} 
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                />
            )}
        </View>
        {isLoading && (
            <View className="absolute inset-0 items-center justify-center bg-black/20 rounded-full">
                <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
        )}
      </View>

      <Text className="text-center text-muted-foreground mb-8 px-4">
        {description}
      </Text>

      <View className="flex-row w-full gap-4">
        <Button 
          mode="outlined" 
          onPress={onDismiss} 
          style={{ flex: 1 }}
          disabled={isLoading}
        >
          Hủy
        </Button>
        <Button 
          mode="contained" 
          onPress={onConfirm} 
          style={{ flex: 1 }}
          loading={isLoading}
          disabled={isLoading}
        >
          Lưu
        </Button>
      </View>
    </Modal>
  );
};
