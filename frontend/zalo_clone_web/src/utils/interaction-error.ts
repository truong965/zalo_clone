/**
 * Reusable interaction error handler
 *
 * Handles common API errors when interacting with other users:
 * - 403: Blocked or privacy restriction (whoCanMessageMe = CONTACTS)
 * - Other errors: Generic notification
 *
 * Can be used across features: Search, Chat, Profile, etc.
 */

import { notification } from 'antd';
import { ApiError } from '@/lib/api-error';

export interface InteractionErrorContext {
      /** Target user info for friend request modal */
      target?: {
            userId: string;
            displayName: string;
            avatarUrl?: string;
      };
}

export interface InteractionErrorResult {
      /** Whether the error was a 403 (blocked / privacy restriction) */
      isForbidden: boolean;
      /** Whether the user is blocked (reason contains 'block') */
      isBlocked: boolean;
      /** Whether the error is a privacy restriction (not blocked but 403) */
      isPrivacyRestriction: boolean;
      /** The error message from the server */
      serverMessage?: string;
}

/**
 * Extract HTTP status and message from an ApiError (or fallback to raw Axios shape)
 */
function parseApiError(error: unknown): { status?: number; message?: string } {
      const apiErr = ApiError.from(error);
      return {
            status: apiErr.status || undefined,
            message: apiErr.message || undefined,
      };
}

/**
 * Handle interaction errors (403 blocked / privacy, etc.)
 *
 * @returns InteractionErrorResult describing the error type
 *
 * @example
 * ```tsx
 * try {
 *   await conversationService.getOrCreateDirectConversation(userId);
 * } catch (error) {
 *   const result = handleInteractionError(error, {
 *     target: { userId, displayName, avatarUrl },
 *   });
 *   if (result.isBlocked) {
 *     notification.warning({ message: 'Không thể thực hiện do người dùng đã bị chặn' });
 *   } else if (result.isPrivacyRestriction) {
 *     showFriendRequestModal(target);
 *   }
 * }
 * ```
 */
export function handleInteractionError(
      error: unknown,
      context?: InteractionErrorContext,
): InteractionErrorResult {
      const { status, message: serverMessage } = parseApiError(error);

      if (status === 403) {
            const lowerMsg = (serverMessage ?? '').toLowerCase();
            const isBlocked = lowerMsg.includes('block');

            if (isBlocked) {
                  // User is blocked → show UI notification, no friend request option
                  notification.warning({
                        message: 'Không thể thực hiện',
                        description: 'Bạn không thể tương tác với người dùng này.',
                  });
            }

            return {
                  isForbidden: true,
                  isBlocked,
                  isPrivacyRestriction: !isBlocked,
                  serverMessage,
            };
      }

      // Non-403 errors → generic notification
      notification.error({
            message: context?.target
                  ? 'Không thể tạo cuộc trò chuyện'
                  : 'Đã xảy ra lỗi',
            description: serverMessage,
      });

      return {
            isForbidden: false,
            isBlocked: false,
            isPrivacyRestriction: false,
            serverMessage,
      };
}
