import React from 'react';
import { View, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RelationshipStatus } from '../../search/types';

interface UserRelationshipButtonsProps {
  userId: string;
  status: RelationshipStatus;
  direction?: 'OUTGOING' | 'INCOMING' | null;
  pendingId?: string | null;
  canMessage?: boolean;
  isLoading?: boolean;
  onSendMessage?: (userId: string) => void;
  onAddFriend?: (userId: string) => void;
  onAcceptRequest?: (requestId: string, userId: string) => void;
  onCancelRequest?: (requestId: string, userId: string) => void;
  onDeclineRequest?: (requestId: string, userId: string) => void;
}

export function UserRelationshipButtons({
  userId,
  status,
  direction,
  pendingId,
  canMessage = true,
  isLoading,
  onSendMessage,
  onAddFriend,
  onAcceptRequest,
  onCancelRequest,
  onDeclineRequest,
}: UserRelationshipButtonsProps) {
  const handleCancel = () => {
    if (!pendingId) return;
    Alert.alert(
      'Hủy lời mời',
      'Bạn có chắc chắn muốn hủy lời mời kết bạn này không?',
      [
        { text: 'Bỏ qua', style: 'cancel' },
        { text: 'Đồng ý', onPress: () => onCancelRequest?.(pendingId, userId), style: 'destructive' },
      ]
    );
  };

  const handleDecline = () => {
    if (!pendingId) return;
    Alert.alert(
      'Từ chối lời mời',
      'Bạn có chắc chắn muốn từ chối lời mời kết bạn này không?',
      [
        { text: 'Bỏ qua', style: 'cancel' },
        { text: 'Đồng ý', onPress: () => onDeclineRequest?.(pendingId, userId), style: 'destructive' },
      ]
    );
  };
  return (
    <View className="flex-row items-center gap-3">
      {canMessage && (
        <TouchableOpacity 
          className="p-2"
          disabled={isLoading} 
          onPress={() => onSendMessage?.(userId)}
        >
          <Ionicons name="chatbubble-outline" size={26} color="#1E88E5" />
        </TouchableOpacity>
      )}
      
      {status === 'NONE' && (
        <TouchableOpacity 
          className="p-2"
          disabled={isLoading} 
          onPress={() => onAddFriend?.(userId)}
        >
          <Ionicons name="person-add-outline" size={26} color="#1E88E5" />
        </TouchableOpacity>
      )}

      {status === 'REQUEST' && direction === 'OUTGOING' && pendingId && (
        <TouchableOpacity 
          className="p-2"
          disabled={isLoading} 
          onPress={handleCancel}
        >
          <Ionicons name="close-circle-outline" size={28} color="#F59E0B" />
        </TouchableOpacity>
      )}

      {status === 'REQUEST' && direction === 'INCOMING' && pendingId && (
        <>
          <TouchableOpacity 
            className="p-2"
            disabled={isLoading} 
            onPress={() => onAcceptRequest?.(pendingId, userId)}
          >
            <Ionicons name="checkmark-circle-outline" size={28} color="#10B981" />
          </TouchableOpacity>
          {onDeclineRequest && (
            <TouchableOpacity 
              className="p-2"
              disabled={isLoading} 
              onPress={handleDecline}
            >
              <Ionicons name="close-circle-outline" size={28} color="#EF4444" />
            </TouchableOpacity>
          )}
        </>
      )}
    </View>
  );
}
