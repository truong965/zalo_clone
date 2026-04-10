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
      SafetyOutlined,
      CheckCircleFilled,
      MobileOutlined,
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
import { useAuthStore } from '@/features/auth';

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
      const { user } = useAuth();
      const { t } = useTranslation();
      const [api, contextHolder] = notification.useNotification();

      const [isSubmitting, setIsSubmitting] = useState(false);

      // Email Change States
      const [emailModalStep, setEmailModalStep] = useState<'IDLE' | 'REQUEST' | 'CONFIRM'>('IDLE');
      const [newEmail, setNewEmail] = useState('');

      // 2FA States
      const [isTotpModalVisible, setIsTotpModalVisible] = useState(false);
      const [totpStep, setTotpStep] = useState<'INIT' | 'VERIFY'>('INIT');
      const [qrData, setQrData] = useState<{ qrCodeDataUrl: string; otpAuthUri: string } | null>(null);
      const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
      const [pendingMethod, setPendingMethod] = useState<'TOTP' | 'SMS' | 'EMAIL' | null>(null);

      const [isDeactivateModalVisible, setIsDeactivateModalVisible] = useState(false);
      const [isDeleteModalVisible, setIsDeleteModalVisible] = useState(false);

      const [passwordForm] = Form.useForm();
      const [emailRequestForm] = Form.useForm();
      const [emailConfirmForm] = Form.useForm();
      const [verifyForm] = Form.useForm();
      const [confirmPasswordForm] = Form.useForm();

      const handleChangePassword = async (values: {
            oldPassword: string;
            newPassword: string;
            logoutAllDevices?: boolean;
      }) => {
            Modal.confirm({
                  title: t('settings.security.confirmPasswordChangeTitle') || 'Xác nhận đổi mật khẩu',
                  content: t('settings.security.confirmPasswordChangeDesc') || 'Việc đổi mật khẩu sẽ đăng xuất bạn khỏi tất cả các thiết bị đang sử dụng (bao gồm cả trình duyệt này). Bạn có chắc chắn muốn tiếp tục?',
                  okText: t('common.confirm') || 'Tiếp tục',
                  cancelText: t('common.cancel') || 'Hủy',
                  onOk: async () => {
                        try {
                              setIsSubmitting(true);
                              await authService.changePassword({
                                    oldPassword: values.oldPassword,
                                    newPassword: values.newPassword,
                                    logoutAllDevices: true,
                              });

                              api.success({
                                    message: t('settings.security.passwordSuccess') || 'Thành công',
                                    description: t('settings.security.passwordSuccessDesc') || 'Mật khẩu đã được thay đổi. Bạn sẽ được đăng xuất ngay bây giờ.',
                              });
                              passwordForm.resetFields();

                              // Clear local auth state immediately and redirect to login
                              // We wait 1.5s so user can read the success notification
                              setTimeout(() => {
                                    useAuthStore.getState().reset();
                                    window.location.href = '/login';
                              }, 1500);
                        } catch (err) {
                              api.error({
                                    message: t('settings.security.passwordError') || 'Lỗi',
                                    description: ApiError.from(err).message || 'Không thể đổi mật khẩu.',
                              });
                        } finally {
                              setIsSubmitting(false);
                        }
                  }
            });
      };

      // --- EMAIL CHANGE FLOW ---

      const handleEmailRequest = async (values: { email: string; password: string }) => {
            try {
                  setIsSubmitting(true);
                  await authService.requestEmailChange(values.email, values.password);
                  setNewEmail(values.email);
                  setEmailModalStep('CONFIRM');
                  api.info({
                        message: 'Xác thực Email',
                        description: `Mã OTP đã được gửi tới ${values.email}. Vui lòng kiểm tra hộp thư.`,
                  });
            } catch (err) {
                  api.error({
                        message: 'Lỗi',
                        description: ApiError.from(err).message || 'Không thể yêu cầu đổi email.',
                  });
            } finally {
                  setIsSubmitting(false);
            }
      };

      const handleEmailConfirm = async (values: { otp: string }) => {
            try {
                  setIsSubmitting(true);
                  await authService.confirmEmailChange(values.otp);
                  api.success({
                        message: 'Thành công',
                        description: 'Email của bạn đã được cập nhật.',
                  });
                  setEmailModalStep('IDLE');
                  emailRequestForm.resetFields();
                  emailConfirmForm.resetFields();
                  // Force refresh user profile
                  window.location.reload();
            } catch (err) {
                  api.error({
                        message: 'Xác thực thất bại',
                        description: ApiError.from(err).message || 'Mã OTP không chính xác.',
                  });
            } finally {
                  setIsSubmitting(false);
            }
      };

      // --- 2FA FLOW ---

      const handleToggleMethod = async (method: 'TOTP' | 'SMS' | 'EMAIL') => {
            if (user?.twoFactorMethod === method) return;

            // 1. If switching to EMAIL but not linked yet
            if (method === 'EMAIL' && !user?.email) {
                  Modal.warning({
                        title: 'Yêu cầu liên kết Email',
                        content: 'Bạn cần liên kết địa chỉ email trước khi sử dụng phương thức xác thực này.',
                        okText: 'Liên kết ngay',
                        onOk: () => {
                              setEmailModalStep('REQUEST');
                              emailRequestForm.setFieldsValue({ email: '' });
                        }
                  });
                  return;
            }

            // 2. If switching to TOTP but not set up yet
            if (method === 'TOTP' && !user?.twoFactorSecret) {
                  setTotpStep('INIT');
                  setIsTotpModalVisible(true);
                  handleInitTotp();
                  return;
            }

            // Need password to enable or change method
            setPendingMethod(method);
            setIsPasswordModalVisible(true);
      };

      const handleInitTotp = async () => {
            try {
                  setIsSubmitting(true);
                  const response = await authService.init2faSetup(); // response is { message, data: {...} }
                  setQrData(response.data.data); // pick the nested 'data' object correctly
                  setTotpStep('INIT');
            } catch (err) {
                  api.error({ message: 'Lỗi', description: 'Không thể khởi tạo App Authenticator.' });
                  setIsTotpModalVisible(false);
            } finally {
                  setIsSubmitting(false);
            }
      };

      const handleConfirmTotp = async (values: { token: string }) => {
            try {
                  setIsSubmitting(true);
                  await authService.confirm2faSetup(values.token); // Assume this exists
                  api.success({ message: 'Thành công', description: 'Đã kích hoạt App Authenticator.' });
                  setIsTotpModalVisible(false);
                  window.location.reload();
            } catch (err) {
                  api.error({ message: 'Lỗi', description: 'Mã xác thực không đúng.' });
            } finally {
                  setIsSubmitting(false);
            }
      };

      const handleConfirmPasswordForMethod = async (values: { password: string }) => {
            if (!pendingMethod) return;
            try {
                  setIsSubmitting(true);
                  await authService.update2faMethod(pendingMethod, values.password);
                  api.success({ message: 'Thành công', description: `Đã đổi phương thức bảo mật sang ${pendingMethod}.` });
                  setIsPasswordModalVisible(false);
                  confirmPasswordForm.resetFields();
                  window.location.reload();
            } catch (err) {
                  api.error({ message: 'Lỗi', description: ApiError.from(err).message || 'Xác thực thất bại.' });
            } finally {
                  setIsSubmitting(false);
            }
      };

      const handleDeactivateAccount = async (values: { password: string }) => {
            try {
                  setIsSubmitting(true);
                  await authService.deactivateAccount(values.password);
                  window.location.href = '/login';
            } catch (err) {
                  api.error({
                        message: t('settings.security.error') || 'Lỗi',
                        description: ApiError.from(err).message || t('settings.security.deactivateError') || 'Không thể khóa tài khoản.',
                  });
            } finally {
                  setIsSubmitting(false);
            }
      };

      const handleDeleteAccount = async (values: { password: string }) => {
            if (!user?.id) return;
            try {
                  setIsSubmitting(true);
                  await authService.deleteAccount(user.id, values.password);
                  window.location.href = '/login';
            } catch (err) {
                  api.error({
                        message: t('settings.security.error') || 'Lỗi',
                        description: ApiError.from(err).message || t('settings.security.deleteError') || 'Không thể xóa tài khoản.',
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
                              {t('settings.security.description') || 'Quản lý phương thức đăng nhập và bảo vệ tài khoản.'}
                        </Paragraph>
                  </div>

                  {/* 2FA Section */}
                  <div className="mt-4">
                        <Title level={5} className="!text-gray-800 dark:!text-gray-200 !mb-4 flex items-center gap-2">
                              {t('settings.security.twoFactor')}
                              {user?.twoFactorEnabled ? (
                                    <Text type="success" className="text-xs font-normal bg-green-50 px-2 py-0.5 rounded-full border border-green-100 items-center gap-1 inline-flex">
                                          <CheckCircleFilled /> {t('settings.security.enabled')}
                                    </Text>
                              ) : (
                                    <Text type="warning" className="text-xs font-normal bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100 items-center gap-1 inline-flex">
                                          <ExclamationCircleOutlined /> {t('settings.security.disabled') || 'Chưa bật'}
                                    </Text>
                              )}
                        </Title>

                        <SectionCard>
                              <div className="divide-y divide-gray-50">
                                    {/* TOTP */}
                                    <div className="px-6 py-5 flex items-center justify-between">
                                          <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 text-xl">
                                                      <SafetyOutlined />
                                                </div>
                                                <div>
                                                      <Text className="text-sm font-medium text-gray-800 block">App Authenticator</Text>
                                                      <Text className="text-xs text-gray-400 block">Sử dụng Google/Microsoft Authenticator</Text>
                                                </div>
                                          </div>
                                          <div className="flex items-center gap-3">
                                                {user?.twoFactorMethod === 'TOTP' && <Text type="success" className="text-xs font-bold uppercase">Mặc định</Text>}
                                                <Button
                                                      size="small"
                                                      type={user?.twoFactorMethod === 'TOTP' ? 'dashed' : 'primary'}
                                                      onClick={() => handleToggleMethod('TOTP')}
                                                >
                                                      {user?.twoFactorSecret ? 'Thiết lập lại' : 'Thiết lập'}
                                                </Button>
                                          </div>
                                    </div>

                                    {/* SMS */}
                                    <div className="px-6 py-5 flex items-center justify-between">
                                          <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center text-green-600 text-xl">
                                                      <MobileOutlined />
                                                </div>
                                                <div>
                                                      <Text className="text-sm font-medium text-gray-800 block">SMS OTP</Text>
                                                      <Text className="text-xs text-gray-400 block">{user?.phoneNumber ? `Gửi mã tới ${user.phoneNumber.replace(/(\d{3})\d{4}(\d{3})/, '$1****$2')}` : 'Sử dụng số điện thoại đăng ký'}</Text>
                                                </div>
                                          </div>
                                          <div className="flex items-center gap-3">
                                                {user?.twoFactorMethod === 'SMS' && <Text type="success" className="text-xs font-bold uppercase">Mặc định</Text>}
                                                {user?.twoFactorMethod !== 'SMS' && (
                                                      <Button size="small" onClick={() => handleToggleMethod('SMS')}>
                                                            {user?.twoFactorEnabled ? 'Đặt làm mặc định' : 'Kích hoạt'}
                                                      </Button>
                                                )}
                                          </div>
                                    </div>

                                    {/* Email */}
                                    <div className="px-6 py-5 flex items-center justify-between">
                                          <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600 text-xl">
                                                      <MailOutlined />
                                                </div>
                                                <div>
                                                      <Text className="text-sm font-medium text-gray-800 block">Email OTP</Text>
                                                      <Text className="text-xs text-gray-400 block">{user?.email ? `Gửi mã tới ${user.email.substring(0, 3)}***@...` : 'Vui lòng cập nhật email trước'}</Text>
                                                </div>
                                          </div>
                                          <div className="flex items-center gap-3">
                                                {user?.twoFactorMethod === 'EMAIL' && <Text type="success" className="text-xs font-bold uppercase">Mặc định</Text>}
                                                {user?.email ? (
                                                      user?.twoFactorMethod !== 'EMAIL' && (
                                                            <Button size="small" onClick={() => handleToggleMethod('EMAIL')}>
                                                                  {user?.twoFactorEnabled ? 'Đặt làm mặc định' : 'Kích hoạt'}
                                                            </Button>
                                                      )
                                                ) : (
                                                      <Button size="small" type="link" onClick={() => setEmailModalStep('REQUEST')}>Cài đặt Email</Button>
                                                )}
                                          </div>
                                    </div>
                              </div>
                        </SectionCard>
                  </div>

                  {/* Email Section */}
                  <div className="mt-8">
                        <Title level={5} className="!text-gray-800 dark:!text-gray-200 !mb-4">
                              {t('settings.security.identityEmail') || 'Email định danh'}
                        </Title>
                        <SectionCard>
                              <SettingRow
                                    label="Địa chỉ Email"
                                    description={user?.email || (
                                          <span className="text-amber-500 flex items-center gap-1">
                                                <ExclamationCircleOutlined /> {t('settings.security.noEmail') || 'Chưa liên kết email'}
                                          </span>
                                    )}
                                    last
                                    control={
                                          <Button
                                                type={user?.email ? "default" : "primary"}
                                                size="small"
                                                onClick={() => {
                                                      setEmailModalStep('REQUEST');
                                                      emailRequestForm.setFieldsValue({ email: user?.email });
                                                }}
                                          >
                                                {user?.email ? (t('settings.security.changeEmail') || 'Thay đổi') : (t('settings.security.addEmail') || 'Liên kết ngay')}
                                          </Button>
                                    }
                              />
                        </SectionCard>
                        <div className="mt-2 text-center">
                              <Text type="secondary" className="text-xs">
                                    <InfoCircleOutlined className="mr-1" />
                                    Email này dùng để nhận mã xác thực và khôi phục tài khoản. Thay đổi email yêu cầu mật khẩu và xác thực OTP.
                              </Text>
                        </div>
                  </div>

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
                                          <Form.Item className="!mb-6">
                                                <Paragraph className="!text-gray-400 !text-xs italic !mb-0">
                                                      {t('settings.security.logoutInfo')}
                                                </Paragraph>
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

                  {/* Account Actions Section */}
                  <div className="mt-8">
                        <Title level={5} className="!text-red-600 dark:!text-red-400 !mb-4">
                              {t('settings.security.accountActions') || 'Tùy chọn tài khoản'}
                        </Title>
                        <SectionCard>
                              <div className="divide-y divide-gray-50">
                                    {user?.twoFactorEnabled && (
                                          <div className="px-6 py-4 flex items-center justify-between">
                                                <div>
                                                      <Text className="text-sm font-medium text-gray-800 block">
                                                            {t('settings.security.deactivateAccount') || 'Khóa tài khoản'}
                                                      </Text>
                                                      <Text className="text-xs text-gray-400 mt-0.5 block">
                                                            {t('settings.security.deactivateDesc') || 'Tạm thời vô hiệu hóa tài khoản của bạn.'}
                                                      </Text>
                                                </div>
                                                <Button
                                                      danger
                                                      onClick={() => {
                                                            setIsDeactivateModalVisible(true);
                                                            verifyForm.resetFields();
                                                      }}
                                                >
                                                      {t('settings.security.deactivate') || 'Khóa tài khoản'}
                                                </Button>
                                          </div>
                                    )}
                                    <div className="px-6 py-4 flex items-center justify-between">
                                          <div>
                                                <Text className="text-sm font-medium text-red-600 block">
                                                      {t('settings.security.deleteAccount') || 'Xóa tài khoản'}
                                                </Text>
                                                <Text className="text-xs text-gray-400 mt-0.5 block">
                                                      {t('settings.security.deleteDesc') || 'Xóa vĩnh viễn dữ liệu và tài khoản.'}
                                                </Text>
                                          </div>
                                          <Button
                                                type="primary"
                                                danger
                                                onClick={() => {
                                                      setIsDeleteModalVisible(true);
                                                      verifyForm.resetFields();
                                                }}
                                          >
                                                {t('settings.security.delete') || 'Xóa tài khoản'}
                                          </Button>
                                    </div>
                              </div>
                        </SectionCard>
                  </div>

                  {/* Email Change Modal */}
                  <Modal
                        title="Thay đổi Email liên kết"
                        open={emailModalStep !== 'IDLE'}
                        onCancel={() => setEmailModalStep('IDLE')}
                        footer={null}
                        centered
                        destroyOnClose
                  >
                        {emailModalStep === 'REQUEST' && (
                              <Form
                                    form={emailRequestForm}
                                    layout="vertical"
                                    onFinish={handleEmailRequest}
                              >
                                    <Paragraph className="text-gray-500 text-sm mb-6">
                                          Vui lòng nhập email mới và mật khẩu hiện tại để xác nhận thay đổi. Một mã OTP sẽ được gửi tới email mới.
                                    </Paragraph>
                                    <Form.Item
                                          label="Email mới"
                                          name="email"
                                          rules={[
                                                { required: true, message: 'Vui lòng nhập email' },
                                                { type: 'email', message: 'Email không hợp lệ' }
                                          ]}
                                    >
                                          <Input prefix={<MailOutlined />} placeholder="example@email.com" />
                                    </Form.Item>
                                    <Form.Item
                                          label="Mật khẩu hiện tại"
                                          name="password"
                                          rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}
                                    >
                                          <Input.Password prefix={<LockOutlined />} placeholder="******" />
                                    </Form.Item>
                                    <Button type="primary" htmlType="submit" loading={isSubmitting} block className="mt-4">
                                          Tiếp tục
                                    </Button>
                              </Form>
                        )}
                        {emailModalStep === 'CONFIRM' && (
                              <Form
                                    form={emailConfirmForm}
                                    layout="vertical"
                                    onFinish={handleEmailConfirm}
                              >
                                    <Paragraph className="text-gray-500 text-sm mb-6">
                                          Nhập mã xác thực gồm 6 chữ số đã được gửi tới <b>{newEmail}</b>
                                    </Paragraph>
                                    <Form.Item
                                          name="otp"
                                          rules={[{ required: true, len: 6, message: 'Mã OTP gồm 6 chữ số' }]}
                                    >
                                          <Input size="large" className="text-center tracking-widest text-lg font-bold" placeholder="000000" maxLength={6} />
                                    </Form.Item>
                                    <Button type="primary" htmlType="submit" loading={isSubmitting} block className="mt-4">
                                          Xác nhận thay đổi
                                    </Button>
                                    <Button type="link" block className="mt-2" onClick={() => setEmailModalStep('REQUEST')}>
                                          Quay lại
                                    </Button>
                              </Form>
                        )}
                  </Modal>

                  {/* TOTP Setup Modal */}
                  <Modal
                        title="Thiết lập App Authenticator"
                        open={isTotpModalVisible}
                        onCancel={() => setIsTotpModalVisible(false)}
                        footer={null}
                        centered
                        destroyOnClose
                        width={400}
                  >
                        {totpStep === 'INIT' && qrData && (
                              <div className="text-center">
                                    <Paragraph className="text-gray-500 text-sm mb-4">
                                          1. Quét mã QR này bằng Google Authenticator hoặc Microsoft Authenticator.
                                    </Paragraph>
                                    <div className="bg-white p-4 inline-block border rounded-xl mb-4">
                                          {qrData?.qrCodeDataUrl ? (
                                                <img src={qrData.qrCodeDataUrl} alt="QR Code" className="w-48 h-48" />
                                          ) : (
                                                <div className="w-48 h-48 flex items-center justify-center bg-gray-50 border border-dashed rounded italic text-gray-400">Loading QR...</div>
                                          )}
                                    </div>
                                    <div className="mb-6 text-center">
                                          {/* Manual code section removed for security */}
                                    </div>
                                    <Button type="primary" block onClick={() => setTotpStep('VERIFY')}>
                                          Tôi đã quét mã
                                    </Button>
                              </div>
                        )}
                        {totpStep === 'VERIFY' && (
                              <Form onFinish={handleConfirmTotp} layout="vertical">
                                    <Paragraph className="text-gray-500 text-sm mb-6">
                                          2. Nhập mã 6 số từ ứng dụng Authenticator để hoàn tất thiết lập.
                                    </Paragraph>
                                    <Form.Item
                                          name="token"
                                          rules={[{ required: true, len: 6, message: 'Mã gồm 6 chữ số' }]}
                                    >
                                          <Input size="large" className="text-center tracking-widest text-lg font-bold" placeholder="000000" maxLength={6} />
                                    </Form.Item>
                                    <Button type="primary" htmlType="submit" loading={isSubmitting} block>
                                          Xác nhận và Kích hoạt
                                    </Button>
                                    <Button type="link" block className="mt-2" onClick={() => setTotpStep('INIT')}>
                                          Xem lại mã QR
                                    </Button>
                              </Form>
                        )}
                  </Modal>

                  {/* Password Confirmation for 2FA Method Change */}
                  <Modal
                        title="Xác nhận bảo mật"
                        open={isPasswordModalVisible}
                        onCancel={() => {
                              setIsPasswordModalVisible(false);
                              confirmPasswordForm.resetFields();
                        }}
                        footer={null}
                        centered
                        destroyOnClose
                  >
                        <Form
                              form={confirmPasswordForm}
                              layout="vertical"
                              onFinish={handleConfirmPasswordForMethod}
                        >
                              <Paragraph className="text-gray-500 text-sm mb-6">
                                    Vui lòng nhập mật khẩu hiện tại để xác nhận thay đổi phương thức xác thực 2 lớp sang <b>{pendingMethod}</b>.
                              </Paragraph>
                              <Form.Item
                                    label="Mật khẩu hiện tại"
                                    name="password"
                                    rules={[{ required: true, message: 'Vui lòng nhập mật khẩu' }]}
                              >
                                    <Input.Password prefix={<LockOutlined />} placeholder="******" />
                              </Form.Item>
                              <Button type="primary" htmlType="submit" loading={isSubmitting} block className="mt-4">
                                    Xác nhận
                              </Button>
                        </Form>
                  </Modal>

                  {/* Deactivate Account Modal */}
                  <Modal
                        title={t('settings.security.deactivateTitle') || 'Khóa tài khoản'}
                        open={isDeactivateModalVisible}
                        onCancel={() => setIsDeactivateModalVisible(false)}
                        footer={null}
                        centered
                  >
                        <div className="mb-4 text-amber-600 bg-amber-50 p-4 rounded-lg flex gap-3">
                              <ExclamationCircleOutlined className="mt-1" />
                              <Text className="text-xs text-amber-700">
                                    {t('settings.security.deactivateWarning') || 'Lưu ý: Nếu khóa tài khoản thì lần đăng nhập tiếp theo sẽ kích hoạt lại. Bạn cần phải có 2FA để kích hoạt.'}
                              </Text>
                        </div>
                        <Form
                              form={verifyForm}
                              layout="vertical"
                              onFinish={handleDeactivateAccount}
                        >
                              <Form.Item
                                    label={t('settings.security.verifyPassword') || 'Nhập mật khẩu để tiếp tục'}
                                    name="password"
                                    rules={[{ required: true, message: t('settings.security.passwordRequired') || 'Vui lòng nhập mật khẩu' }]}
                              >
                                    <Input.Password prefix={<LockOutlined />} placeholder="******" />
                              </Form.Item>
                              <div className="flex justify-end gap-2 mt-6">
                                    <Button onClick={() => setIsDeactivateModalVisible(false)}>
                                          {t('settings.security.cancel') || 'Hủy'}
                                    </Button>
                                    <Button type="primary" danger htmlType="submit" loading={isSubmitting}>
                                          {t('settings.security.confirmDeactivate') || 'Xác nhận khóa'}
                                    </Button>
                              </div>
                        </Form>
                  </Modal>

                  {/* Delete Account Modal */}
                  <Modal
                        title={t('settings.security.deleteTitle') || 'Xóa tài khoản vĩnh viễn'}
                        open={isDeleteModalVisible}
                        onCancel={() => setIsDeleteModalVisible(false)}
                        footer={null}
                        centered
                  >
                        <div className="mb-4 text-red-600 bg-red-50 p-4 rounded-lg flex gap-3">
                              <ExclamationCircleOutlined className="mt-1" />
                              <Text className="text-xs text-red-700 font-medium">
                                    {t('settings.security.deleteWarning') || 'CẢNH BÁO: Thao tác này sẽ xóa vĩnh viễn tài khoản và toàn bộ dữ liệu tin nhắn, danh bạ của bạn. Hành động này không thể hoàn tác.'}
                              </Text>
                        </div>
                        <Form
                              form={verifyForm}
                              layout="vertical"
                              onFinish={handleDeleteAccount}
                        >
                              <Form.Item
                                    label={t('settings.security.verifyPasswordDelete') || 'Nhập mật khẩu để xác nhận xóa vĩnh viễn'}
                                    name="password"
                                    rules={[{ required: true, message: t('settings.security.passwordRequired') || 'Vui lòng nhập mật khẩu' }]}
                              >
                                    <Input.Password prefix={<LockOutlined />} placeholder="******" />
                              </Form.Item>
                              <div className="flex justify-end gap-2 mt-6">
                                    <Button onClick={() => setIsDeleteModalVisible(false)}>
                                          {t('settings.security.cancel') || 'Hủy'}
                                    </Button>
                                    <Button type="primary" danger htmlType="submit" loading={isSubmitting}>
                                          {t('settings.security.confirmDelete') || 'Xác nhận xóa vĩnh viễn'}
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
