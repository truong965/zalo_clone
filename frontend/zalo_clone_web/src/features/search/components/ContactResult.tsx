/**
 * ContactResult — Search result card for contacts
 *
 * Hiển thị:
 * - Avatar + online indicator
 * - displayNameFinal + phone number
 * - Relationship badge (Bạn bè / Đã gửi lời mời / Người lạ)
 * - Actions: Nhắn tin / Kết bạn
 */

import { useTranslation } from 'react-i18next';
import { Avatar, Typography, Tag, Button } from 'antd';
import {
      MessageOutlined,
      UserAddOutlined,
      CheckOutlined,
      RollbackOutlined,
      UserOutlined,
} from '@ant-design/icons';
import type { ContactSearchResult } from '../types';
import { getRelationshipLabel } from '../utils/search.util';
import { useFriendRequestStatus } from '@/features/contacts/hooks/use-friend-request-status';

const { Text } = Typography;

interface ContactResultProps {
      data: ContactSearchResult;
      onClick?: (
            result: ContactSearchResult,
            effectiveStatus: 'FRIEND' | 'REQUEST' | 'NONE' | 'BLOCKED',
            effectiveDirection?: 'OUTGOING' | 'INCOMING' | null,
            effectivePendingId?: string | null,
      ) => void;
      onSendMessage?: (contactId: string) => void;
      onAddFriend?: (contactId: string) => void;
      onAcceptRequest?: (requestId: string, contactId: string) => void;
      onCancelRequest?: (requestId: string, contactId: string) => void;
}

export function ContactResult({
      data,
      onClick,
      onSendMessage,
      onAddFriend,
      onAcceptRequest,
      onCancelRequest,
}: ContactResultProps) {
      const { t } = useTranslation();
      const {
            isFriend,
            pendingRequestDirection,
            sentRequest,
            receivedRequest,
      } = useFriendRequestStatus(data.id);

      // Override relationship state with live data from TanStack Query (Synchronization Fix)
      const effectiveStatus = isFriend
            ? 'FRIEND'
            : pendingRequestDirection
                  ? 'REQUEST'
                  : data.relationshipStatus;

      const effectiveDirection = pendingRequestDirection
            ? (pendingRequestDirection === 'sent' ? 'OUTGOING' : 'INCOMING')
            : (data.requestDirection ?? null);

      const effectivePendingId = pendingRequestDirection
            ? (pendingRequestDirection === 'sent' ? sentRequest?.id : receivedRequest?.id)
            : data.pendingRequestId;

      const relationLabel = getRelationshipLabel(
            effectiveStatus,
            effectiveDirection ?? undefined,
      );

      // Bug 7 fix: Only show alias (displayNameFinal) for friends.
      // For non-friends, always show the original displayName to prevent
      // stale alias data from appearing for strangers.
      const effectiveName =
            effectiveStatus === 'FRIEND'
                  ? (data.displayNameFinal || data.displayName)
                  : data.displayName;

      const tagColor =
            effectiveStatus === 'FRIEND'
                  ? 'green'
                  : effectiveStatus === 'REQUEST'
                        ? 'orange'
                        : effectiveStatus === 'BLOCKED'
                              ? 'red'
                              : 'default';

      return (
            <div
                  className="flex items-center gap-3 px-3 py-3 cursor-pointer rounded-lg hover:bg-gray-50 transition-colors group"
                  onClick={() =>
                        onClick?.(
                              data,
                              effectiveStatus,
                              effectiveDirection ?? undefined,
                              effectivePendingId,
                        )
                  }
            >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                        <Avatar
                              size={44}
                              src={data.avatarUrl || undefined}
                              icon={<UserOutlined />}
                        />
                        {data.isOnline && (
                              <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
                        )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                              <Text strong className="truncate text-sm text-gray-800">
                                    {effectiveName}
                              </Text>
                              <Tag className="text-[10px] leading-none border-0 m-0" color={tagColor}>
                                    {relationLabel}
                              </Tag>
                        </div>
                        {data.phoneNumber ? (
                              <Text className="text-xs text-gray-400 block">
                                    {data.phoneNumber}
                              </Text>
                        ) : null}
                  </div>

                  {/* Actions — show on hover */}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        {data.canMessage !== false && (
                              <Button
                                    type="text"
                                    size="small"
                                    icon={<MessageOutlined />}
                                    className="text-blue-500"
                                    title={t('search.contactResult.sendMessage')}
                                    onClick={(e) => {
                                          e.stopPropagation();
                                          onSendMessage?.(data.id);
                                    }}
                              />
                        )}
                        {effectiveStatus === 'NONE' && (
                              <Button
                                    type="text"
                                    size="small"
                                    icon={<UserAddOutlined />}
                                    className="text-blue-500"
                                    title={t('search.contactResult.addFriend')}
                                    onClick={(e) => {
                                          e.stopPropagation();
                                          onAddFriend?.(data.id);
                                    }}
                              />
                        )}
                        {effectiveStatus === 'REQUEST' && effectiveDirection === 'OUTGOING' && effectivePendingId && (
                              <Button
                                    type="text"
                                    size="small"
                                    icon={<RollbackOutlined />}
                                    className="text-orange-500"
                                    title={t('search.contactResult.cancelRequest')}
                                    onClick={(e) => {
                                          e.stopPropagation();
                                          onCancelRequest?.(effectivePendingId, data.id);
                                    }}
                              />
                        )}
                        {effectiveStatus === 'REQUEST' && effectiveDirection === 'INCOMING' && effectivePendingId && (
                              <Button
                                    type="text"
                                    size="small"
                                    icon={<CheckOutlined />}
                                    className="text-green-600"
                                    title={t('search.contactResult.acceptRequest')}
                                    onClick={(e) => {
                                          e.stopPropagation();
                                          onAcceptRequest?.(effectivePendingId, data.id);
                                    }}
                              />
                        )}
                  </div>
            </div>
      );
}
