import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { MessageSearchResult } from '../types';
import { formatSearchTimestamp, getConversationTypeLabel, getHighlightSegments } from '../utils/search.util';

interface MessageResultProps {
      data: MessageSearchResult;
      hideConversationInfo?: boolean;
      onClick?: (result: MessageSearchResult) => void;
}

export function MessageResult({ data, hideConversationInfo = false, onClick }: MessageResultProps) {
      const timestamp = formatSearchTimestamp(data.createdAt);
      const typeLabel = getConversationTypeLabel(data.conversationType);
      
      const segments = getHighlightSegments(data.preview, data.highlights ?? []);

      return (
            <TouchableOpacity
                  className="flex-row items-start gap-3 px-4 py-3 bg-white border-b border-gray-100 active:bg-gray-50"
                  onPress={() => onClick?.(data)}
            >
                  {data.senderAvatarUrl ? (
                        <Image
                              source={{ uri: data.senderAvatarUrl }}
                              style={{ width: 40, height: 40, borderRadius: 20 }}
                        />
                  ) : (
                        <View className="w-10 h-10 rounded-full bg-gray-200 items-center justify-center">
                              <Ionicons name="person" size={20} color="#9CA3AF" />
                        </View>
                  )}

                  <View className="flex-1 min-w-0">
                        <View className="flex-row justify-between items-center mb-0.5">
                              <Text className="text-sm font-semibold text-gray-800 flex-1 mr-2" numberOfLines={1}>
                                    {data.senderName}
                              </Text>
                              <Text className="text-xs text-gray-400">{timestamp}</Text>
                        </View>

                        <Text className="text-sm text-gray-600" numberOfLines={2}>
                              {segments.map((seg, idx) => (
                                    <Text
                                          key={idx}
                                          style={seg.highlighted ? { backgroundColor: '#fef08a', color: '#111827' } : undefined}
                                    >
                                          {seg.text}
                                    </Text>
                              ))}
                        </Text>

                        {!hideConversationInfo && (
                              <View className="mt-1 flex-row">
                                    <View className={`px-1.5 py-0.5 rounded ${data.conversationType === 'GROUP' ? 'bg-orange-100' : 'bg-blue-100'}`}>
                                          <Text className={`text-[10px] ${data.conversationType === 'GROUP' ? 'text-orange-700' : 'text-blue-700'}`}>
                                                {typeLabel}
                                          </Text>
                                    </View>
                              </View>
                        )}
                  </View>
            </TouchableOpacity>
      );
}
