// [NEW FILE]
export interface HasTargetUser {
  targetUserId?: string;
  recipientId?: string;
}

// Type Guard: body has targetUserId or recipientId
export function isHasTargetUser(body: any): body is HasTargetUser {
  return (
    body &&
    (typeof body.targetUserId === 'string' ||
      typeof body.recipientId === 'string')
  );
}
