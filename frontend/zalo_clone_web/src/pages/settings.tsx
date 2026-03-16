/**
 * SettingsPage
 *
 * Three sections: Appearance · Language · Privacy.
 *
 * Privacy bug fix:
 *   - Local form state is initialised from server data via useEffect.
 *   - Select.onChange writes ONLY to local state, never fires a PATCH.
 *   - Explicit "Lưu thay đổi" button + Modal.confirm triggers the update.
 *   This prevents the spurious PATCH that happened when Ant Design Select
 *   fired onChange on the undefined → loaded-value controlled transition.
 *
 * Dark-mode: tailwind.config has `darkMode: 'class'` (already set) and
 *   useAppStore.setTheme toggles document.documentElement.classList.
 *   Antd uses its darkAlgorithm via providers.tsx.
 */

import { useState } from 'react';
import {
      Layout,
      Menu,
      Typography,
      Segmented,
      Select,
      Spin,
      Button,
      Modal,
      Divider,
} from 'antd';
import {
      BgColorsOutlined,
      GlobalOutlined,
      LockOutlined,
      SaveOutlined,
      SoundOutlined,
      DesktopOutlined,
} from '@ant-design/icons';
import { NotificationSoundSection } from '@/features/notification/components/notification-sound-section';
import { DeviceList } from '@/features/device';
import { useAppStore } from '@/stores/use-app-store';
import { usePrivacySettings, useUpdatePrivacySettings } from '@/features/privacy/api/privacy.api';
import type { PrivacyLevel } from '@/features/privacy/types';

const { Sider, Content } = Layout;
const { Title, Text, Paragraph } = Typography;

// ============================================================================
// Shared primitives
// ============================================================================

function SectionCard({ children }: { children: React.ReactNode }) {
      return (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  {children}
            </div>
      );
}

function SettingRow({
      label,
      description,
      control,
      last = false,
}: {
      label: string;
      description?: string;
      control: React.ReactNode;
      last?: boolean;
}) {
      return (
            <div
                  className={`flex items-center justify-between gap-4 px-6 py-4${!last ? ' border-b border-gray-50' : ''
                        }`}
            >
                  <div className="min-w-0">
                        <Text className="text-sm font-medium text-gray-800 block">
                              {label}
                        </Text>
                        {description && (
                              <Text className="text-xs text-gray-400 mt-0.5 block">
                                    {description}
                              </Text>
                        )}
                  </div>
                  <div className="flex-shrink-0">{control}</div>
            </div>
      );
}

// ============================================================================
// Section: Appearance
// ============================================================================

function AppearanceSection() {
      const { theme, setTheme } = useAppStore();

      return (
            <div className="space-y-6">
                  <div>
                        <Title level={4} className="!text-gray-900 dark:!text-white !mb-1">
                              Giao diện
                        </Title>
                        <Paragraph className="!text-gray-500 dark:!text-gray-400 !text-sm !mb-0">
                              Tùy chỉnh cách ứng dụng hiển thị trên thiết bị của bạn.
                        </Paragraph>
                  </div>

                  <SectionCard>
                        <SettingRow
                              label="Chủ đề màu sắc"
                              description="Chọn giao diện sáng hoặc tối"
                              last
                              control={
                                    <Segmented
                                          value={theme}
                                          onChange={(v) => setTheme(v as 'light' | 'dark')}
                                          options={[
                                                { label: '☀️  Sáng', value: 'light' },
                                                { label: '🌙 Tối', value: 'dark' },
                                          ]}
                                    />
                              }
                        />
                  </SectionCard>

                  <div className="rounded-xl bg-blue-50 border border-blue-100 px-5 py-4">
                        <Text className="text-xs text-blue-600">
                              Chủ đề tối giúp giảm mỏi mắt khi sử dụng vào ban đêm và tiết kiệm pin trên màn hình OLED.
                        </Text>
                  </div>
            </div>
      );
}

// ============================================================================
// Section: Language
// ============================================================================

function LanguageSection() {
      const { language, setLanguage } = useAppStore();

      return (
            <div className="space-y-6">
                  <div>
                        <Title level={4} className="!text-gray-900 dark:!text-white !mb-1">
                              Ngôn ngữ
                        </Title>
                        <Paragraph className="!text-gray-500 dark:!text-gray-400 !text-sm !mb-0">
                              Chọn ngôn ngữ hiển thị của ứng dụng.
                        </Paragraph>
                  </div>

                  <SectionCard>
                        <SettingRow
                              label="Ngôn ngữ hiển thị"
                              description="Áp dụng cho toàn bộ giao diện"
                              last
                              control={
                                    <Segmented
                                          value={language}
                                          onChange={(v) => setLanguage(v as string)}
                                          options={[
                                                { label: 'Tiếng Việt', value: 'vi' },
                                                { label: 'English', value: 'en' },
                                          ]}
                                    />
                              }
                        />
                  </SectionCard>
            </div>
      );
}

// ============================================================================
// Section: Privacy
// ============================================================================

type PrivacyField = 'showProfile' | 'whoCanMessageMe' | 'whoCanCallMe';

interface PrivacyFormState {
      showProfile: PrivacyLevel;
      whoCanMessageMe: PrivacyLevel;
      whoCanCallMe: PrivacyLevel;
}

const PRIVACY_ROWS: { field: PrivacyField; label: string; description: string }[] = [
      {
            field: 'showProfile',
            label: 'Xem hồ sơ của tôi',
            description: 'Ai có thể xem ảnh đại diện, tên và thông tin cá nhân',
      },
      {
            field: 'whoCanMessageMe',
            label: 'Nhắn tin cho tôi',
            description: 'Ai có thể bắt đầu cuộc trò chuyện với bạn',
      },
      {
            field: 'whoCanCallMe',
            label: 'Gọi điện cho tôi',
            description: 'Ai có thể thực hiện cuộc gọi thoại / video',
      },
];

function PrivacySection() {
      const { data: serverSettings, isLoading } = usePrivacySettings();
      const { mutate: update, isPending } = useUpdatePrivacySettings();

      /*
       * localEdits holds ONLY the fields the user has changed this session.
       * The merged `form` is derived during render: server baseline + local overrides.
       * This eliminates the useEffect+setState pattern that the React Compiler flags.
       */
      const [localEdits, setLocalEdits] = useState<Partial<PrivacyFormState>>({});

      // Derived — no effect needed
      const form: PrivacyFormState | null = serverSettings
            ? {
                  showProfile: localEdits.showProfile ?? serverSettings.showProfile,
                  whoCanMessageMe: localEdits.whoCanMessageMe ?? serverSettings.whoCanMessageMe,
                  whoCanCallMe: localEdits.whoCanCallMe ?? serverSettings.whoCanCallMe,
            }
            : null;

      const isDirty = Object.keys(localEdits).length > 0;

      function handleFieldChange(field: PrivacyField) {
            // Writes to localEdits ONLY. Does NOT call update/PATCH.
            return (val: PrivacyLevel) =>
                  setLocalEdits((prev) => ({ ...prev, [field]: val }));
      }

      function handleSave() {
            if (!form) return;
            Modal.confirm({
                  title: 'Xác nhận cập nhật quyền riêng tư',
                  content: 'Thay đổi sẽ có hiệu lực ngay sau khi lưu.',
                  okText: 'Lưu thay đổi',
                  cancelText: 'Hủy',
                  centered: true,
                  onOk: () =>
                        update(form, {
                              // Clear local edits after successful save
                              onSuccess: () => setLocalEdits({}),
                        }),
            });
      }

      if (isLoading || form === null) {
            return (
                  <div className="space-y-6">
                        <div>
                              <Title level={4} className="!text-gray-900 dark:!text-white !mb-1">
                                    Quyền riêng tư
                              </Title>
                              <Paragraph className="!text-gray-500 !text-sm !mb-0">
                                    Kiểm soát ai có thể xem thông tin và liên hệ với bạn.
                              </Paragraph>
                        </div>
                        <div className="flex justify-center py-16">
                              <Spin size="large" />
                        </div>
                  </div>
            );
      }

      return (
            <div className="space-y-6">
                  <div className="flex items-start justify-between gap-4">
                        <div>
                              <Title level={4} className="!text-gray-900 dark:!text-white !mb-1">
                                    Quyền riêng tư
                              </Title>
                              <Paragraph className="!text-gray-500 dark:!text-gray-400 !text-sm !mb-0">
                                    Kiểm soát ai có thể xem thông tin và liên hệ với bạn.
                              </Paragraph>
                        </div>
                        {isDirty && (
                              <Button
                                    type="primary"
                                    icon={<SaveOutlined />}
                                    loading={isPending}
                                    onClick={handleSave}
                                    className="flex-shrink-0"
                              >
                                    Lưu thay đổi
                              </Button>
                        )}
                  </div>

                  <SectionCard>
                        {PRIVACY_ROWS.map((row, idx) => (
                              <SettingRow
                                    key={row.field}
                                    label={row.label}
                                    description={row.description}
                                    last={idx === PRIVACY_ROWS.length - 1}
                                    control={
                                          <Select<PrivacyLevel>
                                                value={form[row.field]}
                                                onChange={handleFieldChange(row.field)}
                                                disabled={isPending}
                                                className="w-48"
                                                options={[
                                                      { value: 'EVERYONE', label: 'Tất cả mọi người' },
                                                      { value: 'CONTACTS', label: 'Chỉ bạn bè' },
                                                ]}
                                          />
                                    }
                              />
                        ))}
                  </SectionCard>

                  {/* Unsaved changes banner */}
                  {isDirty && (
                        <div className="rounded-xl bg-amber-50 border border-amber-100 px-5 py-4">
                              <Text className="text-xs text-amber-600">
                                    ⚠️ Bạn có thay đổi chưa lưu. Nhấn &ldquo;Lưu thay đổi&rdquo; để áp dụng.
                              </Text>
                        </div>
                  )}
            </div>
      );
}

// ============================================================================
// Section switcher (lazy — hooks only run for the active section)
// ============================================================================

type SectionKey = 'appearance' | 'language' | 'privacy' | 'notifications' | 'devices';

const MENU_ITEMS = [
      { key: 'appearance' as SectionKey, icon: <BgColorsOutlined />, label: 'Giao diện' },
      { key: 'language' as SectionKey, icon: <GlobalOutlined />, label: 'Ngôn ngữ' },
      { key: 'privacy' as SectionKey, icon: <LockOutlined />, label: 'Quyền riêng tư' },
      { key: 'notifications' as SectionKey, icon: <SoundOutlined />, label: 'Âm thanh thông báo' },
      { key: 'devices' as SectionKey, icon: <DesktopOutlined />, label: 'Quản lý thiết bị' },
];

function ActiveSection({ activeKey }: { activeKey: SectionKey }) {
      switch (activeKey) {
            case 'appearance':
                  return <AppearanceSection />;
            case 'language':
                  return <LanguageSection />;
            case 'privacy':
                  return <PrivacySection />;
            case 'notifications':
                  return <NotificationSoundSection />;
            case 'devices':
                  return <DeviceList />;
      }
}

// ============================================================================
// SettingsPage (root)
// ============================================================================

export function SettingsPage() {
      const [activeKey, setActiveKey] = useState<SectionKey>('appearance');

      return (
            <Layout className="min-h-screen bg-gray-50">
                  {/* Left navigation */}
                  <Sider
                        width={240}
                        className="!bg-white dark:!bg-gray-950 !border-r !border-gray-100 dark:!border-gray-800 !min-h-screen"
                  >
                        <div className="px-5 pt-8 pb-5">
                              <Text className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                    Cài đặt
                              </Text>
                        </div>
                        <Divider className="!my-0 !border-gray-100 dark:!border-gray-800" />
                        <Menu
                              mode="inline"
                              selectedKeys={[activeKey]}
                              onClick={({ key }) => setActiveKey(key as SectionKey)}
                              className="!bg-transparent !border-none !mt-2 !px-2"
                              items={MENU_ITEMS}
                        />
                  </Sider>

                  {/* Centred content with max-width */}
                  <Content className="overflow-y-auto px-8 py-10">
                        <div className="mx-auto w-full max-w-xl">
                              <ActiveSection activeKey={activeKey} />
                        </div>
                  </Content>
            </Layout>
      );
}
