/**
 * Login Page
 * Đăng nhập với số điện thoại và mật khẩu
 * Tích hợp JWT auth flow từ backend
 */

import { Form, Input, Button, Card, Space, Typography, Divider, notification, Tabs } from 'antd';
import { UserOutlined, LockOutlined, QrcodeOutlined, MobileOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import { QrLoginView } from '@/features/auth/components/qr-login-view';
import { TwoFactorView } from '@/features/auth/components/two-factor-view';
import { ROUTES } from '@/config/routes';
import { ApiError } from '@/lib/api-error';
import { useTranslation } from 'react-i18next';
import type { TwoFactorRequiredResponse } from '@/types/api';

const { Title, Text } = Typography;

export function LoginPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [api, contextHolder] = notification.useNotification();
  const { t } = useTranslation();

  const {
    login,
    isLoading,
    isAuthenticated,
    user,
    clearError,
  } = useAuth();

  // State cho 2FA
  const [twoFactorData, setTwoFactorData] = useState<TwoFactorRequiredResponse | null>(null);

  useEffect(() => {
    if (isAuthenticated && !twoFactorData) {
      navigate(user?.role === 'ADMIN' ? ROUTES.ADMIN_DASHBOARD : ROUTES.CHAT, {
        replace: true,
      });
    }
  }, [isAuthenticated, navigate, user, twoFactorData]);

  const onFinish = async (values: { phoneNumber: string; password: string }) => {
    try {
      clearError();
      const result = await login({
        phoneNumber: values.phoneNumber,
        password: values.password,
      });

      // Nếu yêu cầu 2FA (Bao gồm cả Reactivation)
      if (result && 'status' in result && result.status === '2FA_REQUIRED') {
        setTwoFactorData(result as TwoFactorRequiredResponse);
        return;
      }

      // Đăng nhập thành công (không có 2FA)
      api.success({
        message: t('auth.login.successTitle'),
        description: t('auth.login.successDesc'),
        placement: 'bottomRight',
      });
    } catch (err: unknown) {
      const apiError = ApiError.from(err);

      api.error({
        message: t('auth.login.failTitle'),
        description: apiError.message || t('auth.login.failDesc'),
        placement: 'bottomRight',
        duration: 4.5,
      });
    }
  };

  const redirectAfterAuth = () => {
    const currentUser = useAuthStore.getState().user;
    navigate(currentUser?.role === 'ADMIN' ? ROUTES.ADMIN_DASHBOARD : ROUTES.CHAT, {
      replace: true,
    });
  };

  return (
    <div className="min-h-[100dvh] flex flex-col justify-center items-center bg-gradient-to-br from-blue-50 to-indigo-50 px-4 py-12 overflow-y-auto">
      {contextHolder}
      <Card className="w-full max-w-md shadow-lg">
        <Space direction="vertical" className="w-full" size="large">
          {!twoFactorData ? (
            <>
              <div className="text-center">
                <Title level={2} className="!mb-2">
                  {t('auth.login.title')}
                </Title>
                <Text type="secondary">{t('auth.login.subtitle')}</Text>
              </div>

              <Tabs
                centered
                className="mt-2"
                items={[
                  {
                    key: 'qr',
                    label: (
                      <span className="flex items-center gap-1">
                        <QrcodeOutlined />
                        {t('auth.login.qrLogin')}
                      </span>
                    ),
                    children: (
                      <QrLoginView
                        onLoginSuccess={async () => {
                          api.success({
                            message: t('auth.login.successTitle'),
                            description: t('auth.login.qrSuccessDesc'),
                            placement: 'bottomRight',
                          });
                          redirectAfterAuth();
                        }}
                        onError={(msg) => {
                          api.error({
                            message: t('auth.login.errorTitle'),
                            description: msg,
                            placement: 'bottomRight',
                          });
                        }}
                      />
                    ),
                  },
                  {
                    key: 'password',
                    label: (
                      <span className="flex items-center gap-1">
                        <MobileOutlined />
                        {t('auth.login.phoneLogin')}
                      </span>
                    ),
                    children: (
                      <Form
                        form={form}
                        layout="vertical"
                        onFinish={onFinish}
                        requiredMark="optional"
                        size="large"
                      >
                        <Form.Item
                          label={t('auth.login.phoneLabel')}
                          name="phoneNumber"
                          rules={[
                            { required: true, message: t('auth.login.phoneRequired') },
                            { pattern: /^((\+84)|(84)|0)\d{9}$/, message: t('auth.login.phoneInvalid') },
                          ]}
                        >
                          <Input
                            prefix={<UserOutlined />}
                            placeholder={t('auth.login.phonePlaceholder')}
                            disabled={isLoading}
                          />
                        </Form.Item>

                        <Form.Item
                          label={t('auth.login.passwordLabel')}
                          name="password"
                          rules={[
                            { required: true, message: t('auth.login.passwordRequired') },
                            {
                              min: 6,
                              message: t('auth.login.passwordMin'),
                            },
                          ]}
                        >
                          <Input.Password
                            prefix={<LockOutlined />}
                            placeholder={t('auth.login.passwordPlaceholder')}
                            disabled={isLoading}
                          />
                        </Form.Item>

                        <div className="flex justify-end mb-4">
                          <Link to={ROUTES.FORGOT_PASSWORD} className="text-sm text-blue-600 hover:text-blue-700">
                            {t('auth.login.forgotPassword') || 'Quên mật khẩu?'}
                          </Link>
                        </div>

                        <Form.Item>
                          <Button
                            type="primary"
                            htmlType="submit"
                            block
                            size="large"
                            loading={isLoading}
                            disabled={isLoading}
                          >
                            {isLoading ? t('auth.login.loading') : t('auth.login.submit')}
                          </Button>
                        </Form.Item>
                      </Form>
                    ),
                  },
                ]}
              />
            </>
          ) : (
            <TwoFactorView 
              data={twoFactorData} 
              onSuccess={() => {
                api.success({
                  message: t('auth.login.successTitle'),
                  description: t('auth.login.successDesc'),
                  placement: 'bottomRight',
                });
                redirectAfterAuth();
              }}
              onCancel={() => setTwoFactorData(null)}
            />
          )}

          <Divider>{t('auth.login.or')}</Divider>

          <div className="text-center">
            <Text>{t('auth.login.noAccount')}</Text>
            <Link to="/register" className="font-semibold text-blue-600 hover:text-blue-700">
              {t('auth.login.registerNow')}
            </Link>
          </div>
        </Space>
      </Card>
    </div>
  );
}