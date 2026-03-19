/**
 * Login Page
 * Đăng nhập với số điện thoại và mật khẩu
 * Tích hợp JWT auth flow từ backend
 */

// [THAY ĐỔI 1]: Import 'notification' thay vì 'Alert' và 'message'
import { Form, Input, Button, Card, Space, Typography, Divider, notification, Tabs } from 'antd';
import { UserOutlined, LockOutlined, QrcodeOutlined, MobileOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '@/features/auth';
import { useAuthStore } from '@/features/auth/stores/auth.store';
import { QrLoginView } from '@/features/auth/components/qr-login-view';
import { ROUTES } from '@/config/routes';
import { ApiError } from '@/lib/api-error';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

export function LoginPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  // [THAY ĐỔI 2]: Khởi tạo hook notification
  const [api, contextHolder] = notification.useNotification();
  const { t } = useTranslation();

  const redirectAfterAuth = () => {
    const currentUser = useAuthStore.getState().user;
    navigate(currentUser?.role === 'ADMIN' ? ROUTES.ADMIN_DASHBOARD : ROUTES.CHAT, {
      replace: true,
    });
  };

  const {
    login,
    isLoading,
    isAuthenticated,
    user,
    // error, // [THAY ĐỔI 3]: Không cần dùng state error này nữa vì ta sẽ bắn thông báo trực tiếp khi fail
    clearError,
  } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      navigate(user?.role === 'ADMIN' ? ROUTES.ADMIN_DASHBOARD : ROUTES.CHAT, {
        replace: true,
      });
    }
  }, [isAuthenticated, navigate, user]);

  const onFinish = async (values: { phoneNumber: string; password: string }) => {
    try {
      clearError();
      await login({
        phoneNumber: values.phoneNumber,
        password: values.password,
      });
      // Dùng notification thay cho message để đồng bộ
      api.success({
        message: t('auth.login.successTitle'),
        description: t('auth.login.successDesc'),
        placement: 'bottomRight',
      });
    } catch (err: unknown) {
      // [THAY ĐỔI 4]: Sử dụng notification error ở góc dưới phải
      api.error({
        message: t('auth.login.failTitle'),
        description: ApiError.from(err).message || t('auth.login.failDesc'),
        placement: 'bottomRight', // Vị trí hiển thị
        duration: 4.5, // Thời gian hiển thị (giây)
      });
    }
  };

  return (
    // [THAY ĐỔI 5]: Điều chỉnh CSS container để hỗ trợ scroll tốt hơn trên mobile
    // min-h-[100dvh]: Chiều cao tối thiểu bằng màn hình thiết bị
    // py-12: Padding trên dưới để khi scroll không bị sát lề
    <div className="min-h-[100dvh] flex flex-col justify-center items-center bg-gradient-to-br from-blue-50 to-indigo-50 px-4 py-12 overflow-y-auto">
      {/* contextHolder cần thiết để notification hoạt động khi dùng hook */}
      {contextHolder}
      <Card className="w-full max-w-md shadow-lg">
        <Space direction="vertical" className="w-full" size="large">
          <div className="text-center">
            <Title level={2} className="!mb-2">
              {t('auth.login.title')}
            </Title>
            <Text type="secondary">{t('auth.login.subtitle')}</Text>
          </div>

          {/* [THAY ĐỔI 6]: Đã XÓA đoạn code <Alert /> ở đây */}

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
                      // Fetch user profile to update auth state → triggers useEffect redirect
                      await useAuthStore.getState().initializeAuth();
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
                        {
                          message: t('auth.login.phoneInvalid'),
                        },
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