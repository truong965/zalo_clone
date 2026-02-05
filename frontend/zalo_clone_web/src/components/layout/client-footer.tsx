/**
 * Client Footer Component
 */

import { Layout, Space, Typography } from 'antd';
import { GithubOutlined, LinkedinOutlined } from '@ant-design/icons';

const { Footer } = Layout;
const { Text } = Typography;

export function ClientFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <Footer className="text-center bg-gray-50 border-t">
      <Space>
        <Text>© {currentYear} Zalo Clone App</Text>
        <a href="https://github.com" target="_blank" rel="noopener noreferrer">
          <GithubOutlined />
        </a>
        <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer">
          <LinkedinOutlined />
        </a>
      </Space>
    </Footer>
  );
}
