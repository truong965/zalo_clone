/**
 * Reminder API — CRUD for user reminders.
 */

import { API_ENDPOINTS } from '@/constants/api-endpoints';
import apiClient from '@/lib/axios';
import type { ApiResponse, ReminderItem, CreateReminderParams, UpdateReminderParams } from '@/types/api';

async function getReminders(includeCompleted = false): Promise<ReminderItem[]> {
      const response = await apiClient.get<ApiResponse<ReminderItem[]>>(
            API_ENDPOINTS.REMINDERS.BASE,
            { params: includeCompleted ? { includeCompleted: 'true' } : undefined },
      );
      return response.data.data;
}

async function createReminder(params: CreateReminderParams): Promise<ReminderItem> {
      const response = await apiClient.post<ApiResponse<ReminderItem>>(
            API_ENDPOINTS.REMINDERS.BASE,
            params,
      );
      return response.data.data;
}

async function updateReminder(id: string, params: UpdateReminderParams): Promise<ReminderItem> {
      const response = await apiClient.patch<ApiResponse<ReminderItem>>(
            API_ENDPOINTS.REMINDERS.BY_ID(id),
            params,
      );
      return response.data.data;
}

async function deleteReminder(id: string): Promise<void> {
      await apiClient.delete(API_ENDPOINTS.REMINDERS.BY_ID(id));
}

async function getUndelivered(): Promise<ReminderItem[]> {
      const response = await apiClient.get<ApiResponse<ReminderItem[]>>(
            API_ENDPOINTS.REMINDERS.UNDELIVERED,
      );
      return response.data.data;
}

async function getConversationReminders(conversationId: string): Promise<ReminderItem[]> {
      const response = await apiClient.get<ApiResponse<ReminderItem[]>>(
            API_ENDPOINTS.REMINDERS.BY_CONVERSATION(conversationId),
      );
      return response.data.data;
}

export const reminderApi = {
      getReminders,
      getConversationReminders,
      createReminder,
      updateReminder,
      deleteReminder,
      getUndelivered,
};
