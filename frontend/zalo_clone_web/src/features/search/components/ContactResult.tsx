/**
 * ContactResult — Search result card for contacts
 *
 * Hiển thị:
 * - Avatar + online indicator
 * - displayNameFinal + phone number
 * - Relationship badge (Bạn bè / Đã gửi lời mời / Người lạ)
 * - Actions: Nhắn tin / Kết bạn
 */

import { Avatar, Typography, Tag, Button } from 'antd';
import {
      MessageOutlined,
      UserAddOutlined,
      CheckOutlined,
      RollbackOutlined,
} from '@ant-design/icons';
import type { ContactSearchResult } from '../types';
import { getRelationshipLabel } from '../utils/search.util';

const { Text } = Typography;

interface ContactResultProps {
      data: ContactSearchResult;
      onClick?: (result: ContactSearchResult) => void;
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
      const relationLabel = getRelationshipLabel(
            data.relationshipStatus,
            data.requestDirection,
      );

      const tagColor =
            data.relationshipStatus === 'FRIEND'
                  ? 'green'
                  : data.relationshipStatus === 'REQUEST'
                        ? 'orange'
                        : data.relationshipStatus === 'BLOCKED'
                              ? 'red'
                              : 'default';

      return (
            <div
                  className="flex items-center gap-3 px-3 py-3 cursor-pointer rounded-lg hover:bg-gray-50 transition-colors group"
                  onClick={() => onClick?.(data)}
            >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                        <Avatar
                              size={44}
                              src={data.avatarUrl || undefined}
                              className={!data.avatarUrl ? 'bg-blue-500' : ''}
                        >
                              {data.displayNameFinal?.[0]?.toUpperCase() ?? 'U'}
                        </Avatar>
                        {data.isOnline && (
                              <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
                        )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                              <Text strong className="truncate text-sm text-gray-800">
                                    {data.displayNameFinal}
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
                                    title="Nhắn tin"
                                    onClick={(e) => {
                                          e.stopPropagation();
                                          onSendMessage?.(data.id);
                                    }}
                              />
                        )}
                        {data.relationshipStatus === 'NONE' && (
                              <Button
                                    type="text"
                                    size="small"
                                    icon={<UserAddOutlined />}
                                    className="text-blue-500"
                                    title="Kết bạn"
                                    onClick={(e) => {
                                          e.stopPropagation();
                                          onAddFriend?.(data.id);
                                    }}
                              />
                        )}
                        {data.relationshipStatus === 'REQUEST' && data.requestDirection === 'OUTGOING' && data.pendingRequestId && (
                              <Button
                                    type="text"
                                    size="small"
                                    icon={<RollbackOutlined />}
                                    className="text-orange-500"
                                    title="Thu hồi lời mời"
                                    onClick={(e) => {
                                          e.stopPropagation();
                                          onCancelRequest?.(data.pendingRequestId!, data.id);
                                    }}
                              />
                        )}
                        {data.relationshipStatus === 'REQUEST' && data.requestDirection === 'INCOMING' && data.pendingRequestId && (
                              <Button
                                    type="text"
                                    size="small"
                                    icon={<CheckOutlined />}
                                    className="text-green-600"
                                    title="Chấp nhận kết bạn"
                                    onClick={(e) => {
                                          e.stopPropagation();
                                          onAcceptRequest?.(data.pendingRequestId!, data.id);
                                    }}
                              />
                        )}
                  </div>
            </div>
      );
}
