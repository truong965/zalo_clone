/**
 * useCreateGroup — Orchestration hook for group creation
 *
 * Handles:
 * 1. Optional avatar upload via presigned URL flow
 * 2. Socket emit: group:create
 * 3. Store state management (loading, error, reset)
 * 4. Invalidation of conversation queries on success
 */

import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { notification } from 'antd';
import apiClient from '@/lib/axios';
import { API_ENDPOINTS } from '@/constants/api-endpoints';
import { useConversationSocket } from './use-conversation-socket';
import { useInvalidateConversations } from './use-conversation-queries';
import {
      useCreateGroupStore,
      selectSelectedIds,
      selectCanCreate,
} from '../stores/create-group.store';

/**
 * Upload a file using the presigned URL flow:
 * 1. POST /media/upload → get presigned URL
 * 2. PUT file to presigned URL
 * 3. Return the final file URL
 */
async function uploadAvatar(file: File): Promise<string> {
      // Step 1: Get presigned URL
      const { data: initRes } = await apiClient.post(API_ENDPOINTS.MEDIA.UPLOAD, {
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            category: 'avatar',
      });

      const { uploadUrl, fileUrl } = initRes.data;

      // Step 2: Upload to presigned URL
      await fetch(uploadUrl, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type },
      });

      return fileUrl;
}

export function useCreateGroup() {
      const canCreate = useCreateGroupStore(selectCanCreate);
      // useShallow prevents re-renders when array contents haven't changed
      const selectedIds = useCreateGroupStore(useShallow(selectSelectedIds));
      const groupName = useCreateGroupStore((s) => s.groupName);
      const avatarFile = useCreateGroupStore((s) => s.avatarFile);
      const isCreating = useCreateGroupStore((s) => s.isCreating);
      const setCreating = useCreateGroupStore((s) => s.setCreating);
      const setError = useCreateGroupStore((s) => s.setError);
      const close = useCreateGroupStore((s) => s.close);

      const { createGroup } = useConversationSocket({});
      const { invalidateAll } = useInvalidateConversations();

      const handleCreate = useCallback(async (): Promise<string | null> => {
            if (!canCreate) return null;

            const sanitizedName = groupName.replace(/[<>]/g, '').trim();
            if (!sanitizedName) {
                  const message = 'Tên nhóm không hợp lệ';
                  setError(message);
                  notification.error({
                        message,
                        description: 'Vui lòng nhập tên khác (không chứa ký tự <>).',
                  });
                  return null;
            }

            setCreating(true);
            setError(null);

            try {
                  // 1. Upload avatar if provided
                  let avatarUrl: string | undefined;
                  if (avatarFile) {
                        try {
                              avatarUrl = await uploadAvatar(avatarFile);
                        } catch {
                              notification.warning({
                                    message: 'Không thể tải ảnh nhóm',
                                    description:
                                          'Nhóm sẽ được tạo không có ảnh đại diện. Bạn có thể thêm sau.',
                              });
                              // Continue without avatar — don't block group creation
                        }
                  }

                  // 2. Emit socket group:create (with 15s timeout)
                  const SOCKET_TIMEOUT_MS = 15_000;

                  const emitPromise = createGroup?.({
                        name: sanitizedName,
                        memberIds: selectedIds,
                        avatarUrl,
                  });

                  if (!emitPromise) {
                        throw new Error('Socket not connected');
                  }

                  const timeoutPromise = new Promise<never>((_, reject) =>
                        setTimeout(
                              () => reject(new Error('Kết nối quá thời gian. Vui lòng thử lại.')),
                              SOCKET_TIMEOUT_MS,
                        ),
                  );

                  const result = await Promise.race([emitPromise, timeoutPromise]);

                  // 3. Success
                  notification.success({
                        message: 'Tạo nhóm thành công',
                        description: `Nhóm "${sanitizedName}" đã được tạo.`,
                  });

                  // 4. Invalidate queries
                  void invalidateAll();

                  // 5. Close modal + reset store
                  close();

                  return result.group.id;
            } catch (err) {
                  const message =
                        err instanceof Error ? err.message : 'Đã có lỗi xảy ra';
                  setError(message);
                  notification.error({
                        message: 'Tạo nhóm thất bại',
                        description: message,
                  });
                  return null;
            } finally {
                  setCreating(false);
            }
      }, [
            canCreate,
            groupName,
            selectedIds,
            avatarFile,
            createGroup,
            invalidateAll,
            close,
            setCreating,
            setError,
      ]);

      return {
            handleCreate,
            isCreating,
            canCreate,
      };
}
