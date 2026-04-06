import { useRouter } from 'expo-router';
import { useState, useMemo } from 'react';
import { View, ScrollView, TouchableOpacity, Platform, Alert } from 'react-native';
import { Appbar, TextInput, Button, HelperText, RadioButton, Text, Portal, useTheme } from 'react-native-paper';
import { useAuth } from '@/providers/auth-provider';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useAvatarPicker } from '@/features/chats/hooks/use-avatar-picker';
import type { PickedAvatar } from '@/features/chats/hooks/use-avatar-picker';
import { AvatarOptionsModal } from '@/features/chats/components/modals/avatar-options-modal';
import { AvatarConfirmModal } from '@/features/chats/components/modals/avatar-confirm-modal';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import Toast from 'react-native-toast-message';
import dayjs from 'dayjs';
import { Gender } from '@/types/auth';

export default function AccountScreen() {
  const router = useRouter();
  const { user, updateProfile } = useAuth();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [gender, setGender] = useState<Gender>(user?.gender || 'MALE');
  const [dateOfBirth, setDateOfBirth] = useState<Date>(user?.dateOfBirth ? new Date(user.dateOfBirth) : new Date());
  const [email, setEmail] = useState(user?.email || '');

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [avatarOptionsVisible, setAvatarOptionsVisible] = useState(false);
  const [avatarConfirmVisible, setAvatarConfirmVisible] = useState(false);
  const { pickImage, uploadAvatar, isUploading } = useAvatarPicker();
  const [pickedImage, setPickedImage] = useState<PickedAvatar | null>(null);
  const theme = useTheme();
  // Validation
  const isEmailValid = useMemo(() => {
    if (!email) return true; // Optional
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }, [email]);

  const isGmail = useMemo(() => {
    if (!email) return true;
    return email.toLowerCase().endsWith('@gmail.com');
  }, [email]);

  const canSave = displayName.trim().length > 0 && isEmailValid && isGmail;

  const handlePickImage = async (source: 'camera' | 'library') => {
    const picked = await pickImage(source);
    if (picked) {
      setPickedImage(picked);
      setAvatarConfirmVisible(true);
    }
  };

  const handleConfirmUpload = async () => {
    if (!pickedImage || !user) return;

    try {
      // Pass targetId and targetType so backend auto-updates the user record
      await uploadAvatar(pickedImage, user.id, 'USER');
      setAvatarConfirmVisible(false);
      setPickedImage(null);
      Toast.show({ type: 'success', text1: 'Thành công', text2: 'Đã cập nhật ảnh đại diện' });
    } catch (error: any) {
      Toast.show({ type: 'error', text1: 'Lỗi', text2: error?.message || 'Không thể tải ảnh lên' });
    }
  };

  const handleDateChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    setShowDatePicker(Platform.OS === 'ios');
    if (selectedDate) {
      setDateOfBirth(selectedDate);
    }
  };

  const handleSave = () => {
    if (!canSave) return;

    Alert.alert(
      'Xác nhận thay đổi',
      'Bạn có chắc chắn muốn lưu các thay đổi này không?',
      [
        { text: 'Hủy', style: 'cancel' },
        { 
          text: 'Lưu', 
          onPress: async () => {
            setIsSubmitting(true);
            try {
              await updateProfile({
                displayName,
                gender,
                dateOfBirth: dateOfBirth.toISOString(),
                email: email || undefined
              });
              Toast.show({ type: 'success', text1: 'Thành công', text2: 'Đã cập nhật thông tin' });
              router.back();
            } catch (error: any) {
              Toast.show({ type: 'error', text1: 'Lỗi', text2: error?.message || 'Không thể cập nhật thông tin' });
            } finally {
              setIsSubmitting(false);
            }
          }
        }
      ]
    );
  };

  return (
    <View className="flex-1 bg-background">
      <Appbar.Header style={{ backgroundColor: '#1E88E5' }}>
        <Appbar.BackAction color="white" onPress={() => router.back()} />
        <Appbar.Content title="Thông tin tài khoản" titleStyle={{ color: 'white' }} />
      </Appbar.Header>

      <ScrollView className="flex-1 p-4">
        <View className="items-center my-6">
          <TouchableOpacity
            onPress={() => setAvatarOptionsVisible(true)}
            disabled={isUploading}
          >
            <View className="relative">
              <UserAvatar
                uri={user?.avatarUrl}
                size={100}
              />
              <View
                className="absolute p-2.5 rounded-full border-2 border-white"
                style={{
                  bottom: 3,
                  right: 3,
                }}
              >
                <TextInput.Icon icon="camera" color={theme.colors.backdrop} size={24} />
              </View>
            </View>
          </TouchableOpacity>
        </View>

        <TextInput
          label="Tên hiển thị"
          value={displayName}
          onChangeText={setDisplayName}
          mode="outlined"
          className="mb-4"
          outlineColor="#e0e0e0"
          activeOutlineColor="#1E88E5"
        />

        <View className="mb-4">
          <Text className="text-gray-600 mb-2 ml-1">Giới tính</Text>
          <RadioButton.Group onValueChange={value => setGender(value as Gender)} value={gender}>
            <View className="flex-row">
              <View className="flex-row items-center mr-4">
                <RadioButton value="MALE" color="#1E88E5" />
                <Text>Nam</Text>
              </View>
              <View className="flex-row items-center mr-4">
                <RadioButton value="FEMALE" color="#1E88E5" />
                <Text>Nữ</Text>
              </View>
              <View className="flex-row items-center">
                <RadioButton value="OTHER" color="#1E88E5" />
                <Text>Khác</Text>
              </View>
            </View>
          </RadioButton.Group>
        </View>

        <TouchableOpacity onPress={() => setShowDatePicker(true)}>
          <View pointerEvents="none">
            <TextInput
              label="Ngày sinh"
              value={dayjs(dateOfBirth).format('DD/MM/YYYY')}
              mode="outlined"
              className="mb-4"
              editable={false}
              outlineColor="#e0e0e0"
              activeOutlineColor="#1E88E5"
              right={<TextInput.Icon icon="calendar" />}
            />
          </View>
        </TouchableOpacity>

        {showDatePicker && (
          <DateTimePicker
            value={dateOfBirth}
            mode="date"
            display="default"
            onChange={handleDateChange}
            maximumDate={new Date()}
          />
        )}

        <TextInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          mode="outlined"
          keyboardType="email-address"
          autoCapitalize="none"
          className="mb-1"
          outlineColor="#e0e0e0"
          activeOutlineColor="#1E88E5"
          error={!isEmailValid || !isGmail}
        />
        {!isEmailValid && (
          <HelperText type="error" visible={!isEmailValid}>
            Email không hợp lệ
          </HelperText>
        )}
        {!isGmail && isEmailValid && email !== '' && (
          <HelperText type="error" visible={!isGmail}>
            Chỉ chấp nhận địa chỉ @gmail.com
          </HelperText>
        )}

        <Button
          mode="contained"
          onPress={handleSave}
          loading={isSubmitting}
          disabled={isSubmitting || !canSave || isUploading}
          className="mt-6 rounded-xl py-1"
          buttonColor="#1E88E5"
        >
          Lưu thay đổi
        </Button>
      </ScrollView>

      <Portal>
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
          description="Bạn có muốn sử dụng ảnh này làm ảnh đại diện không?"
        />
      </Portal>
    </View>
  );
}
