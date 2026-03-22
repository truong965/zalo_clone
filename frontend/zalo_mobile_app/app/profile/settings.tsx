import { useRouter } from 'expo-router';
import { View, ScrollView } from 'react-native';
import { Appbar, List, Button, Divider } from 'react-native-paper';
import { useAuth } from '@/providers/auth-provider';

export default function SettingsScreen() {
  const router = useRouter();
  const { logout } = useAuth();

  const onLogout = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <View className="flex-1 bg-background">
      <Appbar.Header style={{ backgroundColor: '#1E88E5' }}>
        <Appbar.BackAction color="white" onPress={() => router.back()} />
        <Appbar.Content title="Cài đặt" titleStyle={{ color: 'white' }} />
      </Appbar.Header>

      <ScrollView>
        <List.Section>
          <List.Item
            title="Quyền riêng tư"
            left={props => <List.Icon {...props} icon="lock-outline" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => router.push('/profile/privacy')}
          />
          <Divider />
          <List.Item
            title="Thông báo"
            left={props => <List.Icon {...props} icon="bell-outline" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => router.push('/profile/notifications')}
          />
          <Divider />
          <List.Item
            title="Tài khoản và bảo mật"
            left={props => <List.Icon {...props} icon="shield-check-outline" />}
            right={props => <List.Icon {...props} icon="chevron-right" />}
            onPress={() => router.push('/profile/security')}
          />
          <Divider />
        </List.Section>

        <View className="p-4 mt-4">
          <Button 
            mode="contained" 
            onPress={onLogout}
            buttonColor="#FF5252"
            textColor="white"
            className="rounded-xl py-1"
          >
            Đăng xuất tài khoản
          </Button>
        </View>
      </ScrollView>
    </View>
  );
}
