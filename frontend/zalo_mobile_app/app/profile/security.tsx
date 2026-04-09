import React, { useState } from 'react';
import { useRouter } from 'expo-router';
import { View, ScrollView, Alert, StyleSheet } from 'react-native';
import { Appbar, List, Divider, Portal, Modal, TextInput, Button, Text, useTheme } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/providers/auth-provider';
import { mobileApi } from '@/services/api';
import Toast from 'react-native-toast-message';

export default function SecurityScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, accessToken, logout } = useAuth();
  const theme = useTheme();

  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [actionType, setActionType] = useState<'DEACTIVATE' | 'DELETE' | null>(null);

  const handleAction = (type: 'DEACTIVATE' | 'DELETE') => {
    setActionType(type);
    
    const title = type === 'DEACTIVATE' ? 'Khóa tài khoản' : 'Xóa tài khoản';
    const message = type === 'DEACTIVATE' 
      ? 'Bạn có chắc chắn muốn khóa tài khoản? Bạn có thể kích hoạt lại bất cứ lúc nào bằng cách đăng nhập lại.'
      : 'Hành động này không thể hoàn tác. Tất cả dữ liệu của bạn sẽ bị xóa vĩnh viễn. Bạn có chắc chắn muốn tiếp tục?';

    Alert.alert(
      title,
      message,
      [
        { text: 'Hủy', style: 'cancel' },
        { 
          text: type === 'DEACTIVATE' ? 'Khóa' : 'Xóa', 
          style: 'destructive',
          onPress: () => setModalVisible(true)
        }
      ]
    );
  };

  const confirmAction = async () => {
    if (!password || !accessToken || !actionType) return;
    
    setIsSubmitting(true);
    try {
      if (actionType === 'DEACTIVATE') {
        await mobileApi.deactivateAccount(password, accessToken);
        Toast.show({
          type: 'success',
          text1: 'Thành công',
          text2: 'Tài khoản của bạn đã được khóa.'
        });
      } else {
        if (!user?.id) throw new Error('User ID is missing');
        await mobileApi.deleteAccount(user.id, password, accessToken);
        Toast.show({
          type: 'success',
          text1: 'Thành công',
          text2: 'Tài khoản của bạn đã được xóa vĩnh viễn.'
        });
      }

      setModalVisible(false);
      setPassword('');
      // Standard behavior after account deactivation/deletion is to logout
      // The global guard in _layout.tsx will handle redirection automatically
      await logout();
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Lỗi',
        text2: error?.message || 'Xác thực mật khẩu không thành công.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View className="flex-1 bg-[#f4f5f7]">
      <Appbar.Header style={{ backgroundColor: '#1E88E5' }}>
        <Appbar.BackAction color="white" onPress={() => router.back()} />
        <Appbar.Content title={t('settings.privacy.title')} titleStyle={{ color: 'white' }} />
      </Appbar.Header>
      
      <ScrollView className="flex-1">
        <View className="p-4">
          <List.Section className="bg-background rounded-lg overflow-hidden mb-6">
            <List.Item
              title="Thông tin tài khoản"
              left={props => <List.Icon {...props} icon="account-circle-outline" />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => router.push('/profile/account' as any)}
            />
            <Divider />
            <List.Item
              title="Đổi mật khẩu"
              left={props => <List.Icon {...props} icon="key-outline" />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => router.push('/profile/change-password' as any)}
            />
            <Divider />
            <List.Item
              title="Xác thực 2 yếu tố"
              left={props => <List.Icon {...props} icon="shield-check-outline" />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => router.push('/profile/two-factor' as any)}
            />
            <Divider />
            <List.Item
              title={t('settings.privacy.blockedListTitle')}
              left={props => <List.Icon {...props} icon="account-off" />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => router.push('/profile/blocked-list' as any)}
            />
          </List.Section>

          <Text className="text-gray-500 mb-2 ml-1 uppercase text-xs font-bold">Quản lý tài khoản</Text>
          <View className="bg-background rounded-lg overflow-hidden">
            {user?.twoFactorEnabled && (
              <>
                <List.Item
                  title="Khóa tài khoản"
                  description="Tạm thời khóa tài khoản này"
                  left={props => <List.Icon {...props} icon="account-lock-outline" color={theme.colors.error} />}
                  onPress={() => handleAction('DEACTIVATE')}
                />
                <Divider />
              </>
            )}
            <List.Item
              title="Xóa tài khoản"
              titleStyle={{ color: theme.colors.error }}
              description="Xóa vĩnh viễn dữ liệu và tài khoản"
              left={props => <List.Icon {...props} icon="account-remove-outline" color={theme.colors.error} />}
              onPress={() => handleAction('DELETE')}
            />
          </View>
        </View>
      </ScrollView>

      <Portal>
        <Modal 
          visible={modalVisible} 
          onDismiss={() => {
            setModalVisible(false);
            setPassword('');
          }} 
          contentContainerStyle={styles.modal}
        >
          <Text className="text-lg font-bold mb-2">Xác nhận mật khẩu</Text>
          <Text className="text-gray-600 mb-4">
            Vui lòng nhập mật khẩu của bạn để xác nhận {actionType === 'DEACTIVATE' ? 'khóa' : 'xóa'} tài khoản.
          </Text>
          <TextInput
            label="Mật khẩu"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            mode="outlined"
            className="mb-6"
            autoFocus
          />
          <View className="flex-row justify-end">
            <Button 
              onPress={() => {
                setModalVisible(false);
                setPassword('');
              }} 
              className="mr-2"
            >
              Hủy
            </Button>
            <Button 
              mode="contained" 
              onPress={confirmAction} 
              loading={isSubmitting} 
              disabled={!password || isSubmitting}
              buttonColor={theme.colors.error}
            >
              Xác nhận
            </Button>
          </View>
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  modal: {
    backgroundColor: 'white',
    padding: 24,
    margin: 20,
    borderRadius: 16,
    elevation: 5,
  },
});
