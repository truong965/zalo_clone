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
import {
      Collapse, Modal, Spin, Result, Button, notification,
} from 'antd';
import {
      RightOutlined,
      ClockCircleOutlined,
      ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { ConversationUI } from '@/types/api';
import apiClient from '@/lib/axios';
import { API_ENDPOINTS } from '@/constants/api-endpoints';
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
import { useReminders, ReminderList, CreateReminderModal } from '@/features/reminder';
import { useConversationRecentMedia } from '@/features/chat/hooks/use-conversation-recent-media';
import { MediaThumbnail } from '@/features/chat/components/media-thumbnail';
import { MediaPreviewModal } from '@/features/chat/components/media-preview-modal';
import { FileDocumentItem } from '../file-document-item';
import type { MediaBrowserTab } from '@/features/chat/stores/chat.store';
import { useTranslation } from 'react-i18next';

interface GroupInfoContentProps {
      conversation: ConversationUI;
      conversationId: string;
      currentUserId: string;
      onTogglePin: (conversationId: string, currentlyPinned: boolean) => void;
      onToggleMute: (conversationId: string, currentlyMuted: boolean) => void;
      onToggleArchive: (conversationId: string, currentlyArchived: boolean) => void;
      onCloseSidebar: () => void;
      /** Called when user leaves/is kicked from group, to navigate away */
      onLeaveGroup?: () => void;
      /** Called when user clicks "Xem tất cả" to open media browser */
      onOpenMediaBrowser?: (tab: MediaBrowserTab) => void;
}

export function GroupInfoContent({
      conversation,
      conversationId,
      currentUserId,
      onTogglePin,
      onToggleMute,
      onToggleArchive,
      onCloseSidebar,
      onLeaveGroup,
      onOpenMediaBrowser,
}: GroupInfoContentProps) {
      const { t } = useTranslation();
      const [showAddMembers, setShowAddMembers] = useState(false);
      const [showTransferAdmin, setShowTransferAdmin] = useState(false);

      const { connectionNonce } = useSocket();
      const { invalidateMembers, invalidateDetail, invalidateAll } =
            useInvalidateConversations();
      const { reminders, isLoading: isLoadingReminders, completeReminder, deleteReminder, createReminder, isCreating: isReminderCreating } = useReminders(conversationId);
      const [showReminders, setShowReminders] = useState(false);
      const [showCreateReminder, setShowCreateReminder] = useState(false);

      const [previewItems, setPreviewItems] = useState<any[]>([]);
      const [previewIndex, setPreviewIndex] = useState(-1);

      // async-parallel: two independent queries run in parallel
      const { data: recentMedia } = useConversationRecentMedia(conversationId, ['IMAGE', 'VIDEO'], 3);
      const { data: recentFiles } = useConversationRecentMedia(conversationId, ['FILE'], 3);

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
                              onCloseSidebar();
                              onLeaveGroup?.();
                              void invalidateAll();
                        }
                  },
                  [conversationId, invalidateAll, onCloseSidebar, onLeaveGroup],
            ),
            onGroupDissolved: useCallback(
                  (data: { conversationId: string }) => {
                        if (data.conversationId === conversationId) {
                              onCloseSidebar();
                              onLeaveGroup?.();
                              void invalidateAll();
                        }
                  },
                  [conversationId, invalidateAll, onCloseSidebar, onLeaveGroup],
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
                  (data: { conversationId: string; memberId: string }) => {
                        if (data.conversationId === conversationId) {
                              if (data.memberId === currentUserId) {
                                    onCloseSidebar();
                                    onLeaveGroup?.();
                                    void invalidateAll();
                              } else {
                                    invalidateMembers(conversationId);
                              }
                        }
                  },
                  [conversationId, currentUserId, invalidateAll, invalidateMembers, onCloseSidebar, onLeaveGroup],
            ),
            onGroupUpdated: useCallback(
                  (data: { conversationId: string }) => {
                        if (data.conversationId === conversationId) {
                              invalidateDetail(conversationId);
                        }
                  },
                  [conversationId, invalidateDetail],
            ),
            onConversationPinned: useCallback(
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
            onConversationUnpinned: useCallback(
                  (data: { conversationId: string }) => {
                        if (data.conversationId === conversationId) {
                              invalidateDetail(conversationId);
                        }
                  },
                  [conversationId, invalidateDetail],
            ),
            onConversationMuted: useCallback(
                  (data: { conversationId: string }) => {
                        if (data.conversationId === conversationId) {
                              invalidateDetail(conversationId);
                        }
                  },
                  [conversationId, invalidateDetail],
            ),
            onConversationUpdated: useCallback(
                  (data: any) => {
                        const cid = data.conversationId || data.id;
                        if (cid === conversationId) {
                              invalidateDetail(conversationId);
                        }
                  },
                  [conversationId, invalidateDetail],
            ),
      });

      // === ACTION HANDLERS ===

      const handleUpdateName = async (name: string) => {
            await updateGroup(conversationId, { name });
            invalidateDetail(conversationId);
      };

      async function uploadGroupAvatarFile(file: File): Promise<string> {
            const { data: initRes } = await apiClient.post(API_ENDPOINTS.MEDIA.UPLOAD_AVATAR, {
                  fileName: file.name,
                  mimeType: file.type,
                  fileSize: file.size,
            });

            const { presignedUrl, fileUrl } = initRes.data;

            const uploadRes = await fetch(presignedUrl, {
                  method: 'PUT',
                  body: file,
                  headers: { 'Content-Type': file.type },
            });

            if (!uploadRes.ok) {
                  throw new Error(`Upload failed: ${uploadRes.status}`);
            }

            return fileUrl;
      }

      const handleUpdateGroupAvatar = useCallback(async (file: File) => {
            try {
                  const avatarUrl = await uploadGroupAvatarFile(file);
                  await updateGroup(conversationId, { avatarUrl: avatarUrl });
                  invalidateDetail(conversationId);
                  notification.success({ message: 'Cập nhật ảnh đại diện nhóm thành công' });
            } catch (error: any) {
                  // Only show manual error if not a socket rejection (already handled globally)
                  if (error.name !== 'Error' || !error.message.includes('socket')) {
                        notification.error({ message: error.message || 'Không thể tải ảnh lên' });
                  }
            }
      }, [conversationId, invalidateDetail, updateGroup]);

      const handleAddMembers = async (userIds: string[]) => {
            // If non-admin and group requires approval → invite via GroupJoinRequest
            if (!isAdmin && conversation.requireApproval) {
                  await inviteMembers(conversationId, userIds);
                  return;
            }
            await addMembers(conversationId, userIds);
            invalidateMembers(conversationId);
      };

      const handleRemoveMember = (userId: string) => {
            const member = members.find((m) => m.id === userId);
            Modal.confirm({
                  title: t('chat.infoSidebar.removeMemberTitle'),
                  icon: <ExclamationCircleOutlined />,
                  content: t('chat.infoSidebar.removeMemberConfirm', { name: member?.displayName ?? 'thành viên này' }),
                  okText: t('chat.infoSidebar.remove'),
                  okType: 'danger',
                  cancelText: t('chat.infoSidebar.blockConfirmCancel'),
                  onOk: () => removeMember(conversationId, userId).then(() => {
                        invalidateMembers(conversationId);
                  }).catch(() => { }), // catch error to close modal even if notify error occurred
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
            } finally {
                  // Always close even if it failed, as user clicked dissolve and error is already notified
                  onCloseSidebar();
                  onLeaveGroup?.();
                  void invalidateAll();
            }
      };

      const handleLeaveGroup = async () => {
            try {
                  await leaveGroup(conversationId);
            } finally {
                  // Clear selection and close sidebar even on failure (error notified by socket manager)
                  onCloseSidebar();
                  onLeaveGroup?.();
                  void invalidateAll();
            }
      };

      // Shared media collapse items
      const mediaItems = [
            {
                  key: '1',
                  label: <span className="font-medium">{t('chat.infoSidebar.media')}</span>,
                  children: (
                        <>
                              {!recentMedia?.length ? (
                                    <div className="text-gray-500 text-center py-2 text-xs">
                                          {t('chat.infoSidebar.noMedia')}
                                    </div>
                              ) : (
                                    <>
                                          <div className="grid grid-cols-3 gap-1">
                                                {recentMedia.map((item, idx) => (
                                                      <MediaThumbnail
                                                            key={item.mediaId}
                                                            item={item}
                                                            onClick={() => {
                                                                  setPreviewItems(recentMedia);
                                                                  setPreviewIndex(idx);
                                                            }}
                                                      />
                                                ))}
                                          </div>
                                          <Button
                                                type="link"
                                                size="small"
                                                className="w-full mt-1 text-xs"
                                                onClick={() => onOpenMediaBrowser?.('photos')}
                                          >
                                                {t('chat.infoSidebar.viewAll')}
                                          </Button>
                                    </>
                              )}
                        </>
                  ),
            },
            {
                  key: '2',
                  label: <span className="font-medium">{t('chat.infoSidebar.file')}</span>,
                  children: (
                        <>
                              {!recentFiles?.length ? (
                                    <div className="text-gray-500 text-center py-2 text-xs">
                                          {t('chat.infoSidebar.noFile')}
                                    </div>
                              ) : (
                                    <>
                                          <div className="flex flex-col">
                                                {recentFiles.map((item) => (
                                                      <FileDocumentItem
                                                            key={item.mediaId}
                                                            originalName={item.originalName}
                                                            sizeBytes={item.size}
                                                            createdAt={item.createdAt}
                                                            cdnUrl={item.cdnUrl}
                                                            mimeType={item.mimeType}
                                                      />
                                                ))}
                                          </div>
                                          <Button
                                                type="link"
                                                size="small"
                                                className="w-full mt-1 text-xs"
                                                onClick={() => onOpenMediaBrowser?.('files')}
                                          >
                                                {t('chat.infoSidebar.viewAll')}
                                          </Button>
                                    </>
                              )}
                        </>
                  ),
            },
      ];

      // D.4: Loading state
      if (isLoadingMembers && members.length === 0) {
            return (
                  <div className="flex items-center justify-center h-full">
                        <Spin tip={t('chat.infoSidebar.loadingGroupInfo')} />
                  </div>
            );
      }

      // D.4: Error state
      if (membersQuery.isError) {
            return (
                  <Result
                        status="error"
                        title={t('chat.infoSidebar.errorTitle')}
                        subTitle={t('chat.infoSidebar.errorSub')}
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
                        onUpdateAvatar={handleUpdateGroupAvatar}
                        onAddMembers={() => setShowAddMembers(true)}
                        onTogglePin={() => onTogglePin(conversation.id, !!conversation.isPinned)}
                        onToggleMute={() => onToggleMute(conversation.id, !!conversation.isMuted)}
                  />

                  {/* Scrollable Content */}
                  <div className="flex-1 overflow-y-auto">
                        {/* Reminder List */}
                        <div
                              className="p-4 flex items-center gap-3 cursor-pointer hover:bg-gray-50 border-b border-[#f4f5f7] border-b-[6px]"
                              onClick={() => setShowReminders((v) => !v)}
                        >
                              <ClockCircleOutlined className="text-gray-500 text-lg" />
                              <span className="text-sm font-medium text-gray-600 flex-1">
                                    {t('chat.infoSidebar.reminders')}
                              </span>
                              <RightOutlined
                                    rotate={showReminders ? 90 : 0}
                                    className="text-xs text-gray-400 transition-transform"
                              />
                        </div>
                        {showReminders && (
                              <div className="border-b border-[#f4f5f7] border-b-[6px]">
                                    <div className="px-3 pt-2 pb-1">
                                          <Button
                                                type="dashed"
                                                block
                                                size="small"
                                                icon={<ClockCircleOutlined />}
                                                onClick={() => setShowCreateReminder(true)}
                                          >
                                                {t('chat.infoSidebar.createReminder')}
                                          </Button>
                                    </div>
                                    <ReminderList
                                          reminders={reminders}
                                          isLoading={isLoadingReminders}
                                          onComplete={completeReminder}
                                          onDelete={deleteReminder}
                                          currentUserId={currentUserId}
                                    />
                              </div>
                        )}

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
                                    expandIconPlacement="end"
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
                              isArchived={!!conversation.isArchived}
                              memberCount={members.length}
                              onLeaveGroup={handleLeaveGroup}
                              onArchiveConversation={() => {
                                    onToggleArchive(conversationId, !!conversation.isArchived);
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

                  <CreateReminderModal
                        open={showCreateReminder}
                        onClose={() => setShowCreateReminder(false)}
                        onSubmit={createReminder}
                        conversationId={conversationId}
                        isSubmitting={isReminderCreating}
                  />

                  <MediaPreviewModal
                        isOpen={previewIndex !== -1}
                        items={previewItems ?? []}
                        initialIndex={previewIndex}
                        onClose={() => setPreviewIndex(-1)}
                  />
            </>
      );
}