import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text, useTheme, Button } from 'react-native-paper';
import { UserAvatar } from '@/components/ui/user-avatar';
import { JoinRequest } from '@/types/join-request';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';

interface JoinRequestItemProps {
  request: JoinRequest;
  onAccept: (requestId: string) => void;
  onDecline: (requestId: string) => void;
}

export function JoinRequestItem({ request, onAccept, onDecline }: JoinRequestItemProps) {
  const theme = useTheme();

  if (!request || !request.user) return null;

  return (
    <View className="flex-row items-center p-3 border-b border-border bg-card p-2">
      <UserAvatar uri={request.user.avatarUrl || ''} size={48} />

      <View className="flex-1 ml-3">
        <Text className="font-bold text-base">{request.user.displayName || 'Unknown'}</Text>
        <Text className="text-xs text-muted-foreground">
          {request.requestedAt ? format(new Date(request.requestedAt), 'HH:mm, dd/MM/yyyy', { locale: vi }) : ''}
        </Text>
        {request.message && (
          <Text className="text-sm mt-1" numberOfLines={2}>
            "{request.message}"
          </Text>
        )}
      </View>

      <View className="flex-row">
        <Button
          mode="contained"
          compact
          className="ml-1"
          onPress={() => onAccept(request.id)}
        >
          Duyệt
        </Button>
        <Button
          mode="text"
          compact
          onPress={() => onDecline(request.id)}
          textColor={theme.colors.error}
        >
          Từ chối
        </Button>

      </View>
    </View>
  );
}
