import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import type { GroupSearchResult } from '../types';
import { formatSearchTimestamp } from '../utils/search.util';

interface GroupResultProps {
      data: GroupSearchResult;
      onClick?: (result: GroupSearchResult) => void;
}

export function GroupResult({ data, onClick }: GroupResultProps) {
      const membersText =
            data.membersPreview.length > 0
                  ? data.membersPreview.slice(0, 3).join(', ')
                  : `${data.memberCount} thành viên`;

      return (
            <TouchableOpacity
                  className="flex-row items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 active:bg-gray-50"
                  onPress={() => onClick?.(data)}
            >
                  {data.avatarUrl ? (
                        <Image
                              source={{ uri: data.avatarUrl }}
                              style={{ width: 44, height: 44, borderRadius: 22 }}
                        />
                  ) : (
                        <View className="w-11 h-11 rounded-full bg-orange-400 items-center justify-center">
                              <Text className="text-white font-semibold text-lg">
                                    {data.name?.[0]?.toUpperCase() ?? 'G'}
                              </Text>
                        </View>
                  )}

                  <View className="flex-1 min-w-0">
                        <View className="flex-row items-center gap-2 mb-0.5">
                              <Text className="text-sm font-semibold text-gray-800" numberOfLines={1}>
                                    {data.name}
                              </Text>
                              <View className={`px-1.5 py-0.5 rounded ${data.isUserMember ? 'bg-green-100' : 'bg-gray-100'}`}>
                                    <Text className={`text-[10px] ${data.isUserMember ? 'text-green-700' : 'text-gray-700'}`}>
                                          {data.isUserMember ? 'Đã tham gia' : 'Chưa tham gia'}
                                    </Text>
                              </View>
                        </View>
                        <Text className="text-xs text-gray-500" numberOfLines={1}>
                              <Ionicons name="people" size={12} /> {data.memberCount} thành viên
                              {data.membersPreview.length > 0 && ` · ${membersText}`}
                        </Text>
                        {data.lastMessageAt && (
                              <Text className="text-[10px] text-gray-400 mt-0.5">
                                    Hoạt động {formatSearchTimestamp(data.lastMessageAt)}
                              </Text>
                        )}
                  </View>
            </TouchableOpacity>
      );
}
