export const CONVERSATION_SYSTEM_MESSAGE_PORT = Symbol(
  'CONVERSATION_SYSTEM_MESSAGE_PORT',
);

export interface ConversationSystemMessagePayload {
  conversationId: string;
  message: Record<string, unknown>;
  excludeUserIds?: string[];
}

/**
 * Command contract for conversation-owned system message broadcast.
 */
export interface IConversationSystemMessagePort {
  broadcast(payload: ConversationSystemMessagePayload): Promise<void>;
}
