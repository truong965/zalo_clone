import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationOptions } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';
import type { PrivacySettings, UpdatePrivacySettingsPayload } from '@/types/privacy';

// ============================================================================
// Query Keys
// ============================================================================

export const privacyKeys = {
      all: ['privacy'] as const,
      settings: () => [...privacyKeys.all, 'settings'] as const,
} as const;

// ============================================================================
// TanStack Query Hooks
// ============================================================================

export function usePrivacySettings() {
      const { accessToken } = useAuth();
      
      return useQuery({
            queryKey: privacyKeys.settings(),
            queryFn: async () => {
                  if (!accessToken) throw new Error("No access token");
                  return mobileApi.getPrivacySettings(accessToken);
            },
            enabled: !!accessToken,
            staleTime: 1000 * 60 * 5, // 5 min
      });
}

export function useUpdatePrivacySettings(
      options?: UseMutationOptions<PrivacySettings, Error, UpdatePrivacySettingsPayload, any>
) {
      const queryClient = useQueryClient();
      const { accessToken } = useAuth();

      return useMutation({
            mutationFn: async (payload: UpdatePrivacySettingsPayload) => {
                  if (!accessToken) throw new Error("No access token");
                  return mobileApi.updatePrivacySettings(payload, accessToken);
            },
            onSuccess: (updated, ...args) => {
                  queryClient.setQueryData(privacyKeys.settings(), updated);
                  options?.onSuccess?.(updated, ...args);
            },
            ...options,
      });
}
