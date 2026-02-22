/**
 * Privacy API — REST functions + TanStack Query hooks
 *
 * GET  /api/v1/privacy  — get current user's privacy settings
 * PATCH /api/v1/privacy — update current user's privacy settings
 *
 * Emits privacy.updated event on backend (cache invalidation handled server-side)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiClient from '@/lib/axios';
import { API_ENDPOINTS } from '@/constants/api-endpoints';
import type { PrivacySettings, UpdatePrivacySettingsPayload } from '../types';

// ============================================================================
// Query Keys
// ============================================================================

export const privacyKeys = {
      all: ['privacy'] as const,
      settings: () => [...privacyKeys.all, 'settings'] as const,
} as const;

// ============================================================================
// REST API Functions
// ============================================================================

async function getPrivacySettings(): Promise<PrivacySettings> {
      const { data: response } = await apiClient.get(API_ENDPOINTS.PRIVACY.GET);
      // Backend wraps all responses in { statusCode, message, data }
      return response.data as PrivacySettings;
}

async function updatePrivacySettings(
      payload: UpdatePrivacySettingsPayload,
): Promise<PrivacySettings> {
      const { data: response } = await apiClient.patch(
            API_ENDPOINTS.PRIVACY.UPDATE,
            payload,
      );
      return response.data as PrivacySettings;
}

// ============================================================================
// TanStack Query Hooks
// ============================================================================

export function usePrivacySettings() {
      return useQuery({
            queryKey: privacyKeys.settings(),
            queryFn: getPrivacySettings,
            staleTime: 1000 * 60 * 5, // 5 min — mirrors server TTL
      });
}

export function useUpdatePrivacySettings() {
      const queryClient = useQueryClient();

      return useMutation({
            mutationFn: updatePrivacySettings,
            onSuccess: (updated) => {
                  queryClient.setQueryData(privacyKeys.settings(), updated);
            },
      });
}
