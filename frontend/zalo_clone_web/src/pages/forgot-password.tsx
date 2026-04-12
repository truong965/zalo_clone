import { useState } from 'react';
import { Form, Input, Button, Card, Space, Typography, Steps, notification, Result } from 'antd';
import { UserOutlined, LockOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import { authService } from '@/features/auth/api/auth.service';
import { ROUTES } from '@/config/routes';
import { ApiError } from '@/lib/api-error';
import { TwoFactorView } from '@/features/auth/components/two-factor-view';
import type { TwoFactorRequiredResponse } from '@/types/api';

const { Title, Text } = Typography;

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [api, contextHolder] = notification.useNotification();
  
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [twoFactorData, setTwoFactorData] = useState<TwoFactorRequiredResponse | null>(null);
  const [resetToken, setResetToken] = useState('');

  // Step 0: Request identity verification (Initiate 2FA)
  const onIdentifierSubmit = async (values: { identifier: string }) => {
    try {
      setIsLoading(true);
      const result = await authService.forgotPassword({ identifier: values.identifier });
      
      setIdentifier(values.identifier);
      
      if (result && 'status' in result && result.status === '2FA_REQUIRED') {
        setTwoFactorData(result);
        setCurrentStep(1);
      } else {
        // Unexpected success without 2FA (shouldn't happen with new logic)
        api.warning({
          message: 'Thông báo',
          description: 'Hệ thống không yêu cầu xác thực 2 lớp cho tài khoản này.',
          placement: 'bottomRight',
        });
      }
    } catch (err) {
      api.error({
        message: 'Lỗi',
        description: ApiError.from(err).message || 'Không tìm thấy tài khoản hoặc có lỗi xảy ra.',
        placement: 'bottomRight',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Step 1: Handling 2FA Success
  const handleTwoFactorSuccess = (result: any) => {
    if (result.status === 'RESET_TOKEN_ISSUED' && result.resetToken) {
      setResetToken(result.resetToken);
      setCurrentStep(2);
      api.success({
        message: 'Xác thực thành công',
        description: 'Vui lòng thiết lập mật khẩu mới cho tài khoản của bạn.',
        placement: 'bottomRight',
      });
    } else {
      api.error({
        message: 'Lỗi',
        description: 'Dữ liệu xác thực không hợp lệ. Vui lòng thử lại.',
        placement: 'bottomRight',
      });
    }
  };

  // Step 2: Final Reset Submit
  const onResetSubmit = async (values: { password: string }) => {
    try {
      setIsLoading(true);
      await authService.resetPassword({ resetToken, newPassword: values.password });
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
          <Form layout="vertical" onFinish={onIdentifierSubmit} size="large">
            <Text type="secondary" className="block mb-4">
              Nhập số điện thoại liên kết với tài khoản để bắt đầu quá trình khôi phục.
            </Text>
            <Form.Item
              label="Số điện thoại"
              name="identifier"
              rules={[
                { required: true, message: 'Vui lòng nhập số điện thoại' },
                { pattern: /^[0-9+]{8,15}$/, message: 'Số điện thoại không hợp lệ' },
              ]}
            >
              <Input prefix={<UserOutlined />} placeholder="0xxxxxxxxx" />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={isLoading}>
              Tiếp tục
            </Button>
          </Form>
        );
      case 1:
        return twoFactorData ? (
          <TwoFactorView 
            data={twoFactorData} 
            onSuccess={handleTwoFactorSuccess}
            onCancel={() => setCurrentStep(0)}
          />
        ) : null;
      case 2:
        return (
          <Form layout="vertical" onFinish={onResetSubmit} size="large">
             <div className="mb-4 text-center">
              <Text type="secondary">Đang khôi phục tài khoản: </Text>
              <Text strong>{identifier}</Text>
            </div>
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
      <Card className="w-full max-w-lg shadow-lg">
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
              { title: 'Nhập thông tin' },
              { title: 'Xác thực' },
              { title: 'Đặt mật khẩu' },
              { title: 'Hoàn tất' }
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
