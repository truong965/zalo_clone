/**
 * Gom tất cả Provider vào một file
 */

import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider, theme as antdTheme } from 'antd';
import { useAppStore } from '@/stores/use-app-store';
import { queryClient } from '@/lib/query-client';
import viVN from 'antd/locale/vi_VN';
import enUS from 'antd/locale/en_US';

interface AppProvidersProps {
  children: ReactNode;
}

export function AppProviders({ children }: AppProvidersProps) {
  const { theme, language } = useAppStore();

  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider
        locale={language === 'vi' ? viVN : enUS}
        theme={{
          token: {
            colorPrimary: '#1976d2',
            colorSuccess: '#52c41a',
            colorWarning: '#faad14',
            colorError: '#f5222d',
            colorInfo: '#1890ff',
            borderRadius: 8,
          },
          algorithm: theme === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        }}
      >
        {children}
      </ConfigProvider>
    </QueryClientProvider>
  );
}
