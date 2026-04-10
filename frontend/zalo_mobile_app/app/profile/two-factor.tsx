import { OtpInput } from '@/components/ui/otp-input';
import { useAuth } from '@/providers/auth-provider';
import { mobileApi } from '@/services/api';
import { TwoFactorMethod, TwoFactorSetupResponse } from '@/types/auth';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Appbar, Button, Divider, List, Modal, Portal, RadioButton, Text, TextInput, useTheme } from 'react-native-paper';
import Toast from 'react-native-toast-message';

export default function TwoFactorScreen() {
      const router = useRouter();
      const { user, accessToken, refreshProfile } = useAuth();
      const theme = useTheme();

      const [loading, setLoading] = useState(false);

      // Password Verification Modal
      const [passwordModalVisible, setPasswordModalVisible] = useState(false);
      const [password, setPassword] = useState('');
      const [pendingAction, setPendingAction] = useState<{ type: 'SWITCH' | 'EMAIL' | 'TOTP_INIT', data?: any } | null>(null);

      // TOTP Setup State
      const [totpSetupVisible, setTotpSetupVisible] = useState(false);
      const [totpData, setTotpData] = useState<TwoFactorSetupResponse | null>(null);
      const [totpCode, setTotpCode] = useState('');

      // Email Change State
      const [emailModalVisible, setEmailModalVisible] = useState(false);
      const [newEmail, setNewEmail] = useState('');
      const [emailOtp, setEmailOtp] = useState('');
      const [emailStep, setEmailStep] = useState<'REQUEST' | 'VERIFY'>('REQUEST');

      const handlePasswordVerify = async () => {
            if (!password || !accessToken) return;
            setLoading(true);
            try {
                  if (pendingAction?.type === 'SWITCH') {
                        await mobileApi.updateTwoFactorMethod(pendingAction.data.method, accessToken, password);
                        await refreshProfile();
                        Toast.show({ type: 'success', text1: 'Thành công', text2: 'Đã cập nhật phương thức bảo mật' });
                        setPasswordModalVisible(false);
                  } else if (pendingAction?.type === 'TOTP_INIT') {
                        const data = await mobileApi.init2faSetup(accessToken, password);
                        setTotpData(data);
                        setTotpSetupVisible(true);
                        setPasswordModalVisible(false);
                  }

                  setPassword('');
                  setPendingAction(null);
            } catch (error: any) {
                  Toast.show({ type: 'error', text1: 'Lỗi', text2: error?.message || 'Xác thực mật khẩu thất bại' });
            } finally {
                  setLoading(false);
            }
      };

      const handleRequestEmailChange = async () => {
            if (!password || !newEmail || !accessToken) return;

            setLoading(true);
            try {
                  await mobileApi.requestEmailChange(accessToken, { password, newEmail });
                  setEmailStep('VERIFY');
                  Toast.show({ type: 'info', text1: 'Bắt đầu', text2: 'Vui lòng kiểm tra mã xác thực gửi đến email mới' });
            } catch (error: any) {
                  Toast.show({ type: 'error', text1: 'Lỗi', text2: error?.message || 'Yêu cầu thay đổi email thất bại' });
            } finally {
                  setLoading(false);
            }
      };

      const handleSwitchMethod = (method: TwoFactorMethod) => {
            if (user?.twoFactorMethod === method) return;

            // If switching to EMAIL but not linked yet
            if (method === 'EMAIL' && !user?.email) {
                  Alert.alert(
                        'Yêu cầu liên kết Email',
                        'Bạn cần liên kết địa chỉ email trước khi sử dụng phương thức xác thực này.',
                        [
                              { text: 'Hủy', style: 'cancel' },
                              {
                                    text: 'Liên kết ngay',
                                    onPress: () => {
                                          setEmailStep('REQUEST');
                                          setEmailModalVisible(true);
                                    }
                              }
                        ]
                  );
                  return;
            }

            // If switching to TOTP but not set up yet
            if (method === 'TOTP' && !user?.hasTotpSecret) {
                  setPendingAction({ type: 'TOTP_INIT' });
                  setPasswordModalVisible(true);
                  return;
            }

            setPendingAction({ type: 'SWITCH', data: { method } });
            setPasswordModalVisible(true);
      };

      const handleConfirmTotp = async () => {
            if (!totpCode || totpCode.length < 6 || !accessToken) return;
            setLoading(true);
            try {
                  await mobileApi.confirm2faSetup(accessToken, totpCode);
                  await refreshProfile();
                  setTotpSetupVisible(false);
                  setTotpData(null);
                  setTotpCode('');
                  Toast.show({ type: 'success', text1: 'Thành công', text2: 'Authenticator đã được kích hoạt' });
            } catch (error: any) {
                  Toast.show({ type: 'error', text1: 'Lỗi', text2: error?.message || 'Mã xác thực không đúng' });
            } finally {
                  setLoading(false);
            }
      };

      const handleConfirmEmail = async () => {
            if (!emailOtp || emailOtp.length < 6 || !accessToken) return;
            setLoading(true);
            try {
                  await mobileApi.confirmEmailChange(accessToken, emailOtp);
                  await refreshProfile();
                  setEmailModalVisible(false);
                  setEmailOtp('');
                  setEmailStep('REQUEST');
                  setNewEmail('');
                  Toast.show({ type: 'success', text1: 'Thành công', text2: 'Đã thay đổi email liên kết' });
            } catch (error: any) {
                  Toast.show({ type: 'error', text1: 'Lỗi', text2: error?.message || 'Mã xác thực không đúng' });
            } finally {
                  setLoading(false);
            }
      };

      const handleOpenAuthenticator = async () => {
            if (!totpData?.otpAuthUri) return;
            try {
                  // Direct open is more robust; will throw or return false if not handled
                  await Linking.openURL(totpData.otpAuthUri);
            } catch (error) {
                  Alert.alert(
                        'Không tìm thấy ứng dụng',
                        'Ứng dụng Authenticator (Google Authenticator, Authy...) chưa được cài đặt trên thiết bị. Vui lòng cài đặt để tiếp tục.',
                        [{ text: 'Đóng', style: 'default' }]
                  );
            }
      };

      return (
            <View className="flex-1 bg-[#f4f5f7]">
                  <Appbar.Header style={{ backgroundColor: '#1E88E5' }}>
                        <Appbar.BackAction color="white" onPress={() => router.back()} />
                        <Appbar.Content title="Xác thực 2 yếu tố" titleStyle={{ color: 'white' }} />
                  </Appbar.Header>

                  <ScrollView className="flex-1 p-4">
                        <View className="bg-background rounded-lg p-5 mb-4 items-center shadow-sm">
                              <Text className="text-gray-500 mb-1">Trạng thái bảo mật</Text>
                              <View className="flex-row items-center">
                                    <View className={`w-3 h-3 rounded-full mr-2 ${user?.twoFactorEnabled ? 'bg-green-500' : 'bg-orange-500'}`} />
                                    <Text className={`text-lg font-bold ${user?.twoFactorEnabled ? 'text-green-600' : 'text-orange-500'}`}>
                                          {user?.twoFactorEnabled ? 'ĐANG BẬT' : 'CHƯA KÍCH HOẠT'}
                                    </Text>
                              </View>
                        </View>

                        {!user?.twoFactorEnabled && (
                              <View style={styles.warningBox}>
                                    <List.Icon icon="alert-circle-outline" color="#C62828" style={styles.warningIcon} />
                                    <View style={styles.warningContent}>
                                          <Text style={styles.warningTitle}>2FA chưa được kích hoạt</Text>
                                          <Text style={styles.warningText}>
                                                Tài khoản của bạn đang có rủi ro cao hơn. Hãy chọn phương thức bên dưới để bật xác thực 2 yếu tố ngay.
                                          </Text>
                                    </View>
                              </View>
                        )}

                        <Text className="text-gray-500 mb-2 ml-1 uppercase text-xs font-bold">Phương thức xác thực</Text>
                        <View style={styles.methodContainer}>
                              <TouchableOpacity style={styles.methodCard} onPress={() => handleSwitchMethod('SMS')}>
                                    <View style={styles.methodLeft}>
                                          <List.Icon icon="message-text-outline" color="#1E88E5" style={styles.methodIcon} />
                                          <View>
                                                <Text style={styles.methodTitle}>SMS OTP</Text>
                                                <Text style={styles.methodDesc}>{user?.phoneNumber || 'Chưa liên kết số điện thoại'}</Text>
                                          </View>
                                    </View>
                                    <RadioButton
                                          value="SMS"
                                          status={user?.twoFactorMethod === 'SMS' ? 'checked' : 'unchecked'}
                                          color="#1E88E5"
                                    />
                              </TouchableOpacity>

                              <Divider />

                              <TouchableOpacity style={styles.methodCard} onPress={() => handleSwitchMethod('EMAIL')}>
                                    <View style={styles.methodLeft}>
                                          <List.Icon icon="email-outline" color="#1E88E5" style={styles.methodIcon} />
                                          <View>
                                                <Text style={styles.methodTitle}>Email OTP</Text>
                                                <Text style={styles.methodDesc}>{user?.email || 'Chưa thiết lập'}</Text>
                                          </View>
                                    </View>
                                    <RadioButton
                                          value="EMAIL"
                                          status={user?.twoFactorMethod === 'EMAIL' ? 'checked' : 'unchecked'}
                                          color="#1E88E5"
                                    />
                              </TouchableOpacity>

                              <Divider />

                              <TouchableOpacity style={styles.methodCard} onPress={() => handleSwitchMethod('TOTP')}>
                                    <View style={styles.methodLeft}>
                                          <List.Icon icon="shield-outline" color="#1E88E5" style={styles.methodIcon} />
                                          <View>
                                                <Text style={styles.methodTitle}>App Authenticator</Text>
                                                <Text style={styles.methodDesc}>Google Authenticator, Authy...</Text>
                                          </View>
                                    </View>
                                    <RadioButton
                                          value="TOTP"
                                          status={user?.twoFactorMethod === 'TOTP' ? 'checked' : 'unchecked'}
                                          color="#1E88E5"
                                    />
                              </TouchableOpacity>
                        </View>

                        <Text className="text-gray-500 mb-2 ml-1 uppercase text-xs font-bold">Danh tính & Email</Text>
                        <View className="bg-background rounded-lg overflow-hidden mb-6 shadow-sm">
                              <List.Item
                                    title="Thay đổi Email liên kết"
                                    description={user?.email || 'Chưa liên kết email'}
                                    left={props => <List.Icon {...props} icon="email-edit-outline" />}
                                    right={props => <List.Icon {...props} icon="chevron-right" />}
                                    onPress={() => {
                                          setEmailStep('REQUEST');
                                          setEmailModalVisible(true);
                                    }}
                              />
                        </View>

                        <View className="p-4 bg-blue-50 rounded-lg flex-row items-start">
                              <List.Icon icon="information-outline" color="#1565C0" style={{ margin: 0, marginRight: 8 }} />
                              <Text className="text-blue-800 text-xs flex-1 leading-5">
                                    Xác thực 2 yếu tố giúp tài khoản của bạn an toàn hơn bằng cách yêu cầu mã xác minh mỗi khi đăng nhập trên thiết bị lạ.
                              </Text>
                        </View>
                        <View className="h-10" />
                  </ScrollView>

                  <Portal>
                        {/* Password Modal */}
                        <Modal visible={passwordModalVisible} onDismiss={() => setPasswordModalVisible(false)} contentContainerStyle={styles.modal}>
                              <Text className="text-lg font-bold mb-2">Xác thực bảo mật</Text>
                              <Text className="text-gray-600 mb-4">Nhập mật khẩu của bạn để tiếp tục.</Text>
                              <TextInput
                                    label="Mật khẩu"
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry
                                    mode="outlined"
                                    className="mb-6"
                              />
                              <View className="flex-row justify-end">
                                    <Button onPress={() => setPasswordModalVisible(false)} className="mr-2">Hủy</Button>
                                    <Button mode="contained" onPress={handlePasswordVerify} loading={loading} disabled={!password}>Xác nhận</Button>
                              </View>
                        </Modal>

                        {/* TOTP Setup Modal */}
                        <Modal visible={totpSetupVisible} onDismiss={() => setTotpSetupVisible(false)} contentContainerStyle={styles.modalLarge}>
                              <Text className="text-xl font-bold mb-3 text-center">Thiết lập Authenticator</Text>
                              <Text className="text-gray-500 text-center text-xs mb-8">
                                    Mở ứng dụng xác thực (Google Authenticator, Authy...) để thêm tài khoản này.
                              </Text>

                              <View className="items-center mb-10">
                                    <Button
                                          mode="contained"
                                          icon="open-in-new"
                                          onPress={handleOpenAuthenticator}
                                          contentStyle={{ height: 50 }}
                                          style={{ width: '100%', borderRadius: 12 }}
                                    >
                                          Mở ứng dụng Authenticator
                                    </Button>
                                    <Text className="text-gray-400 text-[10px] mt-4 text-center leading-4">
                                          Sau khi nhấn, ứng dụng Authenticator sẽ tự động mở và thêm tài khoản Zalo Clone của bạn.
                                    </Text>
                              </View>

                              <Divider className="mb-8" />

                              <View className="mb-6">
                                    <Text className="text-gray-700 mb-4 font-bold text-center">Nhập mã xác nhận</Text>
                                    <OtpInput length={6} value={totpCode} onChange={setTotpCode} />
                              </View>

                              <View className="flex-row justify-between mt-4">
                                    <Button onPress={() => setTotpSetupVisible(false)} textColor={theme.colors.error}>Để sau</Button>
                                    <Button mode="contained" onPress={handleConfirmTotp} loading={loading} disabled={totpCode.length < 6}>Xác nhận & Kích hoạt</Button>
                              </View>
                        </Modal>

                        {/* Email Change Modal */}
                        <Modal visible={emailModalVisible} onDismiss={() => setEmailModalVisible(false)} contentContainerStyle={styles.modal}>
                              {emailStep === 'REQUEST' ? (
                                    <>
                                          <Text className="text-lg font-bold mb-4">Cập nhật Email mới</Text>
                                          <Text className="text-gray-600 mb-4 text-xs">Chúng tôi sẽ gửi mã xác thực tới địa chỉ này.</Text>
                                          <TextInput
                                                label="Địa chỉ email mới"
                                                value={newEmail}
                                                onChangeText={setNewEmail}
                                                keyboardType="email-address"
                                                autoCapitalize="none"
                                                mode="outlined"
                                                className="mb-8"
                                          />
                                          <TextInput
                                                label="Mật khẩu xác nhận"
                                                value={password}
                                                onChangeText={setPassword}
                                                secureTextEntry
                                                mode="outlined"
                                                className="mb-8"
                                          />
                                          <View className="flex-row justify-end">
                                                <Button onPress={() => setEmailModalVisible(false)} className="mr-2">Hủy</Button>
                                                <Button mode="contained" onPress={handleRequestEmailChange} loading={loading} disabled={!newEmail || !newEmail.includes('@') || !password}>Tiếp tục</Button>
                                          </View>
                                    </>
                              ) : (
                                    <>
                                          <Text className="text-lg font-bold mb-2">Xác thực Email</Text>
                                          <Text className="text-gray-600 mb-6 text-center text-xs">Mã OTP gồm 6 chữ số đã được gửi tới{"\n"}<Text className="font-bold text-gray-800">{newEmail}</Text></Text>
                                          <OtpInput length={6} value={emailOtp} onChange={setEmailOtp} />
                                          <View className="flex-row justify-between mt-8">
                                                <Button onPress={() => setEmailStep('REQUEST')} icon="arrow-left">Quay lại</Button>
                                                <Button mode="contained" onPress={handleConfirmEmail} loading={loading} disabled={emailOtp.length < 6}>Xác nhận</Button>
                                          </View>
                                    </>
                              )}
                        </Modal>
                  </Portal>
            </View>
      );
}

const styles = StyleSheet.create({
      warningBox: {
            backgroundColor: '#FFEBEE',
            borderWidth: 1,
            borderColor: '#FFCDD2',
            borderRadius: 12,
            paddingVertical: 10,
            paddingHorizontal: 12,
            marginBottom: 16,
            flexDirection: 'row',
            alignItems: 'flex-start',
      },
      warningIcon: {
            margin: 0,
            marginRight: 6,
      },
      warningContent: {
            flex: 1,
      },
      warningTitle: {
            fontSize: 14,
            fontWeight: '700',
            color: '#B71C1C',
            marginBottom: 2,
      },
      warningText: {
            fontSize: 12,
            color: '#C62828',
            lineHeight: 17,
      },
      methodContainer: {
            backgroundColor: 'white',
            borderRadius: 12,
            marginBottom: 24,
            overflow: 'hidden',
      },
      methodCard: {
            paddingVertical: 14,
            paddingHorizontal: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
      },
      methodLeft: {
            flexDirection: 'row',
            alignItems: 'center',
            flex: 1,
            marginRight: 8,
      },
      methodIcon: {
            margin: 0,
            marginRight: 10,
      },
      methodTitle: {
            fontSize: 15,
            fontWeight: '700',
            color: '#111827',
      },
      methodDesc: {
            fontSize: 12,
            color: '#6B7280',
            marginTop: 2,
      },
      modal: {
            backgroundColor: 'white',
            padding: 24,
            margin: 20,
            borderRadius: 16,
      },
      modalLarge: {
            backgroundColor: 'white',
            padding: 28,
            margin: 20,
            borderRadius: 20,
      }
});
