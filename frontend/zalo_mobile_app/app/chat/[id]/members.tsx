import React, { useMemo, useState } from 'react';
import { View, FlatList, TouchableOpacity } from 'react-native';
import { Text, useTheme, List, ActivityIndicator, Portal } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useConversationMembers } from '@/features/chats/hooks/use-members';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useAuth } from '@/providers/auth-provider';
import { MemberActionsModal } from '@/features/chats/components/modals/member-actions-modal';
import { useMemberActions } from '@/features/chats/hooks/use-member-actions';

export default function GroupMembersScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  const { data: members = [], isLoading } = useConversationMembers(id);

  // Consolidate socket listeners and member actions
  const {
    handleTransferAdmin,
    handleRemoveMember,
  } = useMemberActions(id as string);

  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const isAdmin = useMemo(() => {
    // FIX: Normalize ID check (backend returns 'id', conversation.members has 'userId')
    const currentUser = members.find(m => (m.id) === user?.id);
    return currentUser?.role === 'ADMIN';
  }, [members, user?.id]);

  const handleMemberPress = (member: any) => {
    if ((member.userId || member.id) === user?.id) return;
    setSelectedMember(member);
    setModalVisible(true);
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <View
        className="bg-primary pt-12 pb-3 px-4 flex-row items-center"
        style={{ backgroundColor: 'hsl(217.2, 91.2%, 59.8%)' }}
      >
        <TouchableOpacity onPress={() => router.back()} className="mr-4">
          <Ionicons name="arrow-back" size={24} color="white" />
        </TouchableOpacity>
        <View className="flex-1">
          <Text className="text-white font-bold text-lg">
            Thành viên ({members.length})
          </Text>
        </View>
      </View>

      <FlatList
        data={members}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <List.Item
            title={item.displayName}
            description={item.role === 'ADMIN' ? 'Trưởng nhóm' : 'Thành viên'}
            left={props => (
              <View style={props.style} className="ml-2 justify-center">
                <UserAvatar size={48} uri={item.avatarUrl || undefined} />
              </View>
            )}
            right={props => item.role === 'ADMIN' ? <List.Icon {...props} icon="key" color="#eab308" /> : null}
            onPress={() => handleMemberPress(item)}
          />
        )}
        ItemSeparatorComponent={() => <View className="h-[1px] bg-gray-100 ml-16" />}
        contentContainerStyle={{ paddingBottom: 20 }}
      />

      <Portal>
        <MemberActionsModal
          visible={modalVisible}
          onDismiss={() => setModalVisible(false)}
          member={selectedMember}
          isAdmin={isAdmin}
          onTransferAdmin={handleTransferAdmin}
          onRemoveMember={handleRemoveMember}
        />
      </Portal>
    </View>
  );
}
