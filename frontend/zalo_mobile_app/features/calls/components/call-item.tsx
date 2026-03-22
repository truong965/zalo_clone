import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Text, IconButton, useTheme } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday } from 'date-fns';
import { vi } from 'date-fns/locale';
import { UserAvatar } from '@/components/ui/user-avatar';
import { CallHistoryItem } from '@/types/call';

interface CallItemProps {
  item: CallHistoryItem;
  currentUserId: string;
  onCall: (item: CallHistoryItem) => void;
}

export const CallItem = React.memo(({ item, currentUserId, onCall }: CallItemProps) => {
  const theme = useTheme();

  const isOutgoing = item.initiatorId === currentUserId;
  const isMissed = item.status === 'MISSED' || item.status === 'NO_ANSWER' || item.status === 'REJECTED';
  
  // Find the other participant
  const otherParticipant = item.participants.find(p => p.userId !== currentUserId);
  const displayName = otherParticipant?.user?.displayName || item.initiator?.displayName || 'Người dùng';
  const avatarUrl = otherParticipant?.user?.avatarUrl || item.initiator?.avatarUrl;

  const startTime = new Date(item.startedAt);
  const timeStr = isToday(startTime) 
    ? format(startTime, 'HH:mm') 
    : format(startTime, 'dd/MM HH:mm', { locale: vi });

  const getStatusText = () => {
    if (isMissed) return 'Cuộc gọi nhỡ';
    if (item.status === 'CANCELLED') return 'Cuộc gọi đã hủy';
    return item.callType === 'VIDEO' ? 'Cuộc gọi video' : 'Cuộc gọi thoại';
  };

  const getStatusIcon = () => {
    if (isOutgoing) return 'arrow-up-outline';
    return isMissed ? 'arrow-down-outline' : 'arrow-down-outline';
  };

  const getStatusColor = () => {
    if (isMissed && !isOutgoing) return theme.colors.error;
    return theme.colors.outline;
  };

  return (
    <View className="flex-row items-center p-4 bg-background border-b border-border/50">
      <UserAvatar uri={avatarUrl} size={48} />
      
      <View className="flex-1 ml-4 justify-center">
        <Text 
          className={`font-bold text-base ${isMissed && !isOutgoing ? 'text-error' : 'text-foreground'}`} 
          numberOfLines={1}
        >
          {displayName}
        </Text>
        
        <View className="flex-row items-center mt-0.5">
          <Ionicons 
            name={getStatusIcon()} 
            size={12} 
            color={getStatusColor()} 
          />
          <Text className="text-muted-foreground text-xs ml-1">
            {getStatusText()} • {timeStr}
          </Text>
        </View>
      </View>

      <IconButton
        icon={item.callType === 'VIDEO' ? 'video-outline' : 'phone-outline'}
        size={24}
        onPress={() => onCall(item)}
        iconColor={theme.colors.primary}
      />
    </View>
  );
});

CallItem.displayName = 'CallItem';
