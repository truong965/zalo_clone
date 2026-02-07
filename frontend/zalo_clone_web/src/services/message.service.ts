import { API_ENDPOINTS } from '@/constants/api-endpoints';
import apiClient from '@/lib/axios';
import type { ApiResponse, CursorPaginatedResponse, MessageListItem, MessageType } from '@/types/api';

export const messageService = {
  async getMessages(params: {
    conversationId: string;
    cursor?: string;
    limit?: number;
  }): Promise<CursorPaginatedResponse<MessageListItem>> {
    const response = await apiClient.get<
      ApiResponse<CursorPaginatedResponse<MessageListItem>>
    >(API_ENDPOINTS.MESSAGES.GET_ALL, { params });
    console.log("chat: ", response);
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
};
