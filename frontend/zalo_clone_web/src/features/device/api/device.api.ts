import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationOptions } from '@tanstack/react-query';
import { authService } from '@/features/auth/api/auth.service';
import type { SessionsResponse } from '@/features/auth/api/auth.service';

export const deviceKeys = {
  all: ['devices'] as const,
  lists: () => [...deviceKeys.all, 'list'] as const,
};

export function useDeviceSessions() {
  return useQuery({
    queryKey: deviceKeys.lists(),
    queryFn: () => authService.getSessions(),
    refetchInterval: 30000,
  });
}

export function useRevokeSession(
  options?: UseMutationOptions<void, any, string, any>
) {
  const queryClient = useQueryClient();

  return useMutation({
    ...options,
    mutationFn: (deviceId: string) => authService.revokeSession(deviceId),
    onSuccess: (...args) => {
      const [, deviceId] = args;
      // Optimistically remove the revoked device from the sessions list
      queryClient.setQueryData(deviceKeys.lists(), (oldData: SessionsResponse | undefined) => {
        if (!oldData) return { sessions: [] };
        return {
          ...oldData,
          sessions: oldData.sessions.filter((device) => device.deviceId !== deviceId),
        };
      });
      queryClient.invalidateQueries({ queryKey: deviceKeys.lists() });

      options?.onSuccess?.(...args);
    },
  });
}
