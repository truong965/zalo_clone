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

const { Title, Text } = Typography;

export function RegisterPage() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [api, contextHolder] = notification.useNotification();

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
        message: 'Đăng ký thành công!',
        description: 'Vui lòng đăng nhập với tài khoản mới.',
        placement: 'bottomRight',
        duration: 5,
      });
      setTimeout(() => navigate(ROUTES.LOGIN), 1500);
    } catch (err: unknown) {
      api.error({
        message: 'Đăng ký thất bại',
        description: ApiError.from(err).message || 'Vui lòng kiểm tra lại thông tin.',
        placement: 'bottomRight',
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
              <Title level={2} className="!mb-2">Đăng Ký</Title>
              <Text type="secondary">Tạo tài khoản mới cho dự án của bạn</Text>
            </div>

            <Form
              form={form}
              layout="vertical"
              onFinish={onFinish}
              requiredMark="optional"
              size="large"
            >
              <Form.Item
                label="Tên Hiển Thị"
                name="displayName"
                rules={[{ required: true, message: 'Vui lòng nhập tên hiển thị' }]}
              >
                <Input prefix={<UserOutlined />} placeholder="VD: Nguyễn Văn A" />
              </Form.Item>

              <Form.Item
                label="Số Điện Thoại"
                name="phoneNumber"
                rules={[
                  { required: true, message: 'Vui lòng nhập số điện thoại' },
                  { pattern: /(84|0[3|5|7|8|9])+([0-9]{8})\b/g, message: 'SĐT không hợp lệ' },
                ]}
              >
                <Input prefix={<PhoneOutlined />} placeholder="VD: 0987654321" />
              </Form.Item>

              <Form.Item
                label="Mật Khẩu"
                name="password"
                rules={[{ required: true, message: 'Nhập mật khẩu' }, { min: 6, message: 'Tối thiểu 6 ký tự' }]}
              >
                <Input.Password prefix={<LockOutlined />} placeholder="Nhập mật khẩu" />
              </Form.Item>

              <Form.Item
                label="Xác Nhận Mật Khẩu"
                name="confirmPassword"
                dependencies={['password']}
                rules={[
                  { required: true, message: 'Xác nhận mật khẩu' },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue('password') === value) return Promise.resolve();
                      return Promise.reject(new Error('Mật khẩu không khớp!'));
                    },
                  }),
                ]}
              >
                <Input.Password prefix={<LockOutlined />} placeholder="Xác nhận lại" />
              </Form.Item>

              <div className="grid grid-cols-2 gap-4">
                <Form.Item label="Giới Tính" name="gender" className="mb-0">
                  <Select placeholder="Chọn">
                    <Select.Option value="MALE">Nam</Select.Option>
                    <Select.Option value="FEMALE">Nữ</Select.Option>
                  </Select>
                </Form.Item>

                <Form.Item label="Ngày Sinh" name="dateOfBirth" className="mb-0">
                  <Input type="date" />
                </Form.Item>
              </div>

              <Form.Item className="mt-8 mb-0">
                <Button type="primary" htmlType="submit" block size="large" loading={isLoading}>
                  {isLoading ? 'Đang đăng ký...' : 'Đăng Ký'}
                </Button>
              </Form.Item>
            </Form>

            <Divider className="my-2">Hoặc</Divider>

            <div className="text-center pb-2">
              <Text>Đã có tài khoản? </Text>
              <Link to="/login" className="font-semibold text-blue-600 hover:text-blue-700">
                Đăng nhập
              </Link>
            </div>
          </Space>
        </Card>
      </div>
    </div>
  );
}