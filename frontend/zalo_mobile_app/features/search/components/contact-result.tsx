import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { ContactSearchResult, RelationshipStatus } from '../types';
import { getRelationshipLabel } from '../utils/search.util';

interface ContactResultProps {
      data: ContactSearchResult;
      onClick?: (
            result: ContactSearchResult,
            effectiveStatus: RelationshipStatus,
            effectiveDirection?: 'OUTGOING' | 'INCOMING' | null,
            effectivePendingId?: string | null,
      ) => void;
      onSendMessage?: (contactId: string) => void;
      onAddFriend?: (contactId: string) => void;
      onAcceptRequest?: (requestId: string, contactId: string) => void;
      onCancelRequest?: (requestId: string, contactId: string) => void;
      isLoading?: boolean;
}

import { useFriendRequestStatus } from '../../friendship/hooks/use-friend-request-status';

export function ContactResult({
      data,
      onClick,
      onSendMessage,
      onAddFriend,
      onAcceptRequest,
      onCancelRequest,
      isLoading,
}: ContactResultProps) {
      const { 
            isFriend, 
            isPending, 
            pendingRequestDirection: liveDirection, 
            sentRequest, 
            receivedRequest 
      } = useFriendRequestStatus(data.id);
 
      // Synchronization Fix: Override server data with local cache (TanStack Query)
      // Ported from Web logic: Priority: FRIEND > REQUEST (pending) > NONE (search result)
      const effectiveStatus = isFriend 
            ? 'FRIEND' 
            : isPending 
                  ? 'REQUEST' 
                  : data.relationshipStatus;

      const effectiveDirection = isPending 
            ? (liveDirection ?? (data.requestDirection ?? null))
            : (data.requestDirection ?? null);

      const effectivePendingId = isPending
            ? (liveDirection === 'OUTGOING' ? sentRequest?.id : receivedRequest?.id)
            : data.pendingRequestId;
 
      const relationLabel = getRelationshipLabel(
            effectiveStatus as any,
            effectiveDirection as any,
      );

      const effectiveName =
            effectiveStatus === 'FRIEND'
                  ? (data.displayNameFinal || data.displayName)
                  : data.displayName;

      const getTagColor = () => {
            if (effectiveStatus === 'FRIEND') return 'bg-green-100 text-green-700';
            if (effectiveStatus === 'REQUEST') return 'bg-orange-100 text-orange-700';
            if (effectiveStatus === 'BLOCKED') return 'bg-red-100 text-red-700';
            return 'bg-gray-100 text-gray-700';
      };

      return (
            <TouchableOpacity
                  disabled={isLoading}
                  className="flex-row items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 active:bg-gray-50"
                  style={isLoading ? { opacity: 0.5 } : undefined}
                  onPress={() => onClick?.(data, effectiveStatus, effectiveDirection ?? undefined, effectivePendingId)}
            >
                  <View className="relative">
                        {data.avatarUrl ? (
                              <Image
                                    source={{ uri: data.avatarUrl }}
                                    style={{ width: 44, height: 44, borderRadius: 22 }}
                              />
                        ) : (
                              <View className="w-11 h-11 rounded-full bg-gray-200 items-center justify-center">
                                    <Ionicons name="person" size={20} color="#9CA3AF" />
                              </View>
                        )}
                        {data.isOnline && (
                              <View className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                        )}
                  </View>

                  <View className="flex-1 min-w-0">
                        <View className="flex-row items-center gap-2 mb-0.5 max-w-[90%]">
                              <Text className="text-sm font-semibold text-gray-800" numberOfLines={1}>
                                    {effectiveName}
                              </Text>
                              <View className={`px-1.5 py-0.5 rounded ${getTagColor().split(' ')[0]}`}>
                                    <Text className={`text-[10px] ${getTagColor().split(' ')[1]}`}>
                                          {relationLabel}
                                    </Text>
                              </View>
                        </View>
                        {data.phoneNumber ? (
                              <Text className="text-xs text-gray-400">
                                    {data.phoneNumber}
                              </Text>
                        ) : null}
                  </View>

                  <View className="flex-row items-center gap-3 ml-2">
                        {data.canMessage !== false && (
                              <TouchableOpacity disabled={isLoading} onPress={() => onSendMessage?.(data.id)}>
                                    <Ionicons name="chatbubble-outline" size={20} color="#1E88E5" />
                              </TouchableOpacity>
                        )}
                        {effectiveStatus === 'NONE' && (
                              <TouchableOpacity disabled={isLoading} onPress={() => onAddFriend?.(data.id)}>
                                    <Ionicons name="person-add-outline" size={20} color="#1E88E5" />
                              </TouchableOpacity>
                        )}
                        {effectiveStatus === 'REQUEST' && effectiveDirection === 'OUTGOING' && effectivePendingId && (
                              <TouchableOpacity disabled={isLoading} onPress={() => onCancelRequest?.(effectivePendingId, data.id)}>
                                    <Ionicons name="close-circle-outline" size={22} color="#F59E0B" />
                              </TouchableOpacity>
                        )}
                        {effectiveStatus === 'REQUEST' && effectiveDirection === 'INCOMING' && effectivePendingId && (
                              <TouchableOpacity disabled={isLoading} onPress={() => onAcceptRequest?.(effectivePendingId, data.id)}>
                                    <Ionicons name="checkmark-circle-outline" size={22} color="#10B981" />
                              </TouchableOpacity>
                        )}
                  </View>
            </TouchableOpacity>
      );
}
