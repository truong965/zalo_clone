/**
 * GroupJoinRequests — Admin-only section showing pending join requests.
 *
 * Fetches pending requests via socket, allows admin to approve/reject.
 * Only renders when the group has requireApproval enabled.
 */
import { useState, useEffect, useCallback } from 'react';
import { Avatar, Button, Badge, Spin, Empty } from 'antd';
import {
      CheckOutlined,
      CloseOutlined,
      TeamOutlined,
} from '@ant-design/icons';

interface JoinRequestItem {
      id: string;
      conversationId: string;
      userId: string;
      status: string;
      requestedAt: string;
      message?: string;
      user?: {
            id: string;
            displayName: string;
            avatarUrl: string | null;
      };
}

interface GroupJoinRequestsProps {
      isAdmin: boolean;
      conversationId: string;
      requireApproval: boolean;
      getPendingRequests: (conversationId: string) => Promise<unknown[]> | undefined;
      reviewJoinRequest: (requestId: string, approve: boolean) => Promise<{ success: boolean; status?: string; alreadyMember?: boolean; message?: string }> | undefined;
      /** Called externally when a new join request arrives to trigger refetch */
      refreshTrigger?: number;
}

export function GroupJoinRequests({
      isAdmin,
      conversationId,
      requireApproval,
      getPendingRequests,
      reviewJoinRequest,
      refreshTrigger,
}: GroupJoinRequestsProps) {
      const [requests, setRequests] = useState<JoinRequestItem[]>([]);
      const [isLoading, setIsLoading] = useState(false);
      const [reviewingIds, setReviewingIds] = useState<Set<string>>(new Set());

      const fetchRequests = useCallback(async () => {
            if (!isAdmin || !requireApproval) return;
            setIsLoading(true);
            try {
                  const result = await getPendingRequests(conversationId);
                  setRequests((result ?? []) as JoinRequestItem[]);
            } catch {
                  // Silently fail — admin may see empty list
            } finally {
                  setIsLoading(false);
            }
      }, [isAdmin, requireApproval, conversationId, getPendingRequests]);

      // Fetch on mount and when refreshTrigger changes
      useEffect(() => {
            fetchRequests();
      }, [fetchRequests, refreshTrigger]);

      const handleReview = async (requestId: string, approve: boolean) => {
            setReviewingIds((prev) => new Set(prev).add(requestId));
            try {
                  await reviewJoinRequest(requestId, approve);
                  // Remove from local list - notification handled by use-group-notifications
                  setRequests((prev) => prev.filter((r) => r.id !== requestId));
            } catch {
                  // Error notification handled by use-group-notifications
            } finally {
                  setReviewingIds((prev) => {
                        const next = new Set(prev);
                        next.delete(requestId);
                        return next;
                  });
            }
      };

      if (!isAdmin || !requireApproval) return null;

      return (
            <div className="border-b border-[#f4f5f7] border-b-[6px]">
                  <div className="flex items-center gap-2 px-4 py-3">
                        <TeamOutlined className="text-gray-500" />
                        <span className="text-sm font-medium text-gray-700">
                              Yêu cầu tham gia
                        </span>
                        {requests.length > 0 && (
                              <Badge
                                    count={requests.length}
                                    size="small"
                                    className="ml-1"
                              />
                        )}
                  </div>

                  <div className="px-2 pb-3">
                        {isLoading ? (
                              <div className="flex justify-center py-4">
                                    <Spin size="small" />
                              </div>
                        ) : requests.length === 0 ? (
                              <Empty
                                    description="Không có yêu cầu nào"
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    className="py-2"
                              />
                        ) : (
                              requests.map((request) => {
                                    const isReviewing = reviewingIds.has(request.id);
                                    return (
                                          <div
                                                key={request.id}
                                                className="flex items-center gap-3 px-2 py-2 hover:bg-gray-50 rounded transition-colors"
                                          >
                                                <Avatar
                                                      size={36}
                                                      src={request.user?.avatarUrl}
                                                >
                                                      {request.user?.displayName?.charAt(0)}
                                                </Avatar>
                                                <div className="flex-1 min-w-0">
                                                      <div className="text-sm font-medium truncate">
                                                            {request.user?.displayName ?? 'Người dùng'}
                                                      </div>
                                                      {request.message && (
                                                            <div className="text-xs text-gray-400 truncate">
                                                                  {request.message}
                                                            </div>
                                                      )}
                                                </div>
                                                <div className="flex gap-1 flex-none">
                                                      <Button
                                                            type="primary"
                                                            size="small"
                                                            icon={<CheckOutlined />}
                                                            loading={isReviewing}
                                                            onClick={() =>
                                                                  handleReview(request.id, true)
                                                            }
                                                            className="!px-2"
                                                      />
                                                      <Button
                                                            size="small"
                                                            danger
                                                            icon={<CloseOutlined />}
                                                            loading={isReviewing}
                                                            onClick={() =>
                                                                  handleReview(request.id, false)
                                                            }
                                                            className="!px-2"
                                                      />
                                                </div>
                                          </div>
                                    );
                              })
                        )}
                  </div>
            </div>
      );
}
