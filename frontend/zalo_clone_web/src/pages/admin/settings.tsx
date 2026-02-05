/**
 * Admin Settings Page
 */

import { Card, Form, Input, Button, Space, Switch, Typography, message } from 'antd';
import { useState } from 'react';

const { Text } = Typography;

export function AdminSettingsPage() {
  const [loading, setLoading] = useState(false);

  const onFinish = async (values: Record<string, string | boolean>) => {
    setLoading(true);
    try {
      console.log('Update settings:', values);
      message.success('Settings updated successfully!');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-bold">Admin Settings</h1>

      <Card title="General Settings">
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item
            label="App Name"
            name="appName"
            initialValue="Zalo Clone"
          >
            <Input />
          </Form.Item>

          <Form.Item
            label="Support Email"
            name="supportEmail"
            initialValue="support@example.com"
          >
            <Input type="email" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading}>
              Save Changes
            </Button>
          </Form.Item>
        </Form>
      </Card>

      <Card title="Moderation Settings">
        <Space direction="vertical" className="w-full">
          <div className="flex justify-between items-center py-2">
            <Text>Enable content moderation</Text>
            <Switch defaultChecked />
          </div>
          <div className="flex justify-between items-center py-2">
            <Text>Auto-ban spammers</Text>
            <Switch />
          </div>
          <div className="flex justify-between items-center py-2">
            <Text>Require verification for new accounts</Text>
            <Switch defaultChecked />
          </div>
        </Space>
      </Card>

      <Card title="Security Settings">
        <Space direction="vertical" className="w-full">
          <div className="flex justify-between items-center py-2">
            <Text>Two-factor authentication required</Text>
            <Switch />
          </div>
          <div className="flex justify-between items-center py-2">
            <Text>IP blocking enabled</Text>
            <Switch defaultChecked />
          </div>
          <div className="flex justify-between items-center py-2">
            <Text>Rate limiting enabled</Text>
            <Switch defaultChecked />
          </div>
        </Space>
      </Card>
    </div>
  );
}
