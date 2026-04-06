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
import { useTranslation } from 'react-i18next';
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
      Checkbox,
} from 'antd';
import {
      BgColorsOutlined,
      GlobalOutlined,
      LockOutlined,
      SaveOutlined,
      SoundOutlined,
      DesktopOutlined,
      SafetyCertificateOutlined,
      MailOutlined,
      ExclamationCircleOutlined,
      InfoCircleOutlined,
} from '@ant-design/icons';
import { NotificationSoundSection } from '@/features/notification/components/notification-sound-section';
import { DeviceList } from '@/features/device';
import { useAppStore } from '@/stores/use-app-store';
import { usePrivacySettings, useUpdatePrivacySettings } from '@/features/privacy/api/privacy.api';
import type { PrivacyLevel } from '@/features/privacy/types';
import { useAuth } from '@/features/auth/hooks/use-auth';
import { authService } from '@/features/auth/api/auth.service';
import { Form, Input, notification } from 'antd';
import { ApiError } from '@/lib/api-error';

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
      description?: React.ReactNode;
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
      const { t } = useTranslation();

      return (
            <div className="space-y-6">
                  <div>
                        <Title level={4} className="!text-gray-900 dark:!text-white !mb-1">
                              {t('settings.appearance.title')}
                        </Title>
                        <Paragraph className="!text-gray-500 dark:!text-gray-400 !text-sm !mb-0">
                              {t('settings.appearance.description')}
                        </Paragraph>
                  </div>

                  <SectionCard>
                        <SettingRow
                              label={t('settings.appearance.themeColor')}
                              description={t('settings.appearance.themeColorDesc')}
                              last
                              control={
                                    <Segmented
                                          value={theme}
                                          onChange={(v) => setTheme(v as 'light' | 'dark')}
                                          options={[
                                                { label: t('settings.appearance.light'), value: 'light' },
                                                { label: t('settings.appearance.dark'), value: 'dark' },
                                          ]}
                                    />
                              }
                        />
                  </SectionCard>

                  <div className="rounded-xl bg-blue-50 border border-blue-100 px-5 py-4">
                        <Text className="text-xs text-blue-600">
                              {t('settings.appearance.darkThemeNote')}
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
      const { t } = useTranslation();

      return (
            <div className="space-y-6">
                  <div>
                        <Title level={4} className="!text-gray-900 dark:!text-white !mb-1">
                              {t('settings.language.title')}
                        </Title>
                        <Paragraph className="!text-gray-500 dark:!text-gray-400 !text-sm !mb-0">
                              {t('settings.language.description')}
                        </Paragraph>
                  </div>

                  <SectionCard>
                        <SettingRow
                              label={t('settings.language.displayLanguage')}
                              description={t('settings.language.displayLanguageDesc')}
                              last
                              control={
                                    <Segmented
                                          value={language}
                                          onChange={(v) => {
                                                setLanguage(v as string);
                                          }}
                                          options={[
                                                { label: t('settings.language.vi'), value: 'vi' },
                                                { label: t('settings.language.en'), value: 'en' },
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

const PRIVACY_ROWS: { field: PrivacyField; labelKey: string; descriptionKey: string }[] = [
      {
            field: 'showProfile',
            labelKey: 'settings.privacy.showProfile',
            descriptionKey: 'settings.privacy.showProfileDesc',
      },
      {
            field: 'whoCanMessageMe',
            labelKey: 'settings.privacy.whoCanMessageMe',
            descriptionKey: 'settings.privacy.whoCanMessageMeDesc',
      },
      {
            field: 'whoCanCallMe',
            labelKey: 'settings.privacy.whoCanCallMe',
            descriptionKey: 'settings.privacy.whoCanCallMeDesc',
      },
];

function PrivacySection() {
      const { t } = useTranslation();
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
                  title: t('settings.privacy.confirmTitle'),
                  content: t('settings.privacy.confirmContent'),
                  okText: t('settings.privacy.saveChanges'),
                  cancelText: t('settings.privacy.cancel'),
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
                                    {t('settings.privacy.title')}
                              </Title>
                              <Paragraph className="!text-gray-500 !text-sm !mb-0">
                                    {t('settings.privacy.description')}
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
                                    {t('settings.privacy.title')}
                              </Title>
                              <Paragraph className="!text-gray-500 dark:!text-gray-400 !text-sm !mb-0">
                                    {t('settings.privacy.description')}
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
                                    {t('settings.privacy.saveChanges')}
                              </Button>
                        )}
                  </div>

                  <SectionCard>
                        {PRIVACY_ROWS.map((row, idx) => (
                              <SettingRow
                                    key={row.field}
                                    label={t(row.labelKey)}
                                    description={t(row.descriptionKey)}
                                    last={idx === PRIVACY_ROWS.length - 1}
                                    control={
                                          <Select<PrivacyLevel>
                                                value={form[row.field]}
                                                onChange={handleFieldChange(row.field)}
                                                disabled={isPending}
                                                className="w-48"
                                                options={[
                                                      { value: 'EVERYONE', label: t('settings.privacy.everyone') },
                                                      { value: 'CONTACTS', label: t('settings.privacy.contacts') },
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
                                    ⚠️ {t('settings.privacy.unsavedChanges')}
                              </Text>
                        </div>
                  )}
            </div>
      );
}

// ============================================================================
// Section: Security
// ============================================================================

function SecuritySection() {
      const { user, updateProfile } = useAuth();
      const { t } = useTranslation();
      const [api, contextHolder] = notification.useNotification();
      const [isEmailModalVisible, setIsEmailModalVisible] = useState(false);
      const [isSubmitting, setIsSubmitting] = useState(false);
      const [passwordForm] = Form.useForm();
      const [emailForm] = Form.useForm();

      const handleChangePassword = async (values: {
            oldPassword: string;
            newPassword: string;
            logoutAllDevices?: boolean;
      }) => {
            try {
                  setIsSubmitting(true);
                  await authService.changePassword({
                        oldPassword: values.oldPassword,
                        newPassword: values.newPassword,
                        logoutAllDevices: values.logoutAllDevices ?? true,
                  });
              
                  api.success({
                        message: t('settings.security.passwordSuccess') || 'Thành công',
                        description: t('settings.security.passwordSuccessDesc') || 'Mật khẩu đã được thay đổi.',
                  });
                  passwordForm.resetFields();
            } catch (err) {
                  api.error({
                        message: t('settings.security.passwordError') || 'Lỗi',
                        description: ApiError.from(err).message || 'Không thể đổi mật khẩu.',
                  });
            } finally {
                  setIsSubmitting(false);
            }
      };

      const handleUpdateEmail = async (values: { email: string }) => {
            try {
                  setIsSubmitting(true);
                  await updateProfile({ email: values.email });
                  api.success({
                        message: t('settings.security.emailSuccess') || 'Thành công',
                        description: t('settings.security.emailSuccessDesc') || 'Email đã được cập nhật.',
                  });
                  setIsEmailModalVisible(false);
                  emailForm.resetFields();
            } catch (err) {
                  api.error({
                        message: t('settings.security.emailError') || 'Lỗi',
                        description: ApiError.from(err).message || 'Không thể cập nhật email.',
                  });
            } finally {
                  setIsSubmitting(false);
            }
      };

      return (
            <div className="space-y-6">
                  {contextHolder}
                  <div>
                        <Title level={4} className="!text-gray-900 dark:!text-white !mb-1">
                              {t('settings.security.title') || 'Bảo mật'}
                        </Title>
                        <Paragraph className="!text-gray-500 dark:!text-gray-400 !text-sm !mb-0">
                              {t('settings.security.description') || 'Quản lý mật khẩu và thông tin bảo mật của bạn.'}
                        </Paragraph>
                  </div>

                  {/* Email Section */}
                  <SectionCard>
                        <SettingRow
                              label="Email"
                              description={user?.email || (
                                    <span className="text-amber-500 flex items-center gap-1">
                                          <ExclamationCircleOutlined /> {t('settings.security.noEmail') || 'Chưa cập nhật email'}
                                    </span>
                              )}
                              last
                              control={
                                    <Button 
                                          type="link" 
                                          onClick={() => {
                                                setIsEmailModalVisible(true);
                                                emailForm.setFieldsValue({ email: user?.email });
                                          }}
                                    >
                                          {user?.email ? (t('settings.security.changeEmail') || 'Đổi email') : (t('settings.security.addEmail') || 'Thêm email')}
                                    </Button>
                              }
                        />
                  </SectionCard>

                  {!user?.email && (
                        <div className="rounded-xl bg-amber-50 border border-amber-100 px-5 py-4">
                              <Text className="text-xs text-amber-600">
                                    ⚠️ {t('settings.security.emailWarning') || 'Vui lòng cập nhật email để có thể khôi phục mật khẩu khi cần thiết.'}
                              </Text>
                        </div>
                  )}

                  {/* Password Change Section */}
                  <div className="mt-8">
                        <Title level={5} className="!text-gray-800 dark:!text-gray-200 !mb-4">
                              {t('settings.security.changePassword') || 'Đổi mật khẩu'}
                        </Title>
                        <SectionCard>
                              <div className="p-6">
                                    <Form
                                          form={passwordForm}
                                          layout="vertical"
                                          onFinish={handleChangePassword}
                                          requiredMark={false}
                                    >
                                          <Form.Item
                                                label={t('settings.security.oldPassword') || 'Mật khẩu hiện tại'}
                                                name="oldPassword"
                                                rules={[{ required: true, message: t('settings.security.oldPasswordRequired') || 'Vui lòng nhập mật khẩu hiện tại' }]}
                                          >
                                                <Input.Password prefix={<LockOutlined />} placeholder="******" />
                                          </Form.Item>
                                          <Form.Item
                                                label={t('settings.security.newPassword') || 'Mật khẩu mới'}
                                                name="newPassword"
                                                rules={[
                                                      { required: true, message: t('settings.security.newPasswordRequired') || 'Vui lòng nhập mật khẩu mới' },
                                                      { min: 6, message: t('settings.security.passwordMin') || 'Mật khẩu phải từ 6 ký tự' }
                                                ]}
                                          >
                                                <Input.Password prefix={<LockOutlined />} placeholder="******" />
                                          </Form.Item>
                                          <Form.Item
                                                label={t('settings.security.confirmPassword') || 'Xác nhận mật khẩu mới'}
                                                name="confirmPassword"
                                                dependencies={['newPassword']}
                                                rules={[
                                                      { required: true, message: t('settings.security.confirmPasswordRequired') || 'Vui lòng xác nhận mật khẩu mới' },
                                                      ({ getFieldValue }) => ({
                                                            validator(_, value) {
                                                                  if (!value || getFieldValue('newPassword') === value) {
                                                                        return Promise.resolve();
                                                                  }
                                                                  return Promise.reject(new Error(t('settings.security.passwordMismatch') || 'Mật khẩu xác nhận không khớp'));
                                                            },
                                                      }),
                                                ]}
                                          >
                                                <Input.Password prefix={<LockOutlined />} placeholder="******" />
                                          </Form.Item>
                                          <Form.Item
                                                name="logoutAllDevices"
                                                valuePropName="checked"
                                                initialValue={true}
                                                className="mb-4"
                                            >
                                                <Checkbox>
                                                      {t('settings.security.logoutAllDevices') || 'Đăng xuất khỏi tất cả các thiết bị khác'}
                                                </Checkbox>
                                          </Form.Item>
                                          <Button type="primary" htmlType="submit" loading={isSubmitting} block>
                                                {t('settings.security.updatePassword') || 'Cập nhật mật khẩu'}
                                          </Button>
                                    </Form>
                                    <div className="mt-4 text-center">
                                          <Text type="secondary" className="text-xs">
                                                <InfoCircleOutlined className="mr-1" />
                                                {t('settings.security.logoutInfo') || 'Hệ thống sẽ cập nhật phiên bản bảo mật để bảo vệ tài khoản của bạn.'}
                                          </Text>
                                    </div>
                              </div>
                        </SectionCard>
                  </div>

                  {/* Email Update Modal */}
                  <Modal
                        title={t('settings.security.updateEmailTitle') || 'Cập nhật Email'}
                        open={isEmailModalVisible}
                        onCancel={() => setIsEmailModalVisible(false)}
                        footer={null}
                        centered
                  >
                        <Form
                              form={emailForm}
                              layout="vertical"
                              onFinish={handleUpdateEmail}
                              initialValues={{ email: user?.email }}
                              className="mt-4"
                        >
                              <Form.Item
                                    label="Email"
                                    name="email"
                                    rules={[
                                          { required: true, message: t('settings.security.emailRequired') || 'Vui lòng nhập email' },
                                          { type: 'email', message: t('settings.security.emailInvalid') || 'Email không hợp lệ' }
                                    ]}
                              >
                                    <Input prefix={<MailOutlined />} placeholder="example@gmail.com" />
                              </Form.Item>
                              <div className="flex justify-end gap-2 mt-6">
                                    <Button onClick={() => setIsEmailModalVisible(false)}>
                                          {t('settings.security.cancel') || 'Hủy'}
                                    </Button>
                                    <Button type="primary" htmlType="submit" loading={isSubmitting}>
                                          {t('settings.security.save') || 'Lưu'}
                                    </Button>
                              </div>
                        </Form>
                  </Modal>
            </div>
      );
}

// ============================================================================
// Section switcher (lazy — hooks only run for the active section)
// ============================================================================

type SectionKey = 'appearance' | 'language' | 'privacy' | 'security' | 'notifications' | 'devices';

function ActiveSection({ activeKey }: { activeKey: SectionKey }) {
      switch (activeKey) {
            case 'appearance':
                  return <AppearanceSection />;
            case 'language':
                  return <LanguageSection />;
            case 'privacy':
                  return <PrivacySection />;
            case 'security':
                  return <SecuritySection />;
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
      const { t } = useTranslation();

      const MENU_ITEMS = [
            { key: 'appearance' as SectionKey, icon: <BgColorsOutlined />, label: t('settings.menu.appearance') },
            { key: 'language' as SectionKey, icon: <GlobalOutlined />, label: t('settings.menu.language') },
            { key: 'privacy' as SectionKey, icon: <LockOutlined />, label: t('settings.menu.privacy') },
            { key: 'security' as SectionKey, icon: <SafetyCertificateOutlined />, label: t('settings.menu.security') || 'Bảo mật' },
            { key: 'notifications' as SectionKey, icon: <SoundOutlined />, label: t('settings.menu.notifications') },
            { key: 'devices' as SectionKey, icon: <DesktopOutlined />, label: t('settings.menu.devices') },
      ];

      return (
            <Layout className="min-h-screen bg-gray-50">
                  {/* Left navigation */}
                  <Sider
                        width={240}
                        className="!bg-white dark:!bg-gray-950 !border-r !border-gray-100 dark:!border-gray-800 !min-h-screen"
                  >
                        <div className="px-5 pt-8 pb-5">
                              <Text className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                    {t('settings.title')}
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
