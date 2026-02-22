/**
 * Gom tất cả Provider vào một file
 */

import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import { useAppStore } from '@/stores/use-app-store';
import { queryClient } from '@/lib/query-client';
import viVN from 'antd/locale/vi_VN';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const { theme } = useAppStore();

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={viVN}
        theme={{
          token: {
            colorPrimary: '#1976d2',
            colorSuccess: '#52c41a',
            colorWarning: '#faad14',
            colorError: '#f5222d',
            colorInfo: '#1890ff',
            borderRadius: 8,
          },
          algorithm: theme === 'dark' ? undefined : undefined,
        }}
      >
        {children}
      </ConfigProvider>
    </QueryClientProvider>
  );
}
