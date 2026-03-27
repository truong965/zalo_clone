import { useRouter } from 'expo-router';
import { View, ScrollView } from 'react-native';
import { Appbar, List, Divider } from 'react-native-paper';
import { useTranslation } from 'react-i18next';

export default function SecurityScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <View className="flex-1 bg-[#f4f5f7]">
      <Appbar.Header style={{ backgroundColor: '#1E88E5' }}>
        <Appbar.BackAction color="white" onPress={() => router.back()} />
        <Appbar.Content title={t('settings.privacy.title')} titleStyle={{ color: 'white' }} />
      </Appbar.Header>
      
      <ScrollView className="flex-1">
        <View className="p-4">
          <List.Section className="bg-background rounded-lg overflow-hidden">
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
              title={t('settings.privacy.blockedListTitle')}
              left={props => <List.Icon {...props} icon="account-off" />}
              right={props => <List.Icon {...props} icon="chevron-right" />}
              onPress={() => router.push('/profile/blocked-list' as any)}
            />
          </List.Section>
        </View>
      </ScrollView>
    </View>
  );
}
