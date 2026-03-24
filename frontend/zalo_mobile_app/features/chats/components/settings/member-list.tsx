import React from 'react';
import { View, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Text, useTheme, Avatar } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { ConversationMember } from '@/types/conversation';
import { ConversationSearchMember } from '@/features/chats/search.types';
import { UserAvatar } from '@/components/ui/user-avatar';

interface MemberListProps {
  members: (ConversationMember | ConversationSearchMember)[];
  totalCount?: number;
  onAddMember: () => void;
  onMemberPress: (member: any) => void;
  onSeeAll: () => void;
  isAdmin: boolean;
}

export function MemberList({ members, totalCount, onAddMember, onMemberPress, onSeeAll, isAdmin }: MemberListProps) {
  const theme = useTheme();

  return (
    <View className="bg-card py-4">
      <View className="flex-row justify-between items-center px-4 mb-4">
        <Text className="text-lg font-bold px-3">Thành viên ({totalCount ?? members.length})</Text>
        <TouchableOpacity className="flex-row items-center" onPress={onSeeAll}>
          <Text className="text-primary mr-1">Tất cả</Text>
          <Ionicons name="chevron-forward" size={16} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="px-2">
        <TouchableOpacity
          key="add-member"
          className="items-center mx-2 px-2"
          onPress={onAddMember}
        >
          <View className="w-16 h-16 rounded-full bg-secondary items-center justify-center mb-1">
            <Ionicons name="person-add" size={30} color={theme.colors.backdrop} />
          </View>
          <Text className="text-xs text-center">Thêm</Text>
        </TouchableOpacity>

        {(members || []).slice(0, 5).map((member) => {
          const memberId = member.id || (member as any).userId;
          return (
            <TouchableOpacity
              key={memberId}
              className="items-center mx-2 px-2"
              onPress={() => onMemberPress(member)}
            >
              <View className="relative">
                <UserAvatar size={56} uri={member.avatarUrl || undefined} />
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
          );
        })}
      </ScrollView>
    </View>
  );
}
