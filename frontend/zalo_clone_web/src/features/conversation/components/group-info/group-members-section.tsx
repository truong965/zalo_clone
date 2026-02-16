/**
 * GroupMembersSection — Collapsible member list for group info sidebar.
 *
 * Shows first N members with "Xem tất cả" expansion.
 * Admin sees action dropdown per member.
 */
import { useState } from 'react';
import { Spin } from 'antd';
import { GroupMemberItem } from './group-member-item';
import type { ConversationMemberInfo } from '@/features/conversation/api/conversation.api';

const INITIAL_DISPLAY_COUNT = 5;

interface GroupMembersSectionProps {
      members: ConversationMemberInfo[];
      isLoading: boolean;
      currentUserId: string;
      viewerIsAdmin: boolean;
      onRemoveMember: (userId: string) => void;
      onTransferAdmin: (userId: string) => void;
}

export function GroupMembersSection({
      members,
      isLoading,
      currentUserId,
      viewerIsAdmin,
      onRemoveMember,
      onTransferAdmin,
}: GroupMembersSectionProps) {
      const [showAll, setShowAll] = useState(false);

      const displayedMembers = showAll
            ? members
            : members.slice(0, INITIAL_DISPLAY_COUNT);

      const hasMore = members.length > INITIAL_DISPLAY_COUNT;

      if (isLoading) {
            return (
                  <div className="border-b border-[#f4f5f7] border-b-[6px] py-4">
                        <div className="flex justify-center py-4">
                              <Spin size="small" />
                        </div>
                  </div>
            );
      }

      return (
            <div className="border-b border-[#f4f5f7] border-b-[6px]">
                  {/* Section Header */}
                  <div className="flex items-center justify-between px-4 py-3">
                        <span className="text-sm font-medium text-gray-700">
                              Thành viên ({members.length})
                        </span>
                        {hasMore && (
                              <button
                                    className="text-xs text-blue-500 hover:text-blue-600 transition-colors"
                                    onClick={() => setShowAll(!showAll)}
                              >
                                    {showAll ? 'Thu gọn' : 'Xem tất cả'}
                              </button>
                        )}
                  </div>

                  {/* Member List */}
                  <div className="pb-2">
                        {displayedMembers.map((member) => (
                              <GroupMemberItem
                                    key={member.id}
                                    member={member}
                                    isCurrentUser={member.id === currentUserId}
                                    viewerIsAdmin={viewerIsAdmin}
                                    onRemove={onRemoveMember}
                                    onTransferAdmin={onTransferAdmin}
                              />
                        ))}
                  </div>
            </div>
      );
}
