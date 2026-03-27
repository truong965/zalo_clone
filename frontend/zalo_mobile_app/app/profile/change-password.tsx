import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View, ScrollView, Alert } from 'react-native';
import { Appbar, TextInput, Button, Checkbox, Text } from 'react-native-paper';
import { useAuth } from '@/providers/auth-provider';
import Toast from 'react-native-toast-message';

export default function ChangePasswordScreen() {
  const router = useRouter();
  const { changePassword } = useAuth();
  
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [logoutAllDevices, setLogoutAllDevices] = useState(true);
  
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = () => {
    if (newPassword !== confirmPassword) {
      Toast.show({ type: 'error', text1: 'Lỗi', text2: 'Mật khẩu xác nhận không khớp' });
      return;
    }
    
    if (newPassword.length < 6) {
      Toast.show({ type: 'error', text1: 'Lỗi', text2: 'Mật khẩu mới phải từ 6 ký tự' });
      return;
    }

    Alert.alert(
      'Xác nhận đổi mật khẩu',
      'Bạn có chắc chắn muốn đổi mật khẩu không?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Đổi mật khẩu',
          onPress: async () => {
            setIsSubmitting(true);
            try {
              await changePassword({
                oldPassword,
                newPassword,
                logoutAllDevices,
              });
              Toast.show({ type: 'success', text1: 'Thành công', text2: 'Đã đổi mật khẩu thành công' });
              router.back();
            } catch (error: any) {
              Toast.show({ type: 'error', text1: 'Lỗi', text2: error?.message || 'Không thể đổi mật khẩu' });
            } finally {
              setIsSubmitting(false);
            }
          }
        }
      ]
    );
  };

  const isFormValid = oldPassword && newPassword && confirmPassword && newPassword === confirmPassword;

  return (
    <View className="flex-1 bg-background">
      <Appbar.Header style={{ backgroundColor: '#1E88E5' }}>
        <Appbar.BackAction color="white" onPress={() => router.back()} />
        <Appbar.Content title="Đổi mật khẩu" titleStyle={{ color: 'white' }} />
      </Appbar.Header>

      <ScrollView className="flex-1 p-4">
        <TextInput
          label="Mật khẩu hiện tại"
          value={oldPassword}
          onChangeText={setOldPassword}
          secureTextEntry={!showOld}
          mode="outlined"
          className="mb-4"
          right={<TextInput.Icon icon={showOld ? "eye-off" : "eye"} onPress={() => setShowOld(!showOld)} />}
          outlineColor="#e0e0e0"
          activeOutlineColor="#1E88E5"
        />

        <TextInput
          label="Mật khẩu mới"
          value={newPassword}
          onChangeText={setNewPassword}
          secureTextEntry={!showNew}
          mode="outlined"
          className="mb-4"
          right={<TextInput.Icon icon={showNew ? "eye-off" : "eye"} onPress={() => setShowNew(!showNew)} />}
          outlineColor="#e0e0e0"
          activeOutlineColor="#1E88E5"
        />

        <TextInput
          label="Xác nhận mật khẩu mới"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showConfirm}
          mode="outlined"
          className="mb-4"
          right={<TextInput.Icon icon={showConfirm ? "eye-off" : "eye"} onPress={() => setShowConfirm(!showConfirm)} />}
          outlineColor="#e0e0e0"
          activeOutlineColor="#1E88E5"
        />

        <View className="flex-row items-center mb-6">
          <Checkbox
            status={logoutAllDevices ? 'checked' : 'unchecked'}
            onPress={() => setLogoutAllDevices(!logoutAllDevices)}
            color="#1E88E5"
          />
          <Text onPress={() => setLogoutAllDevices(!logoutAllDevices)} className="text-gray-600 flex-1">
            Đăng xuất khỏi các thiết bị khác
          </Text>
        </View>

        <Button 
          mode="contained" 
          onPress={handleSave}
          loading={isSubmitting}
          disabled={isSubmitting || !isFormValid}
          className="rounded-xl py-1"
          buttonColor="#1E88E5"
        >
          Cập nhật mật khẩu
        </Button>
      </ScrollView>
    </View>
  );
}
