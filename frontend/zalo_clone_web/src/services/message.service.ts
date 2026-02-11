import { API_ENDPOINTS } from '@/constants/api-endpoints';
import apiClient from '@/lib/axios';
import type { ApiResponse, CursorPaginatedResponse, MessageListItem, MessageType } from '@/types/api';

export interface MessageContextResponse {
  data: MessageListItem[];
  targetMessageId: string;
  hasOlderMessages: boolean;
  hasNewerMessages: boolean;
}

export const messageService = {
  async getMessages(params: {
    conversationId: string;
    cursor?: string;
    limit?: number;
    direction?: 'older' | 'newer';
  }): Promise<CursorPaginatedResponse<MessageListItem>> {
    const response = await apiClient.get<
      ApiResponse<CursorPaginatedResponse<MessageListItem>>
    >(API_ENDPOINTS.MESSAGES.GET_ALL, { params });
    // console.log("params ", params);
    // console.log("chat: ", response.data.data);
    return response.data.data;
  },

  async sendMessage(dto: {
    conversationId: string;
    clientMessageId: string;
    type: MessageType;
    content?: string;
    metadata?: Record<string, unknown>;
    replyTo?: { messageId: string };
    mediaIds?: string[];
  }): Promise<MessageListItem> {
    const response = await apiClient.post<ApiResponse<MessageListItem>>(
      API_ENDPOINTS.MESSAGES.SEND,
      dto,
    );

    return response.data.data;
  },

  /**
   * Get messages around a target message (for jump-to-message from search).
   * Returns messages in the same MessageListItem shape as getMessages().
   */
  async getMessageContext(params: {
    conversationId: string;
    messageId: string;
    before?: number;
    after?: number;
  }): Promise<MessageContextResponse> {
    const response = await apiClient.get<ApiResponse<MessageContextResponse>>(
      API_ENDPOINTS.MESSAGES.CONTEXT,
      { params },
    );
    return response.data.data;
  },
};
