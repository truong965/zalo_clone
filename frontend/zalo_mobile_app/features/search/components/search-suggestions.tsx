import React from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSearchHistory } from '../hooks/use-search-history';

interface SearchSuggestionsProps {
      onSelect: (keyword: string) => void;
}

export function SearchSuggestions({ onSelect }: SearchSuggestionsProps) {
      const { history, deleteHistory, clearHistory } = useSearchHistory();

      return (
            <ScrollView className="flex-1 bg-white">
                  {/* Recent Searches */}
                  {history.length > 0 && (
                        <View key="recent-searches" className="py-2">
                              <View className="flex-row justify-between items-center px-4 py-2">
                                    <Text className="text-sm font-bold text-gray-800">Tìm gần đây</Text>
                                    <TouchableOpacity onPress={() => clearHistory()}>
                                          <Text className="text-xs text-blue-500">Xóa tất cả</Text>
                                    </TouchableOpacity>
                              </View>
                              {history.slice(0, 10).map((item) => (
                                    <TouchableOpacity
                                          key={item.id}
                                          onPress={() => onSelect(item.keyword)}
                                          className="flex-row items-center gap-3 px-4 py-3 active:bg-gray-50"
                                    >
                                          <Ionicons name="time-outline" size={20} color="#9CA3AF" />
                                          <Text className="flex-1 text-gray-700">{item.keyword}</Text>
                                          <TouchableOpacity onPress={() => deleteHistory(item.id)}>
                                                <Ionicons name="close" size={18} color="#9CA3AF" />
                                          </TouchableOpacity>
                                    </TouchableOpacity>
                              ))}
                        </View>
                  )}

                  {/* Contact Suggestions Placeholder - In web it might show frequently contacted */}
                  <View className="py-2 border-t border-gray-100">
                        <View className="px-4 py-2">
                              <Text className="text-sm font-bold text-gray-800">Gợi ý liên hệ</Text>
                        </View>
                        <View className="px-4 py-4 items-center justify-center">
                              <Text className="text-gray-400 text-xs text-center">
                                    Các liên hệ bạn thường xuyên tương tác sẽ hiển thị ở đây.
                              </Text>
                        </View>
                  </View>
            </ScrollView>
      );
}
