import { useQuery } from '@tanstack/react-query';
import { mobileApi } from '@/services/api';
import { useAuth } from '@/providers/auth-provider';

export const profileKeys = {
  all: ['profile'] as const,
  detail: (userId: string) => [...profileKeys.all, 'detail', userId] as const,
};

export function useContactProfile(targetId: string | null) {
  const { accessToken } = useAuth();

  return useQuery({
    queryKey: profileKeys.detail(targetId || ''),
    queryFn: async () => {
      if (!accessToken || !targetId) throw new Error('Missing params');
      return mobileApi.getContactProfile(targetId, accessToken);
    },
    enabled: !!accessToken && !!targetId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
