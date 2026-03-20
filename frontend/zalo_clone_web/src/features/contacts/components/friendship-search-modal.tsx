import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Input, Button, Alert, Spin, notification } from 'antd';
import { ApiError } from '@/lib/api-error';
import {
      SearchOutlined,
      MessageOutlined,
      UserAddOutlined,
      ClockCircleOutlined,
      StopOutlined,
} from '@ant-design/icons';
import { useSearch } from '@/features/search/hooks/use-search';
import { UserInfoView } from '@/features/profile/components/user-info-view';
import { conversationService } from '@/features/conversation';
import { useSendFriendRequest, useCancelRequest, useAcceptRequest } from '../api/friendship.api';

import type { ContactSearchResult } from '@/features/search/types';
import type { User } from '@/types/api';
import { FriendRequestModal } from './friend-request-modal';
import { useTranslation } from 'react-i18next';

interface FriendshipSearchModalProps {

      open: boolean;
      onClose: () => void;
      onNavigateToConversation: (conversationId: string) => void;
}

const PHONE_PATTERN = /^(0\d{9}|\+84\d{9})$/;

export function FriendshipSearchModal({
      open,
      onClose,
      onNavigateToConversation,
}: FriendshipSearchModalProps) {
      const { t } = useTranslation();
      const {
            keyword,
            results,
            status,
            errorMessage,
            handleKeywordChange,
            triggerSearch,
            resetSearch,
            setSearchType,
      } = useSearch({ autoSubscribe: false, store: 'friend' });

      const [phoneInput, setPhoneInput] = useState('');
      const [validationError, setValidationError] = useState<string | null>(null);
      const [isActionLoading, setIsActionLoading] = useState(false);

      const [showFriendRequestModal, setShowFriendRequestModal] = useState(false);

      // Mutation hooks for direct actions (Bug 7: no extra modal)
      const sendRequest = useSendFriendRequest({
            meta: { skipGlobalError: true },
      });
      const cancelReq = useCancelRequest();
      const acceptReq = useAcceptRequest();


      useEffect(() => {
            setSearchType('CONTACT');
      }, [setSearchType]);

      useEffect(() => {
            if (!open) {
                  setPhoneInput('');
                  setValidationError(null);
                  resetSearch();
                  setShowFriendRequestModal(false);
            }
      }, [open, resetSearch]);

      const normalizedInput = useMemo(() => phoneInput.replace(/\s+/g, ''), [phoneInput]);

      const contactRaw = (results?.contacts?.[0] as ContactSearchResult | undefined) ?? undefined;

      const contact = contactRaw;




      useEffect(() => {
            if (!showFriendRequestModal && contact && normalizedInput) {
                  triggerSearch(normalizedInput);
            }
      }, [showFriendRequestModal, contact, normalizedInput, triggerSearch]);

      const handleSearch = useCallback(() => {
            if (!normalizedInput) {
                  setValidationError(t('contacts.search.invalidEmpty'));
                  resetSearch();
                  return;
            }

            if (!PHONE_PATTERN.test(normalizedInput)) {
                  setValidationError(t('contacts.search.invalidFormat'));
                  resetSearch();
                  return;
            }

            setValidationError(null);
            handleKeywordChange(normalizedInput);
            triggerSearch(normalizedInput);
      }, [handleKeywordChange, normalizedInput, resetSearch, triggerSearch]);

      const isPrivacyLimited = contact?.isPrivacyLimited ?? false;

      // Bug 7 fix: Only show alias for friends; strangers always see original name
      const effectiveDisplayName = contact?.relationshipStatus === 'FRIEND'
            ? (contact.displayNameFinal || contact.displayName)
            : contact?.displayName ?? '';

      const mappedUser: (Partial<User> & { displayName: string }) | null = contact
            ? {
                  id: contact.id,
                  displayName: effectiveDisplayName,
                  avatarUrl: contact.avatarUrl,
                  phoneNumber: contact.phoneNumber,
            }
            : null;

      const executeNavigation = useCallback(async () => {
            if (!contact) return;
            if (isActionLoading) return;
            setIsActionLoading(true);
            try {
                  const conversationId = contact.existingConversationId
                        ? contact.existingConversationId
                        : (await conversationService.getOrCreateDirectConversation(contact.id)).id;
                  onNavigateToConversation(conversationId);
                  onClose();
            } finally {
                  setIsActionLoading(false);
            }
      }, [contact, isActionLoading, onClose, onNavigateToConversation]);

      const handleMessageClick = useCallback(() => {
            if (!contact) return;

            // Nếu đã là bạn bè -> Chắc chắn nhắn được
            if (contact.relationshipStatus === 'FRIEND') {
                  executeNavigation();
                  return;
            }

            // Nếu đã có request hoặc blocked -> Không mở modal
            if (contact.relationshipStatus === 'REQUEST' || contact.relationshipStatus === 'BLOCKED') {
                  return;
            }

            // Nếu chưa là bạn bè và privacy chặn -> Mở modal gợi ý kết bạn
            if (contact.canMessage === false) {
                  setShowFriendRequestModal(true);
            } else {
                  // Privacy cho phép (EVERYONE) -> Nhắn tin bình thường
                  executeNavigation();
            }
      }, [contact, executeNavigation]);

      // Bug 7: Send friend request directly — no extra FriendRequestModal
      const handleSendFriendRequest = useCallback(() => {
            if (!contact) return;
            sendRequest.mutate(contact.id, {
                  onSuccess: () => {
                        notification.success({
                              message: t('contacts.search.sentSuccess'),
                              description: t('contacts.search.sentDesc', { name: effectiveDisplayName }),
                        });
                        // Re-search to refresh relationship status
                        triggerSearch(normalizedInput);
                        onClose();
                  },
                  onError: (error: unknown) => {
                        // Bug 1: Handle 409 Conflict (duplicate request)
                        const apiErr = ApiError.from(error);
                        if (apiErr.status === 409) {
                              notification.warning({
                                    message: t('contacts.search.duplicateTitle'),
                                    description: apiErr.message || t('contacts.search.duplicateDesc'),
                              });
                              // Re-search to update status
                              triggerSearch(normalizedInput);
                              onClose();
                        } else {
                              const msg = apiErr.message || t('contacts.search.cannotSend');
                              notification.error({ message: msg });
                        }
                  },
            });
      }, [contact, sendRequest, triggerSearch, normalizedInput]);

      const handleCancelRequest = useCallback(() => {
            if (!contact) return;
            if (!contact.pendingRequestId) {
                  notification.warning({ message: t('contacts.search.missingId') });
                  return;
            }
            cancelReq.mutate(contact.pendingRequestId, {
                  onSuccess: () => {
                        notification.success({ message: t('contacts.search.recallSuccess') });
                        triggerSearch(normalizedInput);
                        onClose();
                  },
            });
      }, [contact, cancelReq, triggerSearch, normalizedInput]);

      const handleAcceptRequest = useCallback(() => {
            if (!contact) return;
            if (!contact.pendingRequestId) {
                  notification.warning({ message: t('contacts.search.missingAcceptId') });
                  return;
            }
            acceptReq.mutate(contact.pendingRequestId, {
                  onSuccess: () => {
                        notification.success({ message: t('contacts.search.acceptSuccess') });
                        triggerSearch(normalizedInput);
                        onClose();
                  },
            });
      }, [acceptReq, contact, triggerSearch, normalizedInput]);

      const isMutating = sendRequest.isPending || cancelReq.isPending || acceptReq.isPending;

      // Build footer actions based on relationship status (Bug 1 + Bug 5 + FE-8)
      // Footer Actions Render Logic
      const renderFooterActions = () => {
            if (!contact) return null;

            if (contact.relationshipStatus === 'BLOCKED') {
                  return (
                        <div className="flex gap-2 p-3">
                              <Button block disabled icon={<StopOutlined />}>
                                    {t('contacts.search.blocked')}
                              </Button>
                        </div>
                  );
            }

            // Nút nhắn tin (Luôn hiện, trừ khi block)
            // Logic hành vi nằm trong handleMessageClick
            const messageButton = (
                  <Button
                        key="msg-btn"
                        className="flex-1"
                        icon={<MessageOutlined />}
                        loading={isActionLoading}
                        onClick={handleMessageClick}
                  >
                        {t('contacts.search.message')}
                  </Button>
            );

            // Nút hành động thứ 2 (Tùy ngữ cảnh quan hệ)
            let actionButton = null;

            if (contact.relationshipStatus === 'FRIEND') {
                  // Đã là bạn: Chỉ cần nút Nhắn tin là chính (Button 2 có thể ẩn hoặc để Disabled text 'Đã là bạn')
                  // Hoặc để messageButton full width. Ở đây giữ cấu trúc 2 nút, nút 2 disabled để báo trạng thái.
                  actionButton = (
                        <Button key="status-friend" className="flex-1" disabled type="text">
                              {t('contacts.search.alreadyFriend')}
                        </Button>
                  );
            } else if (contact.relationshipStatus === 'REQUEST') {
                  if (contact.requestDirection === 'OUTGOING') {
                        actionButton = (
                              <Button
                                    key="cancel-req"
                                    className="flex-1"
                                    icon={<ClockCircleOutlined />}
                                    loading={cancelReq.isPending}
                                    onClick={handleCancelRequest}
                              >
                                    {t('contacts.search.recallRequest')}
                              </Button>
                        );
                  } else {
                        actionButton = (
                              <Button
                                    key="accept-req"
                                    type="primary"
                                    className="flex-1"
                                    icon={<UserAddOutlined />}
                                    loading={acceptReq.isPending}
                                    disabled={isMutating}
                                    onClick={handleAcceptRequest}
                              >
                                    {t('contacts.search.accept')}
                              </Button>
                        );
                  }
            } else {
                  // Chưa là bạn (NONE): Nút Kết bạn
                  actionButton = (
                        <Button
                              key="add-friend"
                              type="primary"
                              className="flex-1"
                              icon={<UserAddOutlined />}
                              loading={sendRequest.isPending}
                              disabled={isMutating}
                              onClick={handleSendFriendRequest}
                        >
                              {t('contacts.search.addFriend')}
                        </Button>
                  );
            }

            return (
                  <div className="flex gap-2 p-3 w-full">
                        {messageButton}
                        {actionButton}
                  </div>
            );
      };
      return (
            <>
                  <Modal
                        open={open}
                        onCancel={onClose}
                        footer={null}
                        centered
                        width={420}
                        title={t('contacts.search.modalTitle')}
                  >
                        <div className="flex flex-col gap-4">
                              <div className="flex gap-2">
                                    <Input
                                          value={phoneInput}
                                          onChange={(e) => setPhoneInput(e.target.value)}
                                          placeholder={t('contacts.search.phonePlaceholder')}
                                          prefix={<SearchOutlined className="text-gray-400" />}
                                          onPressEnter={handleSearch}
                                    />
                                    <Button type="primary" onClick={handleSearch}>
                                          {t('contacts.search.searchBtn')}
                                    </Button>
                              </div>

                              {validationError ? (
                                    <Alert type="error" showIcon message={validationError} />
                              ) : null}

                              {status === 'loading' ? (
                                    <div className="flex justify-center py-6">
                                          <Spin />
                                    </div>
                              ) : null}

                              {errorMessage && status === 'error' ? (
                                    <Alert type="error" showIcon message={errorMessage} />
                              ) : null}

                              {mappedUser && status === 'success' ? (
                                    <div className="border rounded-lg overflow-hidden">
                                          <UserInfoView
                                                user={mappedUser}
                                                showEdit={false}
                                                showSensitive={isPrivacyLimited}
                                                actions={renderFooterActions()}
                                                showAvatarActions={false}
                                          />
                                    </div>
                              ) : null}

                              {status === 'success' && !mappedUser && keyword.trim() ? (
                                    <div className="text-sm text-gray-500 text-center py-4">
                                          {t('contacts.search.notFound')}
                                    </div>
                              ) : null}
                        </div>
                  </Modal>
                  {/* Modal phụ: Chỉ hiện khi bấm Nhắn tin mà bị chặn Privacy */}
                  {contact && (
                        <FriendRequestModal
                              visible={showFriendRequestModal}
                              onClose={() => setShowFriendRequestModal(false)}
                              onAfterSend={() => triggerSearch(normalizedInput)}
                              target={{
                                    userId: contact.id,
                                    displayName: effectiveDisplayName,
                                    avatarUrl: contact.avatarUrl,
                              }}
                        />
                  )}
            </>
      );

}
