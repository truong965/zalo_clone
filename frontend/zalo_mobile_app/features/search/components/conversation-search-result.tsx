import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { ConversationMessageGroup } from '../types';
import { formatSearchTimestamp, getHighlightSegments } from '../utils/search.util';

interface ConversationSearchResultProps {
      data: ConversationMessageGroup;
      onClick?: (data: ConversationMessageGroup) => void;
}

export function ConversationSearchResult({ data, onClick }: ConversationSearchResultProps) {
      const { latestMatch } = data;
      const timestamp = formatSearchTimestamp(latestMatch.createdAt);
      const segments = getHighlightSegments(latestMatch.preview, latestMatch.highlights ?? []);

      return (
            <TouchableOpacity
                  className="flex-row items-start gap-3 px-4 py-3 bg-white border-b border-gray-100 active:bg-gray-50"
                  onPress={() => onClick?.(data)}
            >
                  {data.conversationAvatar ? (
                        <Image
                              source={{ uri: data.conversationAvatar }}
                              style={{ width: 44, height: 44, borderRadius: 22 }}
                        />
                  ) : (
                        <View className="w-11 h-11 rounded-full bg-gray-200 items-center justify-center">
                              <Ionicons name={data.conversationType === 'GROUP' ? "people" : "person"} size={20} color="#9CA3AF" />
                        </View>
                  )}

                  <View className="flex-1 min-w-0">
                        <View className="flex-row justify-between items-center mb-0.5">
                              <View className="flex-1 flex-row items-center mr-2">
                                    {data.conversationType === 'GROUP' && (
                                          <Ionicons name="people" size={12} color="#9CA3AF" style={{ marginRight: 4 }} />
                                    )}
                                    <Text className="text-sm font-semibold text-gray-800" numberOfLines={1}>
                                          {data.conversationName}
                                    </Text>
                              </View>
                              <Text className="text-xs text-gray-400">{timestamp}</Text>
                        </View>

                        <Text className="text-sm text-gray-500" numberOfLines={2}>
                              <Text className="font-semibold">{latestMatch.senderName}: </Text>
                              {segments.map((seg, idx) => (
                                    <Text
                                          key={idx}
                                          style={seg.highlighted ? { backgroundColor: '#fef08a', color: '#111827' } : undefined}
                                    >
                                          {seg.text}
                                    </Text>
                              ))}
                        </Text>

                        {data.matchCount > 1 && (
                              <Text className="text-xs text-blue-500 font-medium mt-1">
                                    {data.matchCount > 100 ? "99+" : data.matchCount} kết quả
                              </Text>
                        )}
                  </View>
            </TouchableOpacity>
      );
}
