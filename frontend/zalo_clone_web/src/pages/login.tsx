/**
 * Login Page
 */

import { Form, Input, Button, Card, Space, Typography, Divider, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useState } from 'react';

const { Title, Text, Link } = Typography;

export function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const onFinish = async (values: Record<string, string>) => {
    setLoading(true);
    try {
      // TODO: Call auth API
      console.log('Login:', values);
      message.success('Login successful!');
      // Mock: Save tokens
      localStorage.setItem('accessToken', 'mock-token-' + Date.now());
      localStorage.setItem('refreshToken', 'mock-refresh-token-' + Date.now());
      navigate('/chat');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-blue-100">
      <Card
        className="w-full max-w-md shadow-lg"
        bordered={false}
      >
        <Space direction="vertical" className="w-full">
          <Title level={2} className="text-center mb-2">
            💬 Zalo Clone
          </Title>
          <Text type="secondary" className="block text-center mb-6">
            Welcome back! Login to continue.
          </Text>

          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            autoComplete="off"
          >
            <Form.Item
              name="email"
              label="Email"
              rules={[
                { required: true, message: 'Please enter your email!' },
                { type: 'email', message: 'Invalid email!' },
              ]}
            >
              <Input
                prefix={<UserOutlined />}
                placeholder="your@email.com"
                size="large"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label="Password"
              rules={[
                { required: true, message: 'Please enter your password!' },
                { min: 6, message: 'Password must be at least 6 characters!' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined />}
                placeholder="Enter your password"
                size="large"
              />
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={loading}
                block
                size="large"
              >
                Login
              </Button>
            </Form.Item>
          </Form>

          <Divider>OR</Divider>

          <Space direction="vertical" className="w-full">
            <Text className="text-center block">
              Don't have an account?{' '}
              <Link onClick={() => navigate('/register')}>
                Register here
              </Link>
            </Text>
          </Space>
        </Space>
      </Card>
    </div>
  );
}
