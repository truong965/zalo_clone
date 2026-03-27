import { useState } from 'react';
import { Form, Input, Button, Card, Space, Typography, Steps, notification, Result } from 'antd';
import { MailOutlined, KeyOutlined, LockOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import { authService } from '@/features/auth/api/auth.service';
import { ROUTES } from '@/config/routes';
import { ApiError } from '@/lib/api-error';

const { Title, Text } = Typography;

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [api, contextHolder] = notification.useNotification();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');

  // Step 1: Request OTP
  const onEmailSubmit = async (values: { email: string }) => {
    try {
      setIsLoading(true);
      await authService.forgotPassword({ email: values.email });
      setEmail(values.email);
      setCurrentStep(1);
      api.success({
        message: 'Thành công',
        description: 'Mã OTP đã được gửi đến email của bạn.',
        placement: 'bottomRight',
      });
    } catch (err) {
      api.error({
        message: 'Lỗi',
        description: ApiError.from(err).message || 'Không thể gửi yêu cầu. Vui lòng thử lại.',
        placement: 'bottomRight',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Step 2: Verify OTP
  const onOtpSubmit = async (values: { otp: string }) => {
    try {
      setIsLoading(true);
      await authService.verifyOtp({ email, otp: values.otp });
      setOtp(values.otp);
      setCurrentStep(2);
      api.success({
        message: 'Thành công',
        description: 'Mã OTP chính xác. Vui lòng đặt mật khẩu mới.',
        placement: 'bottomRight',
      });
    } catch (err) {
      api.error({
        message: 'Lỗi',
        description: ApiError.from(err).message || 'Mã OTP không hợp lệ.',
        placement: 'bottomRight',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Reset Password
  const onResetSubmit = async (values: { password: string }) => {
    try {
      setIsLoading(true);
      await authService.resetPassword({ email, otp, newPassword: values.password });
      setCurrentStep(3);
      api.success({
        message: 'Thành công',
        description: 'Mật khẩu của bạn đã được cập nhật.',
        placement: 'bottomRight',
      });
    } catch (err) {
      api.error({
        message: 'Lỗi',
        description: ApiError.from(err).message || 'Không thể cập nhật mật khẩu.',
        placement: 'bottomRight',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <Form layout="vertical" onFinish={onEmailSubmit} size="large">
            <Form.Item
              label="Email"
              name="email"
              rules={[
                { required: true, message: 'Vui lòng nhập email' },
                { type: 'email', message: 'Email không hợp lệ' },
              ]}
            >
              <Input prefix={<MailOutlined />} placeholder="example@gmail.com" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={isLoading}>
              Gửi mã xác nhận
            </Button>
          </Form>
        );
      case 1:
        return (
          <Form layout="vertical" onFinish={onOtpSubmit} size="large">
            <div className="mb-4 text-center">
              <Text type="secondary">Mã xác nhận đã được gửi đến: </Text>
              <Text strong>{email}</Text>
            </div>
            <Form.Item
              label="Mã OTP (6 chữ số)"
              name="otp"
              rules={[
                { required: true, message: 'Vui lòng nhập mã OTP' },
                { len: 6, message: 'Mã OTP phải có 6 chữ số' },
              ]}
            >
              <Input prefix={<KeyOutlined />} placeholder="000000" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={isLoading}>
              Tiếp tục
            </Button>
            <Button type="link" block className="mt-2" onClick={() => setCurrentStep(0)}>
              Thay đổi email
            </Button>
          </Form>
        );
      case 2:
        return (
          <Form layout="vertical" onFinish={onResetSubmit} size="large">
            <Form.Item
              label="Mật khẩu mới"
              name="password"
              rules={[
                { required: true, message: 'Vui lòng nhập mật khẩu mới' },
                { min: 6, message: 'Mật khẩu phải từ 6 ký tự' },
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="Nhập mật khẩu mới" />
            </Form.Item>
            <Form.Item
              label="Xác nhận mật khẩu"
              name="confirmPassword"
              dependencies={['password']}
              rules={[
                { required: true, message: 'Vui lòng xác nhận mật khẩu' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('Mật khẩu xác nhận không khớp'));
                  },
                }),
              ]}
            >
              <Input.Password prefix={<LockOutlined />} placeholder="Xác nhận mật khẩu mới" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={isLoading}>
              Cập nhật mật khẩu
            </Button>
          </Form>
        );
      case 3:
        return (
          <Result
            status="success"
            title="Sẵn sàng đăng nhập!"
            subTitle="Mật khẩu của bạn đã được thay đổi thành công."
            extra={[
              <Button type="primary" key="login" onClick={() => navigate(ROUTES.LOGIN)}>
                Quay lại đăng nhập
              </Button>
            ]}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col justify-center items-center bg-gradient-to-br from-blue-50 to-indigo-50 px-4 py-12">
      {contextHolder}
      <Card className="w-full max-w-md shadow-lg">
        <Space direction="vertical" className="w-full" size="middle">
          <div className="flex items-center mb-2">
            <Button 
                type="text" 
                icon={<ArrowLeftOutlined />} 
                onClick={() => currentStep > 0 && currentStep < 3 ? setCurrentStep(currentStep - 1) : navigate(ROUTES.LOGIN)}
            />
            <Title level={3} className="!mb-0 ml-2">
              Quên mật khẩu
            </Title>
          </div>

          <Steps 
            current={currentStep} 
            size="small" 
            className="mb-6"
            items={[
              { title: 'Email' },
              { title: 'OTP' },
              { title: 'Mật khẩu' },
            ]}
          />

          {renderCurrentStep()}
          
          {currentStep === 0 && (
            <div className="text-center mt-4">
              <Link to={ROUTES.LOGIN} className="text-sm text-blue-600 hover:text-blue-700">
                Quay lại trang đăng nhập
              </Link>
            </div>
          )}
        </Space>
      </Card>
    </div>
  );
}
