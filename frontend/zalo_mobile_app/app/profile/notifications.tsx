import { useRouter } from 'expo-router';
import { View, Text } from 'react-native';
import { Appbar } from 'react-native-paper';

export default function NotificationsScreen() {
  const router = useRouter();
  return (
    <View className="flex-1 bg-background">
      <Appbar.Header style={{ backgroundColor: '#1E88E5' }}>
        <Appbar.BackAction color="white" onPress={() => router.back()} />
        <Appbar.Content title="Thông báo" titleStyle={{ color: 'white' }} />
      </Appbar.Header>
      <View className="flex-1 items-center justify-center p-4">
        <Text className="text-lg font-bold">Cài đặt Thông báo</Text>
        <Text className="text-muted-foreground mt-2">Tính năng đang được phát triển</Text>
      </View>
    </View>
  );
}
