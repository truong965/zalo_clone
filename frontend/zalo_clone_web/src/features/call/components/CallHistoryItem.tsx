/**
 * CallHistoryItem — Single row in the call history list.
 *
 * Displays: avatar (or avatar stack for group), name, direction icon,
 * status/duration, timestamp, callback button.
 * Vietnamese labels for call status.
 *
 * Composition: explicit variant (1v1 vs group) rather than boolean props.
 */

import { useMemo, useCallback } from 'react';
import { Avatar, Button, Tooltip, Typography } from 'antd';
import {
      PhoneOutlined,
      VideoCameraOutlined,
      ArrowUpOutlined,
      ArrowDownOutlined,
      CloseOutlined,
      TeamOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import type { CallHistoryRecord, CallParticipantRecord, CallType } from '../types';

const { Text } = Typography;

/** Max avatars to show in the group avatar stack before "+N" */
const MAX_GROUP_AVATARS = 3;

// ============================================================================
// HELPERS
// ============================================================================

function formatDuration(seconds: number | null): string {
      if (!seconds || seconds <= 0) return '';
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      if (mins === 0) return `${secs}s`;
      return `${mins}m ${secs}s`;
}

function formatTimestamp(iso: string): string {
      const date = new Date(iso);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60_000);

      if (diffMins < 1) return 'Vừa xong';
      if (diffMins < 60) return `${diffMins} phút trước`;

      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours} giờ trước`;

      const diffDays = Math.floor(diffHours / 24);
      if (diffDays < 7) return `${diffDays} ngày trước`;

      return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

type CallDirection = 'outgoing' | 'incoming';

function getStatusLabel(status: CallHistoryRecord['status'], direction: CallDirection): string {
      switch (status) {
            case 'COMPLETED':
                  return direction === 'outgoing' ? 'Gọi đi' : 'Gọi đến';
            case 'MISSED':
                  return 'Cuộc gọi nhỡ';
            case 'REJECTED':
                  return direction === 'outgoing' ? 'Bị từ chối' : 'Đã từ chối';
            case 'CANCELLED':
                  return 'Đã huỷ';
            case 'NO_ANSWER':
                  return 'Không trả lời';
            case 'FAILED':
                  return 'Thất bại';
            default:
                  return '';
      }
}

function getStatusColor(status: CallHistoryRecord['status']): string {
      switch (status) {
            case 'COMPLETED':
                  return 'text-gray-500';
            case 'MISSED':
                  return 'text-red-500 font-medium';
            case 'REJECTED':
                  return 'text-orange-500';
            case 'CANCELLED':
            case 'NO_ANSWER':
            case 'FAILED':
                  return 'text-gray-400';
            default:
                  return 'text-gray-500';
      }
}

// ============================================================================
// GROUP AVATAR STACK — overlapping avatars for group calls
// ============================================================================

interface GroupAvatarStackProps {
      participants: CallParticipantRecord[];
      currentUserId: string | undefined;
}

/**
 * Renders up to MAX_GROUP_AVATARS overlapping small avatars,
 * plus a "+N" badge if there are more participants.
 */
function GroupAvatarStack({ participants, currentUserId }: GroupAvatarStackProps) {
      // Exclude current user, take first N
      const others = participants.filter((p) => p.userId !== currentUserId);
      const visible = others.slice(0, MAX_GROUP_AVATARS);
      const remaining = Math.max(0, others.length - MAX_GROUP_AVATARS);

      return (
            <div className="relative flex-shrink-0" style={{ width: 48, height: 48 }}>
                  {visible.map((p, idx) => {
                        const user = p.user;
                        const size = visible.length === 1 ? 48 : 28;
                        // Offset each avatar to create overlapping stack
                        const offset = visible.length === 1 ? 0 : idx * 14;
                        const top = visible.length === 1 ? 0 : idx < 2 ? 0 : 18;
                        const left = visible.length === 1 ? 0 : idx < 2 ? offset : (idx - 2) * 14;

                        return (
                              <Avatar
                                    key={p.userId}
                                    size={size}
                                    src={user?.avatarUrl ?? undefined}
                                    className="bg-blue-500 border-2 border-white dark:border-gray-900 absolute"
                                    style={{ top, left, zIndex: MAX_GROUP_AVATARS - idx }}
                              >
                                    {user?.displayName?.[0]?.toUpperCase() ?? '?'}
                              </Avatar>
                        );
                  })}
                  {remaining > 0 && (
                        <span
                              className="absolute bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-[10px] font-medium rounded-full flex items-center justify-center border-2 border-white dark:border-gray-900"
                              style={{
                                    width: 22,
                                    height: 22,
                                    bottom: 0,
                                    right: 0,
                                    zIndex: MAX_GROUP_AVATARS + 1,
                              }}
                        >
                              +{remaining}
                        </span>
                  )}
            </div>
      );
}

// ============================================================================
// COMPONENT
// ============================================================================

interface CallHistoryItemProps {
      record: CallHistoryRecord;
      onCallback?: (userId: string, callType: CallType, conversationId: string | null) => void;
}

export function CallHistoryItem({ record, onCallback }: CallHistoryItemProps) {
      const currentUserId = useAuthStore((s) => s.user?.id);
      const isOutgoing = record.initiatorId === currentUserId;
      const direction: CallDirection = isOutgoing ? 'outgoing' : 'incoming';

      // Derive variant: group (>2 participants) vs 1v1
      const isGroup = record.participantCount > 2;

      // 1v1: the "other" person from participants[]
      const otherParticipant = record.participants?.find(
            (p) => p.userId !== currentUserId,
      );
      const peer = otherParticipant?.user ?? record.initiator;
      const peerName = peer?.displayName ?? 'Người dùng';
      const peerAvatar = peer?.avatarUrl ?? undefined;
      const peerId: string =
            otherParticipant?.userId ?? record.initiatorId;

      // Group: display label
      const groupLabel = isGroup
            ? `Cuộc gọi nhóm · ${record.participantCount} người`
            : peerName;

      const statusLabel = useMemo(
            () => getStatusLabel(record.status, direction),
            [record.status, direction],
      );

      const statusColor = useMemo(
            () => getStatusColor(record.status),
            [record.status],
      );

      const handleCallback = useCallback(() => {
            onCallback?.(peerId, record.callType, record.conversationId);
      }, [onCallback, peerId, record.callType, record.conversationId]);

      return (
            <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer">
                  {/* Avatar: group stack vs single avatar */}
                  {isGroup ? (
                        <GroupAvatarStack
                              participants={record.participants ?? []}
                              currentUserId={currentUserId}
                        />
                  ) : (
                        <Avatar size={48} src={peerAvatar} className="flex-shrink-0 bg-blue-500">
                              {peerName[0]?.toUpperCase() ?? '?'}
                        </Avatar>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                              {/* Direction / group icon */}
                              {isGroup ? (
                                    <TeamOutlined className="text-xs text-blue-500" />
                              ) : direction === 'outgoing' ? (
                                    <ArrowUpOutlined className="text-xs text-green-500" />
                              ) : record.status === 'MISSED' ? (
                                    <CloseOutlined className="text-xs text-red-500" />
                              ) : (
                                    <ArrowDownOutlined className="text-xs text-blue-500" />
                              )}
                              <Text strong className="truncate">
                                    {groupLabel}
                              </Text>
                        </div>

                        <div className="flex items-center gap-2 mt-0.5">
                              {/* Call type icon */}
                              {record.callType === 'VIDEO' ? (
                                    <VideoCameraOutlined className="text-xs text-gray-400" />
                              ) : (
                                    <PhoneOutlined className="text-xs text-gray-400" />
                              )}

                              <Text className={`text-xs ${statusColor}`}>
                                    {statusLabel}
                              </Text>

                              {record.status === 'COMPLETED' && record.duration && (
                                    <Text className="text-xs text-gray-400">
                                          • {formatDuration(record.duration)}
                                    </Text>
                              )}
                        </div>
                  </div>

                  {/* Timestamp */}
                  <Text className="!text-xs text-gray-400 flex-shrink-0">
                        {formatTimestamp(record.startedAt)}
                  </Text>

                  {/* Callback button */}
                  <Tooltip title={isGroup ? 'Gọi nhóm lại' : 'Gọi lại'}>
                        <Button
                              type="text"
                              size="small"
                              icon={record.callType === 'VIDEO' ? <VideoCameraOutlined /> : <PhoneOutlined />}
                              className="!text-blue-500 flex-shrink-0"
                              onClick={(e) => {
                                    e.stopPropagation();
                                    handleCallback();
                              }}
                        />
                  </Tooltip>
            </div>
      );
}
