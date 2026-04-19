import React, { useMemo, useState, useEffect } from 'react';
import { View, ScrollView, Switch } from 'react-native';
import { Text, useTheme, Portal } from 'react-native-paper';
import { Conversation } from '@/types/conversation';
import { ProfileHeader } from './profile-header';
import { SettingsListItem } from './settings-list-item';
import { MemberList } from './member-list';
import { MediaExpandableSection } from './media-expandable-section';
import { useRouter } from 'expo-router';
import { useConversationActions } from '@/features/chats/hooks/use-conversation-actions';
import { useConversationSettings } from '@/features/chats/hooks/use-conversation-settings';
import Toast from 'react-native-toast-message';
import { useReminders } from '@/features/chats/hooks/use-reminders';
import { useJoinRequests } from '@/features/chats/hooks/use-join-requests';
import { ReminderItem } from './reminder-item';
import { JoinRequestItem } from './join-request-item';
import { useAuth } from '@/providers/auth-provider';
import { AddMembersModal } from '../modals/add-members-modal';
import { useMemberActions } from '@/features/chats/hooks/use-member-actions';
import { TransferAdminModal } from '@/features/chats/components/modals/transfer-admin-modal';
import { MemberActionsModal } from '@/features/chats/components/modals/member-actions-modal';
import { GroupQrModal } from '@/features/chats/components/modals/group-qr-modal';

interface GroupSettingsProps {
  conversation: Conversation;
  members: any[];
  isAdmin: boolean;
  onEditName: () => void;
  onEditAvatar: () => void;
}

export function GroupSettings({ conversation, members: propMembers, isAdmin, onEditName, onEditAvatar }: GroupSettingsProps) {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { pinConversation, muteConversation, isPinning, isMuting } = useConversationActions();
  const {
    updateMutation,
    addMembersMutation,
  } = useConversationSettings(conversation.id);

  const { reminders, deleteReminder, completeReminder } = useReminders(conversation.id);
  const { requests: joinRequests, reviewRequest } = useJoinRequests(conversation.id, isAdmin);

  // Consolidate socket listeners and member actions
  const {
    handleTransferAdmin,
    handleRemoveMember,
    handleLeaveGroup,
    handleDissolveGroup,
  } = useMemberActions(conversation.id);

  const members = useMemo(() => {
    return propMembers.length > 0 ? propMembers : (conversation.members || []);
  }, [propMembers, conversation.members]);

  const [addMemberVisible, setAddMemberVisible] = useState(false);
  const [transferAdminVisible, setTransferAdminVisible] = useState(false);
  const [memberActionsVisible, setMemberActionsVisible] = useState(false);
  const [groupQrVisible, setGroupQrVisible] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [remindersExpanded, setRemindersExpanded] = useState(false);
  const [requireApproval, setRequireApproval] = useState(conversation.requireApproval || false);

  // Sync state with props when data is refreshed via socket/refetch
  useEffect(() => {
    setRequireApproval(conversation.requireApproval || false);
  }, [conversation.requireApproval]);

  const handleToggleApproval = async (value: boolean) => {
    setRequireApproval(value);
    try {
      await updateMutation.mutateAsync({ requireApproval: value });
    } catch (error: any) {
      setRequireApproval(!value); // Rollback
      Toast.show({ type: 'error', text1: 'Lỗi', text2: error?.message || 'Không thể cập nhật thiết lập' });
    }
  };

  const handleMemberPress = (member: any) => {
    const memberId = member.userId || member.id || member.user?.id;
    if (memberId === user?.id) return; // Don't show actions for self
    setSelectedMember(member);
    setMemberActionsVisible(true);
  };

  const handleAddMembers = (userIds: string[]) => {
    setAddMemberVisible(false);
    addMembersMutation.mutate(userIds, {
      onError: (error: any) => {
        Toast.show({ type: 'error', text1: 'Lỗi', text2: error?.message || 'Không thể thêm thành viên' });
      }
    });
  };

  const excludeIds = useMemo(
    () => (conversation.members?.map(m => m.userId).filter(Boolean) as string[]) ?? [],
    [conversation.members]
  );

  return (
    <View className="flex-1 bg-background">
      <ScrollView>
        <ProfileHeader
          conversation={{
            ...conversation,
            members: members.length > 0 ? members : (conversation.members || [])
          } as any}
          isAdmin={isAdmin}
          onEditName={onEditName}
          onEditAvatar={onEditAvatar}
          onAddMember={() => setAddMemberVisible(true)}
          onTogglePin={() => pinConversation(conversation.id, !conversation.isPinned)}
          onToggleMute={() => muteConversation(conversation.id, !conversation.isMuted)}
          isPinning={isPinning}
          isMuting={isMuting}
        />

        <View className="mt-2" />
        <SettingsListItem
          icon="time-outline"
          label={`Danh sách nhắc hẹn (${reminders.length})`}
          onPress={() => setRemindersExpanded(!remindersExpanded)}
          right={remindersExpanded ? "chevron-up" : "chevron-down"}
        />
        {remindersExpanded && (
          <View className="bg-card shadow-sm">
            {reminders.length > 0 ? (
              reminders.map((reminder) => (
                <ReminderItem
                  key={reminder.id}
                  reminder={reminder}
                  currentUserId={user?.id || ''}
                  onDelete={deleteReminder}
                  onComplete={completeReminder}
                />
              ))
            ) : (
              <Text className="p-4 text-muted-foreground italic text-center text-sm">Chưa có nhắc hẹn nào</Text>
            )}
          </View>
        )}

        <MediaExpandableSection
          conversationId={conversation.id}
          onExpand={() => router.push(`/chat/${conversation.id}/media`)}
        />

        <View className="mt-2" />
        <SettingsListItem
          icon="qr-code-outline"
          label="Mời tham gia nhóm qua QR"
          onPress={() => setGroupQrVisible(true)}
        />

        <View className="mt-2" />
        <MemberList
          members={members.length > 0 ? members : (conversation.members || [])}
          totalCount={members.length}
          isAdmin={isAdmin}
          onAddMember={() => setAddMemberVisible(true)}
          onMemberPress={handleMemberPress}
          onSeeAll={() => router.push(`/chat/${conversation.id}/members`)}
        />

        <View className="mt-2" />
        {isAdmin && (
          <>
            <SettingsListItem
              icon="notifications-outline"
              label={`Yêu cầu tham gia (${joinRequests?.length || 0})`}
              onPress={() => router.push(`/chat/${conversation.id}/join-requests`)}
            />

            <View className="mt-2" />
            <Text className="px-4 py-2 text-xs font-bold text-muted-foreground uppercase">Thiết lập nhóm</Text>
            <SettingsListItem
              icon="shield-checkmark-outline"
              label="Phê duyệt thành viên"
              onPress={() => handleToggleApproval(!requireApproval)}
              right={<Switch value={requireApproval} onValueChange={handleToggleApproval} />}
            />
            <SettingsListItem
              icon="swap-horizontal-outline"
              label="Chuyển quyền trưởng nhóm"
              onPress={() => setTransferAdminVisible(true)}
              hideChevron
            />
            <SettingsListItem
              icon="trash-outline"
              label="Giải tán nhóm"
              onPress={handleDissolveGroup}
              destructive
              hideChevron
            />
          </>
        )}

        <View className="h-10" />
        <SettingsListItem
          icon="exit-outline"
          label="Rời nhóm"
          onPress={() => handleLeaveGroup(isAdmin, members.length, () => setTransferAdminVisible(true))}
          destructive
          hideChevron
        />
        <View className="h-10" />
      </ScrollView>

      {addMemberVisible && (
        <AddMembersModal
          visible={addMemberVisible}
          onDismiss={() => setAddMemberVisible(false)}
          onAdd={handleAddMembers}
          excludeIds={excludeIds}
          conversationId={conversation.id}
          isLoading={addMembersMutation.isPending}
        />
      )}

      {transferAdminVisible && (
        <TransferAdminModal
          visible={transferAdminVisible}
          onDismiss={() => setTransferAdminVisible(false)}
          members={conversation.members || []}
          onTransfer={(member) => handleTransferAdmin(member, () => {
            setTransferAdminVisible(false);
            setMemberActionsVisible(false);
          })}
          currentUserId={user?.id}
        />
      )}

      <Portal>
        <GroupQrModal
          visible={groupQrVisible}
          onDismiss={() => setGroupQrVisible(false)}
          conversationId={conversation.id}
          groupName={conversation.name}
          memberCount={members.length || conversation.memberCount || 0}
        />

        <MemberActionsModal
          visible={memberActionsVisible}
          onDismiss={() => setMemberActionsVisible(false)}
          member={selectedMember}
          isAdmin={isAdmin}
          onTransferAdmin={handleTransferAdmin}
          onRemoveMember={(id) => handleRemoveMember(id, () => setMemberActionsVisible(false))}
        />
      </Portal>
    </View>
  );
}
