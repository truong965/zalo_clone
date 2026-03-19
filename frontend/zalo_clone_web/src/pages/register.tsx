/**
 * Register Page
 * Fix: Cấu trúc cuộn chuyên nghiệp cho Mobile & Desktop
 */

import { Form, Input, Button, Card, Space, Typography, Divider, notification, Select } from 'antd';
import { UserOutlined, LockOutlined, PhoneOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '@/features/auth';
import { ROUTES } from '@/config/routes';
import { ApiError } from '@/lib/api-error';
import type { RegisterRequest } from '@/types';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;

export function RegisterPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [api, contextHolder] = notification.useNotification();
  const { t } = useTranslation();

  const { register, isLoading, isAuthenticated, clearError } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      navigate(ROUTES.CHAT);
    }
  }, [isAuthenticated, navigate]);

  const onFinish = async (values: RegisterRequest) => {
    try {
      clearError();
      await register({
        displayName: values.displayName,
        phoneNumber: values.phoneNumber,
        password: values.password,
        gender: values.gender,
        dateOfBirth: values.dateOfBirth,
      });
      api.success({
        message: t('auth.register.successTitle'),
        description: t('auth.register.successDesc'),
        placement: 'topRight',
        duration: 5,
      });
      setTimeout(() => navigate(ROUTES.LOGIN), 1500);
    } catch (err: unknown) {
      api.error({
        message: t('auth.register.failTitle'),
        description: ApiError.from(err).message || t('auth.register.failDesc'),
        placement: 'topRight',
      });
    }
  };

  return (
    /* FIX: 
      - overflow-y-auto: Đảm bảo vùng này có thể cuộn.
      - py-10: Tạo khoảng trống trên/dưới để Card không dính sát mép khi cuộn.
    */
    <div className="min-h-screen w-full bg-gradient-to-br from-blue-50 to-indigo-50 flex justify-center overflow-y-auto py-10 px-4">
      {contextHolder}

      {/* h-fit: Giúp div co giãn theo nội dung thay vì cố gắng lấp đầy chiều cao */}
      <div className="w-full max-w-md h-fit">
        <Card className="shadow-lg w-full border-none sm:border-solid">
          <Space direction="vertical" className="w-full" size="large">
            <div className="text-center">
              <Title level={2} className="!mb-2">{t('auth.register.title')}</Title>
              <Text type="secondary">{t('auth.register.subtitle')}</Text>
            </div>

            <Form
              form={form}
              layout="vertical"
              onFinish={onFinish}
              requiredMark="optional"
              size="large"
            >
              <Form.Item
                label={t('auth.register.displayNameLabel')}
                name="displayName"
                rules={[{ required: true, message: t('auth.register.displayNameRequired') }]}
              >
                <Input prefix={<UserOutlined />} placeholder={t('auth.register.displayNamePlaceholder')} />
              </Form.Item>

              <Form.Item
                label={t('auth.register.phoneLabel')}
                name="phoneNumber"
                rules={[
                  { required: true, message: t('auth.register.phoneRequired') },
                  { pattern: /(84|0[3|5|7|8|9])+([0-9]{8})\b/g, message: t('auth.register.phoneInvalid') },
                ]}
              >
                <Input prefix={<PhoneOutlined />} placeholder={t('auth.register.phonePlaceholder')} />
              </Form.Item>

              <Form.Item
                label={t('auth.register.passwordLabel')}
                name="password"
                rules={[{ required: true, message: t('auth.register.passwordRequired') }, { min: 6, message: t('auth.register.passwordMin') }]}
              >
                <Input.Password prefix={<LockOutlined />} placeholder={t('auth.register.passwordPlaceholder')} />
              </Form.Item>

              <Form.Item
                label={t('auth.register.confirmPasswordLabel')}
                name="confirmPassword"
                dependencies={['password']}
                rules={[
                  { required: true, message: t('auth.register.confirmPasswordRequired') },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) return Promise.resolve();
                      return Promise.reject(new Error(t('auth.register.confirmPasswordMatch')));
                    },
                  }),
                ]}
              >
                <Input.Password prefix={<LockOutlined />} placeholder={t('auth.register.confirmPasswordPlaceholder')} />
              </Form.Item>

              <div className="grid grid-cols-2 gap-4">
                <Form.Item label={t('auth.register.genderLabel')} name="gender" className="mb-0">
                  <Select placeholder={t('auth.register.genderPlaceholder')}>
                    <Select.Option value="MALE">{t('auth.register.male')}</Select.Option>
                    <Select.Option value="FEMALE">{t('auth.register.female')}</Select.Option>
                  </Select>
                </Form.Item>

                <Form.Item label={t('auth.register.dobLabel')} name="dateOfBirth" className="mb-0">
                  <Input type="date" max={new Date().toISOString().split('T')[0]} />
                </Form.Item>
              </div>

              <Form.Item className="mt-8 mb-0">
                <Button type="primary" htmlType="submit" block size="large" loading={isLoading}>
                  {isLoading ? t('auth.register.loading') : t('auth.register.submit')}
                </Button>
              </Form.Item>
            </Form>

            <Divider className="my-2">{t('auth.register.or')}</Divider>

            <div className="text-center pb-2">
              <Text>{t('auth.register.haveAccount')} </Text>
              <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700">
                {t('auth.register.loginNow')}
              </Link>
            </div>
          </Space>
        </Card>
      </div>
    </div>
  );
}