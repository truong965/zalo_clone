export interface BuildGroupJoinQrPayloadInput {
    conversationId: string;
    groupName?: string | null;
    memberCount?: number;
}

export function buildGroupJoinQrPayload({
    conversationId,
    groupName,
    memberCount,
}: BuildGroupJoinQrPayloadInput): string {
    return JSON.stringify({
        type: 'GROUP_JOIN',
        conversationId,
        name: groupName,
        memberCount,
    });
}
