// [NEW FILE]
export interface HasTargetUser {
  targetUserId: string;
}

// Type Guard để kiểm tra runtime xem body có đúng chuẩn không
export function isHasTargetUser(body: any): body is HasTargetUser {
  return body && typeof body.targetUserId === 'string';
}
