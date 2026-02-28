/**
 * Admin Dashboard Page
 *
 * Real-time KPI cards, time-series charts (Recharts), and quick stats.
 * Data: useStatsOverview() (auto-refresh 30s) + useStatsDaily(range).
 *
 * Skills applied:
 * - rendering-conditional-render (ternary, not &&)
 * - rerender-derived-state-no-effect (compute chart data during render)
 * - rerender-lazy-state-init (function initializer for useState)
 * - architecture-compound-components (KpiCards, ChartSection as separate components)
 */

import { useState, useMemo } from 'react';
import { Row, Col, Card, Statistic, Skeleton, DatePicker, Empty, theme } from 'antd';
import {
  UserOutlined,
  WifiOutlined,
  MessageOutlined,
  PhoneOutlined,
} from '@ant-design/icons';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import dayjs, { type Dayjs } from 'dayjs';
import { useStatsOverview, useStatsDaily } from '@/features/admin';
import type { StatsOverview, DailyStats } from '@/features/admin';

const { RangePicker } = DatePicker;

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_DAYS = 30;
const PIE_COLORS = ['#1677ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1', '#13c2c2'];

/** Lazy initializer for default date range (avoids re-creating on every render). */
function createDefaultRange(): [Dayjs, Dayjs] {
  return [dayjs().subtract(DEFAULT_DAYS, 'day'), dayjs()];
}

// ============================================================================
// KPI Cards
// ============================================================================

interface KpiCardsProps {
  data: StatsOverview | undefined;
  isLoading: boolean;
}

function KpiCards({ data, isLoading }: KpiCardsProps) {
  const cards = [
    { title: 'Total Users', value: data?.totalUsers, icon: <UserOutlined />, color: undefined },
    { title: 'Online Users', value: data?.onlineUsers, icon: <WifiOutlined />, color: '#52c41a' },
    { title: 'Messages Today', value: data?.messagesToday, icon: <MessageOutlined />, color: '#1677ff' },
    { title: 'Calls Today', value: data?.callsToday, icon: <PhoneOutlined />, color: '#722ed1' },
  ] as const;

  return (
    <Row gutter={[16, 16]}>
      {cards.map((c) => (
        <Col xs={24} sm={12} md={6} key={c.title}>
          <Card>
            {isLoading ? (
              <Skeleton active paragraph={{ rows: 1 }} />
            ) : (
              <Statistic
                title={c.title}
                value={c.value ?? 0}
                prefix={c.icon}
                styles={c.color ? { content: { color: c.color } } : undefined}
              />
            )}
          </Card>
        </Col>
      ))}
    </Row>
  );
}

// ============================================================================
// Derived Chart Data helpers (pure functions — computed during render)
// ============================================================================

interface UserChartPoint {
  date: string;
  newUsers: number;
  activeUsers: number;
}

interface MessageChartPoint {
  date: string;
  messages: number;
}

interface CallChartPoint {
  date: string;
  [key: string]: string | number;
}

interface PieSlice {
  name: string;
  value: number;
}

function toUserSeries(daily: DailyStats[]): UserChartPoint[] {
  return daily.map((d) => ({
    date: dayjs(d.date).format('MM/DD'),
    newUsers: d.newUsers,
    activeUsers: d.activeUsers,
  }));
}

function toMessageSeries(daily: DailyStats[]): MessageChartPoint[] {
  return daily.map((d) => ({
    date: dayjs(d.date).format('MM/DD'),
    messages: d.messagesTotal,
  }));
}

function toCallSeries(daily: DailyStats[]): { data: CallChartPoint[]; statusKeys: string[] } {
  const statusSet = new Set<string>();
  const data = daily.map((d) => {
    const point: CallChartPoint = { date: dayjs(d.date).format('MM/DD') };
    for (const [status, count] of Object.entries(d.callsByStatus ?? {})) {
      statusSet.add(status);
      point[status] = count;
    }
    return point;
  });
  return { data, statusKeys: Array.from(statusSet) };
}

function toMessageTypePie(daily: DailyStats[]): PieSlice[] {
  const totals: Record<string, number> = {};
  for (const d of daily) {
    for (const [type, count] of Object.entries(d.messagesByType ?? {})) {
      totals[type] = (totals[type] ?? 0) + count;
    }
  }
  return Object.entries(totals).map(([name, value]) => ({ name, value }));
}

function totalMediaBytes(daily: DailyStats[]): number {
  let sum = 0;
  for (const d of daily) {
    sum += Number(d.mediaBytes ?? '0');
  }
  return sum;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// ============================================================================
// Chart components
// ============================================================================

const CALL_STATUS_COLORS: Record<string, string> = {
  COMPLETED: '#52c41a',
  MISSED: '#faad14',
  REJECTED: '#ff4d4f',
  ONGOING: '#1677ff',
  RINGING: '#13c2c2',
};

function UserGrowthChart({ data }: { data: UserChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" fontSize={12} />
        <YAxis fontSize={12} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="newUsers" stroke="#1677ff" name="New Users" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="activeUsers" stroke="#52c41a" name="Active Users" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function MessageVolumeChart({ data }: { data: MessageChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" fontSize={12} />
        <YAxis fontSize={12} />
        <Tooltip />
        <Bar dataKey="messages" fill="#1677ff" name="Messages" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function CallsByStatusChart({ data, statusKeys }: { data: CallChartPoint[]; statusKeys: string[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" fontSize={12} />
        <YAxis fontSize={12} />
        <Tooltip />
        <Legend />
        {statusKeys.map((key) => (
          <Bar key={key} dataKey={key} stackId="calls" fill={CALL_STATUS_COLORS[key] ?? '#8884d8'} name={key} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function MessageTypePieChart({ data }: { data: PieSlice[] }) {
  if (data.length === 0) return <Empty description="No message data" />;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
          {data.map((_, idx) => (
            <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

// ============================================================================
// Main Dashboard Page
// ============================================================================

export function AdminDashboardPage() {
  const { token } = theme.useToken();
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(createDefaultRange);

  const dailyParams = useMemo(
    () => ({
      from: dateRange[0].format('YYYY-MM-DD'),
      to: dateRange[1].format('YYYY-MM-DD'),
    }),
    [dateRange],
  );

  // Queries
  const { data: overview, isLoading: overviewLoading } = useStatsOverview();
  const { data: daily, isLoading: dailyLoading } = useStatsDaily(dailyParams);

  // Derived chart data — computed during render, no useEffect
  const userSeries = useMemo(() => toUserSeries(daily ?? []), [daily]);
  const messageSeries = useMemo(() => toMessageSeries(daily ?? []), [daily]);
  const { data: callData, statusKeys } = useMemo(() => toCallSeries(daily ?? []), [daily]);
  const pieData = useMemo(() => toMessageTypePie(daily ?? []), [daily]);
  const storageBytes = useMemo(() => totalMediaBytes(daily ?? []), [daily]);

  const handleRangeChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates?.[0] && dates?.[1]) {
      setDateRange([dates[0], dates[1]]);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold" style={{ color: token.colorText }}>
        Dashboard
      </h1>

      {/* KPI Cards */}
      <KpiCards data={overview} isLoading={overviewLoading} />

      {/* Date Range Picker */}
      <div className="flex items-center gap-3">
        <span className="font-medium" style={{ color: token.colorTextSecondary }}>
          Date range:
        </span>
        <RangePicker
          value={dateRange}
          onChange={handleRangeChange}
          allowClear={false}
          disabledDate={(d) => d.isAfter(dayjs())}
        />
      </div>

      {/* Time Series Charts */}
      {dailyLoading ? (
        <Row gutter={[16, 16]}>
          {[1, 2].map((i) => (
            <Col xs={24} md={12} key={i}>
              <Card>
                <Skeleton active paragraph={{ rows: 8 }} />
              </Card>
            </Col>
          ))}
        </Row>
      ) : (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Card title="User Growth">
                <UserGrowthChart data={userSeries} />
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="Messages per Day">
                <MessageVolumeChart data={messageSeries} />
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Card title="Calls by Status">
                <CallsByStatusChart data={callData} statusKeys={statusKeys} />
              </Card>
            </Col>
            <Col xs={24} md={12}>
              <Card title="Message Type Breakdown">
                <MessageTypePieChart data={pieData} />
              </Card>
            </Col>
          </Row>

          {/* Storage Quick Stat */}
          <Row gutter={[16, 16]}>
            <Col xs={24} sm={12} md={6}>
              <Card>
                <Statistic title="Media Storage (selected range)" value={formatBytes(storageBytes)} />
              </Card>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}
