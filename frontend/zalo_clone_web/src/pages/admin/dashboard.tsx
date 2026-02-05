/**
 * Admin Dashboard Page
 */

import { Row, Col, Card, Statistic } from 'antd';
import { UserOutlined, MessageOutlined, PhoneOutlined, AlertOutlined } from '@ant-design/icons';

export function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Users"
              value={1234}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Messages"
              value={45678}
              prefix={<MessageOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Total Calls"
              value={5432}
              prefix={<PhoneOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Reported Issues"
              value={28}
              prefix={<AlertOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} md={12}>
          <Card title="User Growth">
            <div className="h-64">
              <p className="text-center text-gray-400">Chart placeholder</p>
            </div>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="Message Activity">
            <div className="h-64">
              <p className="text-center text-gray-400">Chart placeholder</p>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
