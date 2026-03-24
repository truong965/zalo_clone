import React, { useMemo, useState } from 'react';
import { View, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useJoinRequests } from '@/features/chats/hooks/use-join-requests';
import { JoinRequestItem } from '@/features/chats/components/settings/join-request-item';
import { SearchBar } from '@/components/ui/search-bar';
import { useAuth } from '@/providers/auth-provider';
import { useQuery } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function JoinRequestsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const { accessToken } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: conversation, isLoading: convLoading } = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => mobileApi.getConversation(id as string, accessToken!),
    enabled: !!id && !!accessToken,
  });

  const isAdmin = useMemo(() => {
    if (!conversation) return false;
    return conversation.myRole?.toUpperCase() === 'ADMIN';
  }, [conversation]);

  const { requests, isLoading, reviewRequest } = useJoinRequests(id as string, isAdmin);

  const filteredRequests = useMemo(() => {
    if (!searchQuery.trim()) return requests;
    const query = searchQuery.toLowerCase();
    return requests.filter(req => 
      req.user?.displayName?.toLowerCase().includes(query)
    );
  }, [requests, searchQuery]);

  if (convLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <SafeAreaView className="bg-primary" edges={['top']}>
        <View className="flex-row items-center px-4 py-3">
          <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
            <Ionicons name="arrow-back" size={24} color="white" />
          </TouchableOpacity>
          <Text className="text-white font-bold text-lg ml-2">
            Yêu cầu tham gia ({requests.length})
          </Text>
        </View>
      </SafeAreaView>

      <SearchBar
        placeholder="Tìm kiếm người dùng"
        value={searchQuery}
        onChangeText={setSearchQuery}
        containerClass="p-3"
      />

      {isLoading && requests.length === 0 ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : (
        <FlatList
          data={filteredRequests}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <JoinRequestItem
              request={item}
              onAccept={(rid) => reviewRequest(rid, true)}
              onDecline={(rid) => reviewRequest(rid, false)}
            />
          )}
          ListEmptyComponent={() => (
            <View className="flex-1 items-center justify-center pt-20">
              <Ionicons name="people-outline" size={64} color={theme.colors.outline} />
              <Text className="mt-4 text-muted-foreground italic">
                {searchQuery ? 'Không tìm thấy kết quả' : 'Chưa có yêu cầu nào'}
              </Text>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );
}
