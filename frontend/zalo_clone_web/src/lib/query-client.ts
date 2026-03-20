/**
 * Cấu hình React Query
 */

import { QueryClient } from '@tanstack/react-query';
import { handleInteractionError } from '@/utils/interaction-error';
import { ApiError } from './api-error';

declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      skipGlobalError?: boolean;
    };
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 1000 * 60 * 5, // 5 minutes
      staleTime: 1000 * 60, // 1 minute
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
      onError: (error, _variables, _context, mutation) => {
        // If the mutation has specifically opted out of global error handling
        if (mutation.meta?.skipGlobalError) return;

        const apiErr = ApiError.from(error);

        // Access token expired (401) is handled by axios interceptor (redirects)
        if (apiErr.status === 401) return;

        // Use the centralized interaction error handler for other cases (403, generic, etc.)
        handleInteractionError(error);
      },
    },
  },
});
