/**
 * GroupInfoContent — Main container for GROUP conversation info sidebar.
 *
 * Fetches members, listens to socket events for realtime updates,
 * and composes all group info sub-components.
 *
 * Data flow:
 * - useConversationById → conversation details
 * - useConversationMembers → member list (with role)
 * - useConversationSocket → realtime updates + mutations
 *
 * Edge cases handled:
 * - R1: Admin can't leave → show warning
 * - R4: Stale member list → refetch on reconnect
 * - R6: User kicked while sidebar open → close sidebar + navigate away
 */
import { useState, useCallback, useEffect } from 'react';
import { Collapse, Modal, Spin, Result, message } from 'antd';
import {
      RightOutlined,
      ClockCircleOutlined,
      ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { ConversationUI } from '@/types/api';
import {
      useConversationMembers,
      useInvalidateConversations,
} from '@/features/conversation/hooks/use-conversation-queries';
import { useConversationSocket } from '@/features/conversation/hooks/use-conversation-socket';
import { GroupProfileHeader } from '@/features/conversation/components/group-info/group-profile-header';
import { GroupMembersSection } from '@/features/conversation/components/group-info/group-members-section';
import { GroupSettingsSection } from '@/features/conversation/components/group-info/group-settings-section';
import { GroupDangerZone } from '@/features/conversation/components/group-info/group-danger-zone';
import { GroupJoinRequests } from '@/features/conversation/components/group-info/group-join-requests';
import { AddMembersModal } from '@/features/conversation/components/add-members-modal';
import { TransferAdminModal } from '@/features/conversation/components/transfer-admin-modal';
import { useSocket } from '@/hooks/use-socket';

interface GroupInfoContentProps {
      conversation: ConversationUI;
      conversationId: string;
      currentUserId: string;
      onClose: () => void;
      /** Called when user leaves/is kicked from group, to navigate away */
      onLeaveGroup?: () => void;
}

export function GroupInfoContent({
      conversation,
      conversationId,
      currentUserId,
      onClose,
      onLeaveGroup,
}: GroupInfoContentProps) {
      const [showAddMembers, setShowAddMembers] = useState(false);
      const [showTransferAdmin, setShowTransferAdmin] = useState(false);
      const [joinRequestRefreshTrigger, setJoinRequestRefreshTrigger] = useState(0);

      const { connectionNonce } = useSocket();
      const { invalidateMembers, invalidateDetail, invalidateAll } =
            useInvalidateConversations();

      // Fetch members with role
      const membersQuery = useConversationMembers(conversationId);
      const members = membersQuery.data ?? [];
      const isLoadingMembers = membersQuery.isLoading;

      // Determine current user's role
      const currentMember = members.find((m) => m.id === currentUserId);
      const isAdmin = currentMember?.role === 'ADMIN';

      // R4: Refetch members on socket reconnect
      useEffect(() => {
            if (connectionNonce > 0) {
                  invalidateMembers(conversationId);
                  invalidateDetail(conversationId);
            }
            // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [connectionNonce]);

      // Socket emitters
      const {
            updateGroup,
            leaveGroup,
            addMembers,
            removeMember,
            transferAdmin,
            dissolveGroup,
            getPendingRequests,
            reviewJoinRequest,
            inviteMembers,
      } = useConversationSocket({
            // R6: Handle being removed
            onGroupYouWereRemoved: useCallback(
                  (data: { conversationId: string }) => {
                        if (data.conversationId === conversationId) {
                              // Notification handled by use-group-notifications
                              onClose();
                              onLeaveGroup?.();
                        }
                  },
                  [conversationId, onClose, onLeaveGroup],
            ),
            onGroupDissolved: useCallback(
                  (data: { conversationId: string }) => {
                        if (data.conversationId === conversationId) {
                              // Notification handled by use-group-notifications
                              onClose();
                              onLeaveGroup?.();
                        }
                  },
                  [conversationId, onClose, onLeaveGroup],
            ),
            // Realtime member updates → invalidate queries
            onGroupMembersAdded: useCallback(
                  (data: { conversationId: string }) => {
                        if (data.conversationId === conversationId) {
                              invalidateMembers(conversationId);
                        }
                  },
                  [conversationId, invalidateMembers],
            ),
            onGroupMemberRemoved: useCallback(
                  (data: { conversationId: string }) => {
                        if (data.conversationId === conversationId) {
                              invalidateMembers(conversationId);
                        }
                  },
                  [conversationId, invalidateMembers],
            ),
            onGroupMemberLeft: useCallback(
                  (data: { conversationId: string }) => {
                        if (data.conversationId === conversationId) {
                              invalidateMembers(conversationId);
                        }
                  },
                  [conversationId, invalidateMembers],
            ),
            onGroupUpdated: useCallback(
                  (data: { conversationId: string }) => {
                        if (data.conversationId === conversationId) {
                              invalidateDetail(conversationId);
                        }
                  },
                  [conversationId, invalidateDetail],
            ),
            onGroupMemberJoined: useCallback(
                  (data: { conversationId: string }) => {
                        if (data.conversationId === conversationId) {
                              invalidateMembers(conversationId);
                        }
                  },
                  [conversationId, invalidateMembers],
            ),
            // D.1: Admin transferred → refresh roles
            onGroupAdminTransferred: useCallback(
                  (data: { conversationId: string }) => {
                        if (data.conversationId === conversationId) {
                              invalidateMembers(conversationId);
                              invalidateDetail(conversationId);
                        }
                  },
                  [conversationId, invalidateMembers, invalidateDetail],
            ),
            // D.1: New join request arrived → bump refresh trigger
            onGroupJoinRequestReceived: useCallback(
                  (data: { conversationId: string }) => {
                        if (data.conversationId === conversationId) {
                              setJoinRequestRefreshTrigger((n) => n + 1);
                        }
                  },
                  [conversationId],
            ),
      });

      // === ACTION HANDLERS ===

      const handleUpdateName = async (name: string) => {
            await updateGroup(conversationId, { name });
            invalidateDetail(conversationId);
      };

      const handleAddMembers = async (userIds: string[]) => {
            // If non-admin and group requires approval → invite via GroupJoinRequest
            if (!isAdmin && conversation.requireApproval) {
                  try {
                        await inviteMembers(conversationId, userIds);
                        // Notification handled by use-group-notifications
                  } catch {
                        // Error notification handled by use-group-notifications
                  }
                  return;
            }
            await addMembers(conversationId, userIds);
            invalidateMembers(conversationId);
      };

      const handleRemoveMember = (userId: string) => {
            const member = members.find((m) => m.id === userId);
            Modal.confirm({
                  title: 'Xóa thành viên',
                  icon: <ExclamationCircleOutlined />,
                  content: `Bạn có chắc chắn muốn xóa "${member?.displayName ?? 'thành viên này'}" khỏi nhóm?`,
                  okText: 'Xóa',
                  okType: 'danger',
                  cancelText: 'Hủy',
                  onOk: async () => {
                        try {
                              await removeMember(conversationId, userId);
                              invalidateMembers(conversationId);
                              // Notification handled by use-group-notifications
                        } catch {
                              // Error notification handled by use-group-notifications
                        }
                  },
            });
      };

      const handleTransferAdminFromMember = (_userId: string) => {
            setShowTransferAdmin(true);
      };

      const handleTransferAdmin = async (newAdminId: string) => {
            await transferAdmin(conversationId, newAdminId);
            invalidateMembers(conversationId);
            invalidateDetail(conversationId);
      };

      const handleToggleApproval = async (value: boolean) => {
            await updateGroup(conversationId, { requireApproval: value });
            invalidateDetail(conversationId);
      };

      const handleDissolveGroup = async () => {
            try {
                  await dissolveGroup(conversationId);
                  onClose();
                  onLeaveGroup?.();
                  void invalidateAll();
            } catch {
                  // Error notification handled by use-group-notifications
            }
      };

      const handleLeaveGroup = async () => {
            await leaveGroup(conversationId);
            // Clear selection and close sidebar FIRST to prevent stale API calls,
            // then invalidate queries in the background
            onClose();
            onLeaveGroup?.();
            void invalidateAll();
      };

      // Shared media collapse items
      const mediaItems = [
            {
                  key: '1',
                  label: <span className="font-medium">Ảnh/Video</span>,
                  children: (
                        <div className="text-gray-500 text-center py-2 text-xs">
                              Chưa có Ảnh/Video được chia sẻ
                        </div>
                  ),
            },
            {
                  key: '2',
                  label: <span className="font-medium">File</span>,
                  children: (
                        <div className="text-gray-500 text-center py-2 text-xs">
                              Chưa có File được chia sẻ
                        </div>
                  ),
            },
            {
                  key: '3',
                  label: <span className="font-medium">Link</span>,
                  children: (
                        <div className="text-gray-500 text-center py-2 text-xs">
                              Chưa có Link được chia sẻ
                        </div>
                  ),
            },
      ];

      // D.4: Loading state
      if (isLoadingMembers && members.length === 0) {
            return (
                  <div className="flex items-center justify-center h-full">
                        <Spin tip="Đang tải thông tin nhóm..." />
                  </div>
            );
      }

      // D.4: Error state
      if (membersQuery.isError) {
            return (
                  <Result
                        status="error"
                        title="Không thể tải thông tin nhóm"
                        subTitle="Vui lòng thử lại sau"
                  />
            );
      }

      return (
            <>
                  {/* Profile Header */}
                  <GroupProfileHeader
                        conversation={conversation}
                        isAdmin={isAdmin}
                        onUpdateName={handleUpdateName}
                        onAddMembers={() => setShowAddMembers(true)}
                  />

                  {/* Scrollable Content */}
                  <div className="flex-1 overflow-y-auto">
                        {/* Reminder List */}
                        <div className="p-4 flex items-center gap-3 cursor-pointer hover:bg-gray-50 border-b border-[#f4f5f7] border-b-[6px]">
                              <ClockCircleOutlined className="text-gray-500 text-lg" />
                              <span className="text-sm font-medium text-gray-600">
                                    Danh sách nhắc hẹn
                              </span>
                        </div>

                        {/* Members Section */}
                        <GroupMembersSection
                              members={members}
                              isLoading={isLoadingMembers}
                              currentUserId={currentUserId}
                              viewerIsAdmin={isAdmin}
                              onRemoveMember={handleRemoveMember}
                              onTransferAdmin={handleTransferAdminFromMember}
                        />

                        {/* Media Collapse */}
                        <div className="border-b border-[#f4f5f7] border-b-[6px]">
                              <Collapse
                                    ghost
                                    expandIconPosition="end"
                                    expandIcon={({ isActive }) => (
                                          <RightOutlined
                                                rotate={isActive ? 90 : 0}
                                                className="text-xs text-gray-400"
                                          />
                                    )}
                                    items={mediaItems}
                                    className="site-collapse-custom-collapse"
                              />
                        </div>

                        {/* Join Requests (admin only, when approval required) */}
                        <GroupJoinRequests
                              isAdmin={isAdmin}
                              conversationId={conversationId}
                              requireApproval={conversation.requireApproval ?? false}
                              getPendingRequests={getPendingRequests}
                              reviewJoinRequest={reviewJoinRequest}
                              refreshTrigger={joinRequestRefreshTrigger}
                        />

                        {/* Admin Settings (only visible to admin) */}
                        <GroupSettingsSection
                              isAdmin={isAdmin}
                              requireApproval={conversation.requireApproval ?? false}
                              onToggleApproval={handleToggleApproval}
                              onTransferAdmin={() => setShowTransferAdmin(true)}
                              onDissolveGroup={handleDissolveGroup}
                        />

                        {/* Danger Zone */}
                        <GroupDangerZone
                              isAdmin={isAdmin}
                              memberCount={members.length}
                              onLeaveGroup={handleLeaveGroup}
                              onDeleteHistory={() => {
                                    message.info('Chức năng đang phát triển');
                              }}
                        />
                  </div>

                  {/* Modals */}
                  <AddMembersModal
                        open={showAddMembers}
                        conversationId={conversationId}
                        existingMemberIds={members.map((m) => m.id)}
                        onClose={() => setShowAddMembers(false)}
                        onAdd={handleAddMembers}
                  />

                  <TransferAdminModal
                        open={showTransferAdmin}
                        members={members}
                        currentUserId={currentUserId}
                        onClose={() => setShowTransferAdmin(false)}
                        onTransfer={handleTransferAdmin}
                  />
            </>
      );
}
