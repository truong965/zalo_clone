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
  const isDark = theme === 'dark';

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
            /* Dark-mode surface tokens — keeps AntD components (Select,
               Input, Modal, Dropdown …) on the same dark palette as our
               global Tailwind overrides, fixing the "hover bg white" bug. */
            ...(isDark && {
              colorBgContainer: '#111827',   /* matches html.dark .bg-white  */
              colorBgElevated: '#1e293b',   /* dropdown / popover bg        */
              colorBgLayout: '#0f172a',   /* page layout bg               */
              colorBgSpotlight: '#334155',
              colorBorder: '#334155',
              colorBorderSecondary: '#1e293b',
              colorText: '#f1f5f9',
              colorTextSecondary: '#94a3b8',
              colorTextTertiary: '#64748b',
              colorFillSecondary: 'rgba(255,255,255,0.06)',
              colorFill: 'rgba(255,255,255,0.09)',
              colorFillTertiary: 'rgba(255,255,255,0.04)',
              colorFillQuaternary: 'rgba(255,255,255,0.02)',
            }),
          },
          algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        }}
      >
        {children}
      </ConfigProvider>
    </QueryClientProvider>
  );
}
