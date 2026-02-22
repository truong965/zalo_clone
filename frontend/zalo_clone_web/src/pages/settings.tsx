/**
 * SettingsPage
 *
 * Left-menu navigation + content panel.
 * Sections: Appearance (theme), Language, Privacy.
 *
 * Follows vercel-composition-patterns:
 * - Compound-component approach: each section is its own component
 * - State derived from store/queries; no redundant local state
 */

import { useState } from 'react';
import type { ReactNode } from 'react';
import { Layout, Menu, Typography, Segmented, Select, Card, Spin } from 'antd';
import {
      BgColorsOutlined,
      GlobalOutlined,
      LockOutlined,
} from '@ant-design/icons';
import { useAppStore } from '@/stores/use-app-store';
import { usePrivacySettings, useUpdatePrivacySettings } from '@/features/privacy/api/privacy.api';
import type { PrivacyLevel } from '@/features/privacy/types';

const { Sider, Content } = Layout;
const { Title, Text } = Typography;

// ============================================================================
// Privacy Level Select Component
// ============================================================================

interface PrivacySelectProps {
      label: string;
      value: PrivacyLevel | undefined;
      onChange: (val: PrivacyLevel) => void;
      loading: boolean;
}

function PrivacySelect({ label, value, onChange, loading }: PrivacySelectProps) {
      return (
            <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                  <div>
                        <Text className="text-sm font-medium text-gray-800">{label}</Text>
                  </div>
                  <Select<PrivacyLevel>
                        value={value}
                        onChange={onChange}
                        loading={loading}
                        disabled={loading}
                        className="w-44"
                        options={[
                              { value: 'EVERYONE', label: 'Tất cả mọi người' },
                              { value: 'CONTACTS', label: 'Chỉ bạn bè' },
                        ]}
                  />
            </div>
      );
}

// ============================================================================
// Section: Appearance
// ============================================================================

function AppearanceSection() {
      const { theme, setTheme } = useAppStore();

      return (
            <section>
                  <Title level={4} className="!mb-6 !text-gray-900">Giao diện</Title>
                  <Card bordered={false} className="!bg-gray-50 !rounded-xl">
                        <div className="flex items-center justify-between py-2">
                              <div>
                                    <Text className="text-sm font-medium text-gray-800">Chủ đề màu sắc</Text>
                                    <p className="text-xs text-gray-500 mt-0.5">Chọn giao diện sáng hoặc tối</p>
                              </div>
                              <Segmented
                                    value={theme}
                                    onChange={(v) => setTheme(v as 'light' | 'dark')}
                                    options={[
                                          { label: '☀️  Sáng', value: 'light' },
                                          { label: '🌙  Tối', value: 'dark' },
                                    ]}
                              />
                        </div>
                  </Card>
            </section>
      );
}

// ============================================================================
// Section: Language
// ============================================================================

function LanguageSection() {
      const { language, setLanguage } = useAppStore();

      return (
            <section>
                  <Title level={4} className="!mb-6 !text-gray-900">Ngôn ngữ</Title>
                  <Card bordered={false} className="!bg-gray-50 !rounded-xl">
                        <div className="flex items-center justify-between py-2">
                              <div>
                                    <Text className="text-sm font-medium text-gray-800">Ngôn ngữ hiển thị</Text>
                                    <p className="text-xs text-gray-500 mt-0.5">Ngôn ngữ sử dụng trong ứng dụng</p>
                              </div>
                              <Segmented
                                    value={language}
                                    onChange={(v) => setLanguage(v as string)}
                                    options={[
                                          { label: '🇻🇳  Tiếng Việt', value: 'vi' },
                                          { label: '🇬🇧  English', value: 'en' },
                                    ]}
                              />
                        </div>
                  </Card>
            </section>
      );
}

// ============================================================================
// Section: Privacy
// ============================================================================

function PrivacySection() {
      const { data: settings, isLoading } = usePrivacySettings();
      const { mutate: update, isPending } = useUpdatePrivacySettings();

      const updating = isPending;

      type PrivacyField = 'showProfile' | 'whoCanMessageMe' | 'whoCanCallMe';

      function handleChange(field: PrivacyField) {
            return (val: PrivacyLevel) => update({ [field]: val });
      }

      if (isLoading) {
            return (
                  <section>
                        <Title level={4} className="!mb-6 !text-gray-900">Quyền riêng tư</Title>
                        <div className="flex justify-center py-10">
                              <Spin />
                        </div>
                  </section>
            );
      }

      return (
            <section>
                  <Title level={4} className="!mb-6 !text-gray-900">Quyền riêng tư</Title>
                  <Card bordered={false} className="!bg-gray-50 !rounded-xl !px-4">
                        <PrivacySelect
                              label="Ai có thể xem hồ sơ của tôi"
                              value={settings?.showProfile}
                              onChange={handleChange('showProfile')}
                              loading={updating}
                        />
                        <PrivacySelect
                              label="Ai có thể nhắn tin cho tôi"
                              value={settings?.whoCanMessageMe}
                              onChange={handleChange('whoCanMessageMe')}
                              loading={updating}
                        />
                        <PrivacySelect
                              label="Ai có thể gọi điện cho tôi"
                              value={settings?.whoCanCallMe}
                              onChange={handleChange('whoCanCallMe')}
                              loading={updating}
                        />
                  </Card>
                  <p className="mt-3 text-xs text-gray-400 pl-1">
                        Thay đổi có hiệu lực ngay lập tức.
                  </p>
            </section>
      );
}

// ============================================================================
// Section registry
// ============================================================================

type SectionKey = 'appearance' | 'language' | 'privacy';

const MENU_ITEMS = [
      { key: 'appearance' as SectionKey, icon: <BgColorsOutlined />, label: 'Giao diện' },
      { key: 'language' as SectionKey, icon: <GlobalOutlined />, label: 'Ngôn ngữ' },
      { key: 'privacy' as SectionKey, icon: <LockOutlined />, label: 'Quyền riêng tư' },
];

const SECTIONS: Record<SectionKey, ReactNode> = {
      appearance: <AppearanceSection />,
      language: <LanguageSection />,
      privacy: <PrivacySection />,
};

// ============================================================================
// SettingsPage (root)
// ============================================================================

export function SettingsPage() {
      const [activeKey, setActiveKey] = useState<SectionKey>('appearance');

      return (
            <Layout className="h-screen bg-white">
                  {/* Left navigation */}
                  <Sider
                        width={220}
                        className="!bg-gray-50 !border-r !border-gray-200 !h-full"
                  >
                        <div className="px-4 pt-6 pb-4">
                              <Title level={5} className="!text-gray-500 !uppercase !text-xs !tracking-widest !mb-0">
                                    Cài đặt
                              </Title>
                        </div>
                        <Menu
                              mode="inline"
                              selectedKeys={[activeKey]}
                              onClick={({ key }) => setActiveKey(key as SectionKey)}
                              className="!bg-gray-50 !border-none settings-menu"
                              items={MENU_ITEMS}
                        />
                  </Sider>

                  {/* Main content */}
                  <Content className="overflow-y-auto">
                        <div className="max-w-2xl px-10 py-8">
                              {SECTIONS[activeKey]}
                        </div>
                  </Content>
            </Layout>
      );
}
