/**
 * Login Page
 * Đăng nhập với số điện thoại và mật khẩu
 * Tích hợp JWT auth flow từ backend
 */

// [THAY ĐỔI 1]: Import 'notification' thay vì 'Alert' và 'message'
import { Form, Input, Button, Card, Space, Typography, Divider, notification } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '@/features/auth';
import { ROUTES } from '@/config/routes';
import { ApiError } from '@/lib/api-error';

const { Title, Text } = Typography;

export function LoginPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  // [THAY ĐỔI 2]: Khởi tạo hook notification
  const [api, contextHolder] = notification.useNotification();

  const {
    login,
    isLoading,
    isAuthenticated,
    // error, // [THAY ĐỔI 3]: Không cần dùng state error này nữa vì ta sẽ bắn thông báo trực tiếp khi fail
    clearError,
  } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      navigate(ROUTES.CHAT);
    }
  }, [isAuthenticated, navigate]);

  const onFinish = async (values: { phoneNumber: string; password: string }) => {
    try {
      clearError();
      await login({
        phoneNumber: values.phoneNumber,
        password: values.password,
      });
      // Dùng notification thay cho message để đồng bộ
      api.success({
        message: 'Thành công',
        description: 'Đăng nhập thành công!',
        placement: 'bottomRight',
      });
    } catch (err: unknown) {
      // [THAY ĐỔI 4]: Sử dụng notification error ở góc dưới phải
      api.error({
        message: 'Đăng nhập thất bại',
        description: ApiError.from(err).message || 'Vui lòng kiểm tra lại thông tin.',
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
              Đăng Nhập
            </Title>
            <Text type="secondary">Zalo Clone - Chat Application</Text>
          </div>

          {/* [THAY ĐỔI 6]: Đã XÓA đoạn code <Alert /> ở đây */}

          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            requiredMark="optional"
            size="large"
          >
            <Form.Item
              label="Số Điện Thoại"
              name="phoneNumber"
              rules={[
                { required: true, message: 'Vui lòng nhập số điện thoại' },
                {
                  // pattern: /(84|0[3|5|7|8|9])+([0-9]{8})\b/g,
                  message: 'Số điện thoại không đúng định dạng (VD: 0987654321)',
                },
              ]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="Nhập số điện thoại (VD: 0987654321)"
                disabled={isLoading}
              />
            </Form.Item>

            <Form.Item
              label="Mật Khẩu"
              name="password"
              rules={[
                { required: true, message: 'Vui lòng nhập mật khẩu' },
                {
                  min: 6,
                  message: 'Mật khẩu phải có ít nhất 6 ký tự',
                },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="Nhập mật khẩu"
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
                {isLoading ? 'Đang đăng nhập...' : 'Đăng Nhập'}
              </Button>
            </Form.Item>
          </Form>

          <Divider>Hoặc</Divider>

          <div className="text-center">
            <Text>Chưa có tài khoản? </Text>
            <Link to="/register" className="font-semibold text-blue-600 hover:text-blue-700">
              Đăng ký ngay
            </Link>
          </div>
        </Space>
      </Card>
    </div>
  );
}