// [NEW FILE]
import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { isHasTargetUser } from 'src/common/interfaces/has-target-user.interface';

/**
 * Helper chuẩn hóa việc lấy Target User ID từ Request
 * Thứ tự ưu tiên:
 * 1. request.params.targetUserId (Chuẩn RESTful: /users/:targetUserId/...)
 * 2. request.body.targetUserId (Chuẩn Action: POST body { targetUserId: "..." })
 */
export function extractTargetUserId(context: ExecutionContext): string {
  const request = context.switchToHttp().getRequest();

  // 1. Ưu tiên lấy từ URL Param (Đã chuẩn hóa tên biến là targetUserId)
  if (request.params && request.params.targetUserId) {
    return request.params.targetUserId;
  }

  // 2. Lấy từ Body (targetUserId hoặc recipientId)
  if (isHasTargetUser(request.body)) {
    return (
      request.body.targetUserId ?? request.body.recipientId
    ) as string;
  }

  // 3. Nếu không tìm thấy -> Báo lỗi Code (Developer Error) hoặc Bad Request
  // Guard không nên đoán mò các field khác như 'id', 'userId', 'recipientId'
  throw new BadRequestException(
    'Missing required parameter: targetUserId in URL params or Body',
  );
}
