/**
 * Call API Layer
 *
 * Axios functions for call history REST endpoints.
 * Real-time call signaling goes through Socket.IO (see use-call-socket.ts).
 */

import api from '@/lib/axios';
import { API_ENDPOINTS } from '@/constants/api-endpoints';
import type { ApiResponse, CursorPaginatedResponse } from '@/types/api';
import type { CallHistoryRecord, MissedCallCount, CallHistoryStatus } from '../types';

// ============================================================================
// CALL HISTORY
// ============================================================================

export interface GetCallHistoryParams {
      cursor?: string;
      limit?: number;
      status?: CallHistoryStatus;
}

export async function getCallHistory(
      params: GetCallHistoryParams = {},
): Promise<CursorPaginatedResponse<CallHistoryRecord>> {
      const { data } = await api.get<ApiResponse<CursorPaginatedResponse<CallHistoryRecord>>>(
            API_ENDPOINTS.CALL.HISTORY,
            { params },
      );
      return data.data;
}

export async function getMissedCallCount(): Promise<MissedCallCount> {
      const { data } = await api.get<ApiResponse<MissedCallCount>>(
            API_ENDPOINTS.CALL.MISSED_COUNT,
      );
      return data.data;
}

export async function markMissedAsViewed(): Promise<void> {
      await api.post(API_ENDPOINTS.CALL.MARK_MISSED_VIEWED);
}

export async function deleteCallLog(callId: string): Promise<void> {
      await api.delete(API_ENDPOINTS.CALL.DELETE(callId));
}
