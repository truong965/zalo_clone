import React from 'react';
import { View, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Text, useTheme, Avatar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { ConversationMember } from '@/types/conversation';

interface MemberListProps {
  members: ConversationMember[];
  onAddMember: () => void;
  onMemberPress: (userId: string) => void;
  isAdmin: boolean;
}

export function MemberList({ members, onAddMember, onMemberPress, isAdmin }: MemberListProps) {
  const theme = useTheme();

  return (
    <View className="bg-card py-4">
      <View className="flex-row justify-between items-center px-4 mb-4">
        <Text className="text-lg font-bold">Thành viên ({members.length})</Text>
        <TouchableOpacity className="flex-row items-center" onPress={() => console.log('See all')}>
            <Text className="text-primary mr-1">Tất cả</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-2">
        <TouchableOpacity 
            className="items-center mx-2"
            onPress={onAddMember}
        >
            <View className="w-14 h-14 rounded-full bg-secondary items-center justify-center mb-1">
                <Ionicons name="person-add" size={24} color={theme.colors.onSecondary} />
            </View>
            <Text className="text-xs text-center">Thêm</Text>
        </TouchableOpacity>

        {members.map((member) => (
          <TouchableOpacity 
            key={member.userId} 
            className="items-center mx-2"
            onPress={() => onMemberPress(member.userId)}
          >
            <View className="relative">
                <Avatar.Image
                size={56}
                source={member.avatarUrl ? { uri: member.avatarUrl } : require('@/assets/images/icon.png')}
                />
                {member.role === 'ADMIN' && (
                    <View className="absolute -bottom-1 -right-1 bg-yellow-500 rounded-full p-0.5 border-2 border-card">
                        <Ionicons name="key" size={10} color="white" />
                    </View>
                )}
            </View>
            <Text className="text-xs mt-1 text-center w-16" numberOfLines={1}>
              {member.displayName}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
