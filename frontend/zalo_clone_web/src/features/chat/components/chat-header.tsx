import { useMemo, useState, useCallback, useEffect } from 'react';
import { Avatar, Button, Dropdown, Modal, Typography, Popover, Space, notification } from 'antd';
import { ApiError } from '@/lib/api-error';
import {
      SearchOutlined,
      VideoCameraOutlined,
      LayoutOutlined,
      MoreOutlined,
      EditOutlined,
      DeleteOutlined,
      PhoneOutlined,
      UserOutlined,
      TeamOutlined,
      UserAddOutlined,
      CloseOutlined,
} from '@ant-design/icons';
import {
      useContactCheck,
      AliasEditModal,
} from '@/features/contacts';
import { useCallStore } from '@/features/call/stores/call.store';
import type { CallType, PeerInfo } from '@/features/call/types';
import { conversationApi } from '@/features/conversation';
import { useAuthStore } from '@/features/auth';
import { useTranslation } from 'react-i18next';
import { useFriendRequestStatus } from '@/features/contacts/hooks/use-friend-request-status';

const { Title } = Typography;

interface ChatHeaderProps {
      conversationName: string;
      avatarUrl?: string | null;
      isDirect?: boolean;
      isOnline?: boolean;
      lastSeenAt?: string | null;
      onToggleSearch: () => void;
      onToggleInfo: () => void;
      typingText?: string | null;
      /** Present for 1-to-1 conversations; used to load contact / alias info. */
      otherUserId?: string | null;
      /** Required for call initiation — links the call log to this conversation. */
      conversationId: string;
}

export function ChatHeader({
      conversationName,
      avatarUrl,
      isDirect,
      isOnline,
      lastSeenAt,
      onToggleSearch,
      onToggleInfo,
      typingText,
      otherUserId,
      conversationId,
}: ChatHeaderProps) {
      const [aliasModalOpen, setAliasModalOpen] = useState(false);
      const [callLoading, setCallLoading] = useState(false);
      const [callModalOpen, setCallModalOpen] = useState(false);
      const [popoverOpen, setPopoverOpen] = useState(false);
      const user = useAuthStore((s) => s.user);
      const { t } = useTranslation();

      const {
            isLoading,
            isFriend,
            pendingRequestDirection,
            sentRequest,
            receivedRequest,
            sendRequest,
            acceptRequest,
            declineRequest,
            cancelRequest,
            isSendingRequest,
            isAcceptingRequest,
            isDecliningRequest,
            isCancellingRequest,
      } = useFriendRequestStatus(isDirect ? otherUserId ?? null : null);

      // Only enabled for 1-to-1 conversations
      const { data: contactInfo } = useContactCheck(isDirect ? otherUserId : null);
      const getPresenceInfo = (iso: string): { text: string; isRecent: boolean } => {
            const date = new Date(iso);
            const now = new Date();
            const diffMs = now.getTime() - date.getTime();
            const diffMins = Math.floor(diffMs / 60000);

            if (diffMins < 1) return { text: t('chat.header.accessJustNow'), isRecent: true };
            if (diffMins < 60) return { text: t('chat.header.accessMinsAgo', { count: diffMins }), isRecent: true };
            return { text: t('chat.header.offline'), isRecent: false };
      };

      const presenceInfo = (() => {
            if (!isDirect) return null;
            if (isOnline) return { text: t('chat.header.online'), isRecent: true };
            if (lastSeenAt) return getPresenceInfo(lastSeenAt);
            return { text: t('chat.header.offline'), isRecent: false };
      })();

      // Build the "More" dropdown menu — memoised to avoid per-render object allocation.
      const moreMenuItems = useMemo(() => {
            if (!isDirect || !otherUserId) return [];
            return [
                  {
                        key: 'set-alias',
                        label: contactInfo?.aliasName ? t('chat.header.editAlias') : t('chat.header.setAlias'),
                        icon: <EditOutlined />,
                        onClick: () => setAliasModalOpen(true),
                  },
                  ...(contactInfo?.aliasName
                        ? [
                              {
                                    key: 'clear-alias',
                                    label: t('chat.header.removeAlias'),
                                    icon: <DeleteOutlined />,
                                    danger: true,
                                    onClick: () => setAliasModalOpen(true),
                              },
                        ]
                        : []),
            ];
      }, [isDirect, otherUserId, contactInfo?.aliasName]);

      // ── Unified call initiation — works for both direct and group ───────
      const initiateCall = useCallback(
            async (callType: CallType, initialCameraOff = false) => {
                  const currentStatus = useCallStore.getState().callStatus;
                  if (currentStatus !== 'IDLE') return;

                  const peerInfo: PeerInfo = {
                        displayName: conversationName,
                        avatarUrl: avatarUrl ?? null,
                  };

                  if (isDirect) {
                        if (!otherUserId) return;
                        window.dispatchEvent(
                              new CustomEvent('call:initiate', {
                                    detail: {
                                          calleeId: otherUserId,
                                          callType,
                                          peerInfo,
                                          conversationId,
                                          initialCameraOff,
                                    },
                              }),
                        );
                  } else {
                        if (!conversationId) return;
                        setCallLoading(true);
                        try {
                              const members = await conversationApi.getConversationMembers(conversationId);
                              const receiverIds = members
                                    .map((m) => m.id)
                                    .filter((id) => id !== user?.id);
                              if (receiverIds.length === 0) return;
                              window.dispatchEvent(
                                    new CustomEvent('call:initiate', {
                                          detail: {
                                                calleeId: receiverIds[0],
                                                receiverIds,
                                                callType,
                                                peerInfo,
                                                conversationId,
                                                initialCameraOff,
                                          },
                                    }),
                              );
                        } catch (err) {
                              console.error('[ChatHeader] Failed to fetch group members for call', err);
                        } finally {
                              setCallLoading(false);
                        }
                  }
            },
            [conversationId, isDirect, otherUserId, conversationName, avatarUrl, user?.id],
      );

      const showFriendAction =
            isDirect &&
            !!otherUserId &&
            !!user?.id &&
            otherUserId !== user.id &&
            !isFriend;

      const isFriendActionDisabled = isLoading;

      useEffect(() => {
            setPopoverOpen(showFriendAction ?? false);
      }, [showFriendAction]);

      const handleSendRequest = () => {
            if (!otherUserId) return;
            sendRequest.mutate(otherUserId, {
                  onSuccess: () => {
                        notification.success({
                              message: t('contacts.search.sentSuccess', 'Đã gửi lời mời kết bạn'),
                        });
                        setPopoverOpen(false);
                  },
                  onError: (error: unknown) => {
                        const apiErr = ApiError.from(error);
                        if (apiErr.status === 409) {
                              notification.warning({
                                    message: t('contacts.search.duplicateTitle', 'Lưu ý'),
                                    description: apiErr.message || t('contacts.search.duplicateDesc', 'Bạn đã là bạn bè hoặc đang có lời mời chờ xử lý'),
                              });
                        } else {
                              notification.error({
                                    message: apiErr.message || t('contacts.search.cannotSend', 'Không thể gửi kết bạn'),
                              });
                        }
                        setPopoverOpen(false);
                  },
            });
      };

      const handleCancelRequest = () => {
            if (!sentRequest) return;
            cancelRequest.mutate(sentRequest.id, {
                  onSuccess: () => {
                        notification.success({ message: t('contacts.search.recallSuccess', 'Đã thu hồi lời mời') });
                        setPopoverOpen(false);
                  },
                  onError: () => {
                        notification.error({ message: t('contacts.search.recallFail', 'Không thể thu hồi') });
                        setPopoverOpen(false);
                  },
            });
      };

      const handleAcceptRequest = () => {
            if (!receivedRequest) return;
            acceptRequest.mutate(receivedRequest.id, {
                  onSuccess: () => {
                        notification.success({ message: t('contacts.search.acceptSuccess', 'Đã chấp nhận kết bạn') });
                        setPopoverOpen(false);
                  },
                  onError: () => {
                        notification.error({ message: t('contacts.search.acceptFail', 'Không thể chấp nhận') });
                        setPopoverOpen(false);
                  },
            });
      };

      const handleDeclineRequest = () => {
            if (!receivedRequest) return;
            declineRequest.mutate(receivedRequest.id, {
                  onSuccess: () => setPopoverOpen(false),
            });
      };

      const popoverContent = (
            <div className="relative p-2" style={{ minWidth: 260 }}>
                  <CloseOutlined
                        className="absolute top-2 right-2 cursor-pointer text-gray-400 hover:text-gray-600"
                        onClick={() => setPopoverOpen(false)}
                  />
                  <div className="mb-3 text-sm pr-6">
                        {pendingRequestDirection === 'sent' ? (
                              t('chat.header.friendRequestSent', 'Đã gửi lời mời kết bạn')
                        ) : pendingRequestDirection === 'received' ? (
                              t('chat.header.friendRequestReceived', 'Đã nhận lời mời kết bạn')
                        ) : (
                              t('chat.header.addFriendSuggestion', 'Bạn có muốn kết bạn với người này không?')
                        )}
                  </div>
                  <Space className="w-full justify-center">
                        {pendingRequestDirection === 'sent' ? (
                              <Button
                                    size="small"
                                    type="primary"
                                    danger
                                    onClick={handleCancelRequest}
                                    loading={isCancellingRequest}
                              >
                                    {t('contacts.friendRequest.recall', 'Hủy')}
                              </Button>
                        ) : pendingRequestDirection === 'received' ? (
                              <>
                                    <Button
                                          size="small"
                                          onClick={handleDeclineRequest}
                                          loading={isDecliningRequest}
                                    >
                                          {t('contacts.friendRequest.decline', 'Từ chối')}
                                    </Button>
                                    <Button
                                          size="small"
                                          type="primary"
                                          onClick={handleAcceptRequest}
                                          loading={isAcceptingRequest}
                                    >
                                          {t('contacts.friendRequest.accept', 'Chấp nhận')}
                                    </Button>
                              </>
                        ) : (
                              <Button
                                    size="small"
                                    type="primary"
                                    onClick={handleSendRequest}
                                    loading={isSendingRequest}
                              >
                                    {t('common.addFriend', 'Kết bạn')}
                              </Button>
                        )}
                  </Space>
            </div>
      );

      return (
            <>
                  <div className="h-16 px-4 bg-white border-b border-gray-200 flex items-center justify-between shadow-sm z-10 flex-none">
                        <div className="flex items-center gap-3">
                              <Avatar size="large" src={avatarUrl ?? undefined} icon={isDirect ? <UserOutlined /> : <TeamOutlined />} />
                              <div>
                                    <Title level={5} className="mb-0">{conversationName}</Title>
                                    {typingText ? (
                                          <div className="flex items-center text-xs text-blue-600">
                                                {typingText}
                                          </div>
                                    ) : presenceInfo ? (
                                          <div className="flex items-center text-xs text-gray-500">
                                                <span
                                                      className={`w-2 h-2 rounded-full mr-1.5 ${presenceInfo.isRecent ? 'bg-green-500' : 'bg-gray-400'}`}
                                                ></span>
                                                {presenceInfo.text}
                                          </div>
                                    ) : null}
                              </div>
                        </div>

                        <div className="flex gap-1">
                              {showFriendAction && (
                                    <Popover
                                          content={popoverContent}
                                          open={popoverOpen}
                                          onOpenChange={setPopoverOpen}
                                          placement="bottomRight"
                                          trigger="click"
                                    >
                                          <Button
                                                icon={<UserAddOutlined />}
                                                type="text"
                                                loading={isFriendActionDisabled}
                                                className="text-gray-500 hover:bg-gray-100"
                                                title={t('chat.header.addFriendTooltip', 'Thêm bạn bè')}
                                          />
                                    </Popover>
                              )}
                              {(isDirect ? !!otherUserId : true) && (
                                    <Button
                                          icon={isDirect ? <PhoneOutlined /> : <VideoCameraOutlined />}
                                          type="text"
                                          loading={callLoading}
                                          className="text-gray-500 hover:bg-gray-100"
                                          title={isDirect ? t('chat.header.callTooltip') : t('chat.header.groupCallTooltip')}
                                          onClick={() => setCallModalOpen(true)}
                                    />
                              )}
                              <Button
                                    icon={<SearchOutlined />}
                                    type="text"
                                    className="text-gray-500 hover:bg-gray-100"
                                    onClick={onToggleSearch}
                                    title={t('chat.header.searchTooltip')}
                              />
                              <Button
                                    icon={<LayoutOutlined className="rotate-180" />}
                                    type="text"
                                    className="text-gray-500 hover:bg-gray-100"
                                    onClick={onToggleInfo}
                                    title={t('chat.header.infoTooltip')}
                              />
                              {moreMenuItems.length > 0 && (
                                    <Dropdown menu={{ items: moreMenuItems }} trigger={['click']} placement="bottomRight">
                                          <Button
                                                icon={<MoreOutlined />}
                                                type="text"
                                                className="text-gray-500 hover:bg-gray-100"
                                                title={t('chat.header.moreTooltip')}
                                          />
                                    </Dropdown>
                              )}
                        </div>
                  </div>

                  {/* ── Camera-choice modal (dùng chung cho cả direct và group call) ── */}
                  <Modal
                        open={callModalOpen}
                        title={isDirect ? t('chat.header.videoCall') : t('chat.header.groupCall')}
                        footer={null}
                        onCancel={() => setCallModalOpen(false)}
                        centered
                        width={360}
                  >
                        <p className="text-gray-600 mb-4">{t('chat.header.callCameraPref')}</p>
                        <div className="flex gap-3">
                              <Button
                                    type="primary"
                                    icon={<VideoCameraOutlined />}
                                    className="flex-1"
                                    onClick={() => {
                                          setCallModalOpen(false);
                                          void initiateCall('VIDEO', false);
                                    }}
                              >
                                    {t('chat.header.cameraOn')}
                              </Button>
                              <Button
                                    icon={<PhoneOutlined />}
                                    className="flex-1"
                                    onClick={() => {
                                          setCallModalOpen(false);
                                          void initiateCall('VIDEO', true);
                                    }}
                              >
                                    {t('chat.header.cameraOff')}
                              </Button>
                        </div>
                  </Modal>

                  {isDirect && otherUserId && (
                        <AliasEditModal
                              open={aliasModalOpen}
                              contactUserId={otherUserId}
                              contactDisplayName={conversationName}
                              currentAlias={contactInfo?.aliasName ?? null}
                              onClose={() => setAliasModalOpen(false)}
                        />
                  )}
            </>
      );
}