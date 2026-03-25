import React from 'react';
import { View, Text, ScrollView } from 'react-native';

export function SearchLoading() {
      // Simple Skeleton implementation for mobile
      return (
            <ScrollView className="flex-1 bg-white">
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                        <View key={i} className="flex-row items-center gap-3 px-4 py-3 border-b border-gray-50">
                              <View className="w-11 h-11 rounded-full bg-gray-100" />
                              <View className="flex-1 gap-2">
                                    <View className="h-4 w-1/2 bg-gray-100 rounded" />
                                    <View className="h-3 w-1/3 bg-gray-50 rounded" />
                              </View>
                        </View>
                  ))}
            </ScrollView>
      );
}
