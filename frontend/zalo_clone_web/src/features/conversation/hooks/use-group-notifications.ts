/**
 * useGroupNotifications — Global group event notification hook
 *
 * Listens for group socket events and:
 * 1. Shows toast notifications via antd notification API
 * 2. Invalidates relevant TanStack Query caches (groups list, conversation detail/members)
 *
 * Mount this hook at the authenticated layout level (ClientLayout)
 * so notifications fire regardless of which page the user is on.
 *
 * Events handled:
 * - group:created        → Toast "Bạn đã được thêm vào nhóm 'X'"     + invalidate groups
 * - group:updated        → Toast "Thông tin nhóm đã cập nhật"        + invalidate detail
 * - group:membersAdded   → Toast "Thành viên mới đã được thêm vào nhóm" + invalidate members
 * - group:memberRemoved  → Toast "Một thành viên đã bị xóa"          + invalidate members
 * - group:memberLeft     → Toast "Một thành viên đã rời nhóm"        + invalidate members
 * - group:youWereRemoved → Warning toast "Bạn đã bị xóa khỏi nhóm"   + invalidate groups
 * - group:dissolved      → Warning toast "Nhóm đã bị giải tán"       + invalidate groups
 * - group:memberJoined   → Toast "Yêu cầu tham gia đã được chấp nhận" + invalidate members
 * - group:adminTransferred → Toast "Quyền quản trị đã được chuyển"   + invalidate members
 * - group:joinRequestReceived → Toast "Có yêu cầu tham gia mới"      + invalidate (admin only)
 */

import { useCallback, useEffect, useRef } from 'react';
import { notification } from 'antd';
import { useNavigate, useLocation } from 'react-router-dom';
import { useConversationSocket } from './use-conversation-socket';
import { useInvalidateConversations } from './use-conversation-queries';

export function useGroupNotifications() {
      const { invalidateAll, invalidateGroups, invalidateDetail, invalidateMembers, removeFromCache } =
            useInvalidateConversations();
      const navigate = useNavigate();
      const location = useLocation();

      // Store location in ref to avoid re-rendering the socket hook
      const locationRef = useRef(location);
      useEffect(() => {
            locationRef.current = location;
      }, [location]);

      // ------------------------------------------------------------------
      // Event handlers — wrapped in useCallback to keep stable references
      // (handlersRef inside useConversationSocket avoids re-registration,
      //  but stable callbacks still help downstream memoization)
      // ------------------------------------------------------------------

      const onGroupCreated = useCallback(
            (data: { group: { id: string; name?: string } }) => {
                  // Show toast for being added to the group
                  const groupName = data.group.name ?? 'Không tên';
                  notification.info({
                        message: 'Nhóm mới',
                        description: `Bạn đã được thêm vào nhóm "${groupName}"`,
                        placement: 'topRight',
                        duration: 4,
                        onClick: () => {
                              navigate(`/chat?conversationId=${data.group.id}`);
                              notification.destroy();
                        },
                        style: { cursor: 'pointer' },
                  });

                  // Refresh groups + conversation list
                  void invalidateGroups();
                  void invalidateAll();
            },
            [invalidateGroups, invalidateAll, navigate],
      );

      const onGroupUpdated = useCallback(
            (data: { conversationId: string }) => {
                  notification.info({
                        message: 'Cập nhật nhóm',
                        description: 'Thông tin nhóm đã được cập nhật',
                        placement: 'topRight',
                        duration: 3,
                  });

                  void invalidateGroups();
                  void invalidateDetail(data.conversationId);
                  void invalidateAll();
            },
            [invalidateGroups, invalidateDetail, invalidateAll],
      );

      const onGroupMembersAdded = useCallback(
            (data: { conversationId: string; memberIds: string[] }) => {
                  const count = data.memberIds.length;
                  notification.info({
                        message: 'Thành viên mới',
                        description:
                              count === 1
                                    ? 'Một thành viên mới đã được thêm vào nhóm'
                                    : `${count} thành viên mới đã được thêm vào nhóm`,
                        placement: 'topRight',
                        duration: 3,
                  });

                  void invalidateMembers(data.conversationId);
                  void invalidateGroups();
                  void invalidateAll();
            },
            [invalidateMembers, invalidateGroups, invalidateAll],
      );

      const onGroupMemberRemoved = useCallback(
            (data: { conversationId: string }) => {
                  notification.info({
                        message: 'Xóa thành viên',
                        description: 'Một thành viên đã bị xóa khỏi nhóm',
                        placement: 'topRight',
                        duration: 3,
                  });

                  void invalidateMembers(data.conversationId);
                  void invalidateGroups();
                  void invalidateAll();
            },
            [invalidateMembers, invalidateGroups, invalidateAll],
      );

      const onGroupMemberLeft = useCallback(
            (data: { conversationId: string }) => {
                  notification.info({
                        message: 'Rời nhóm',
                        description: 'Một thành viên đã rời khỏi nhóm',
                        placement: 'topRight',
                        duration: 3,
                  });

                  void invalidateMembers(data.conversationId);
                  void invalidateGroups();
                  void invalidateAll();
            },
            [invalidateMembers, invalidateGroups, invalidateAll],
      );

      const onGroupYouWereRemoved = useCallback(
            (data: { conversationId: string }) => {
                  notification.warning({
                        message: 'Đã bị xóa khỏi nhóm',
                        description: 'Bạn đã bị xóa khỏi một nhóm trò chuyện',
                        placement: 'topRight',
                        duration: 5,
                  });

                  // If user is currently viewing this conversation, redirect
                  const currentPath = locationRef.current.pathname + locationRef.current.search;
                  if (currentPath.includes(data.conversationId)) {
                        navigate('/chat');
                  }

                  // Remove from cache first to prevent stale 400 errors
                  void removeFromCache(data.conversationId).then(() => {
                        void invalidateGroups();
                        void invalidateAll();
                  });
            },
            [invalidateGroups, invalidateAll, navigate, removeFromCache],
      );

      const onGroupDissolved = useCallback(
            (data: { conversationId: string }) => {
                  notification.warning({
                        message: 'Nhóm đã giải tán',
                        description: 'Một nhóm trò chuyện bạn tham gia đã bị giải tán',
                        placement: 'topRight',
                        duration: 5,
                  });

                  // If user is currently viewing this conversation, redirect
                  const currentPath = locationRef.current.pathname + locationRef.current.search;
                  if (currentPath.includes(data.conversationId)) {
                        navigate('/chat');
                  }

                  // Remove from cache first to prevent stale 400 errors
                  void removeFromCache(data.conversationId).then(() => {
                        void invalidateGroups();
                        void invalidateAll();
                  });
            },
            [invalidateGroups, invalidateAll, navigate, removeFromCache],
      );

      const onGroupMemberJoined = useCallback(
            (data: { conversationId: string }) => {
                  notification.success({
                        message: 'Thành viên mới',
                        description: 'Yêu cầu tham gia nhóm đã được chấp nhận',
                        placement: 'topRight',
                        duration: 3,
                  });

                  void invalidateMembers(data.conversationId);
                  void invalidateGroups();
            },
            [invalidateMembers, invalidateGroups],
      );

      const onGroupAdminTransferred = useCallback(
            (data: { conversationId: string }) => {
                  notification.info({
                        message: 'Chuyển quyền quản trị',
                        description: 'Quyền quản trị nhóm đã được chuyển',
                        placement: 'topRight',
                        duration: 3,
                  });

                  void invalidateMembers(data.conversationId);
                  void invalidateDetail(data.conversationId);
                  void invalidateAll();
            },
            [invalidateMembers, invalidateDetail, invalidateAll],
      );

      const onGroupJoinRequestReceived = useCallback(
            (data: { conversationId: string }) => {
                  notification.info({
                        message: 'Yêu cầu tham gia',
                        description: 'Có yêu cầu tham gia nhóm mới cần phê duyệt',
                        placement: 'topRight',
                        duration: 4,
                  });

                  void invalidateMembers(data.conversationId);
            },
            [invalidateMembers],
      );

      // ------------------------------------------------------------------
      // Register all handlers via useConversationSocket
      // ------------------------------------------------------------------

      useConversationSocket({
            onGroupCreated,
            onGroupUpdated,
            onGroupMembersAdded,
            onGroupMemberRemoved,
            onGroupMemberLeft,
            onGroupYouWereRemoved,
            onGroupDissolved,
            onGroupMemberJoined,
            onGroupAdminTransferred,
            onGroupJoinRequestReceived,
      });
}
