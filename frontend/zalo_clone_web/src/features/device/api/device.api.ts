import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authService } from '@/features/auth/api/auth.service';
import type { DeviceSession } from '@/features/auth/api/auth.service';

export const deviceKeys = {
  all: ['devices'] as const,
  lists: () => [...deviceKeys.all, 'list'] as const,
};

export function useDeviceSessions() {
  return useQuery({
    queryKey: deviceKeys.lists(),
    queryFn: () => authService.getSessions(),
    refetchInterval: 30000, // optionally refetch every 30s to update online status
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (deviceId: string) => authService.revokeSession(deviceId),
    onSuccess: (_, deviceId) => {
      // Optimistically remove the revoked device from the list
      queryClient.setQueryData(deviceKeys.lists(), (oldData: DeviceSession[] | undefined) => {
        if (!oldData) return [];
        return oldData.filter((device) => device.deviceId !== deviceId);
      });
      // Also trigger a background refetch
      queryClient.invalidateQueries({ queryKey: deviceKeys.lists() });
    },
  });
}
