/**
 * Admin Calls Page — Statistics + Call List
 *
 * Layout:
 * - Row 1: Stats cards (Total Calls, Avg Duration, Voice/Video ratio)
 * - Row 2: Stacked BarChart (calls by status/day) + PieChart (voice vs video)
 * - Row 3: Call list table with filters
 *
 * Skills applied:
 * - rendering-conditional-render (ternary)
 * - rerender-derived-state-no-effect (useMemo)
 * - architecture-compound-components (charts & table as separate logic)
 * - rerender-lazy-state-init
 */

import { useState, useMemo, useCallback } from 'react';
import {
  Row,
  Col,
  Card,
  Table,
  Select,
  Tag,
  Skeleton,
  Statistic,
  DatePicker,
  Empty,
} from 'antd';
import {
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
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useStatsDaily, useAdminCalls } from '@/features/admin';
import type { DailyStats, AdminCallItem, CallListQuery } from '@/features/admin';

const { RangePicker } = DatePicker;

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_DAYS = 30;
const PIE_COLORS = ['#1677ff', '#52c41a'];
const CALL_STATUS_COLORS: Record<string, string> = {
  COMPLETED: '#52c41a',
  MISSED: '#faad14',
  REJECTED: '#ff4d4f',
  ONGOING: '#1677ff',
  RINGING: '#13c2c2',
};

const TYPE_TAG_COLORS: Record<string, string> = { VOICE: 'green', VIDEO: 'blue' };

const TYPE_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Voice', value: 'VOICE' },
  { label: 'Video', value: 'VIDEO' },
];

const STATUS_OPTIONS = [
  { label: 'All', value: '' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Missed', value: 'MISSED' },
  { label: 'Rejected', value: 'REJECTED' },
];

function createDefaultRange(): [Dayjs, Dayjs] {
  return [dayjs().subtract(DEFAULT_DAYS, 'day'), dayjs()];
}

// ============================================================================
// Helpers
// ============================================================================

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

interface StatusPoint {
  date: string;
  [key: string]: string | number;
}

interface TypeSlice { name: string; value: number }

function toCallStatusSeries(daily: DailyStats[]): { data: StatusPoint[]; keys: string[] } {
  const keySet = new Set<string>();
  const data = daily.map((d) => {
    const pt: StatusPoint = { date: dayjs(d.date).format('MM/DD') };
    for (const [status, count] of Object.entries(d.callsByStatus ?? {})) {
      keySet.add(status);
      pt[status] = count;
    }
    return pt;
  });
  return { data, keys: Array.from(keySet) };
}

function toCallTypePie(daily: DailyStats[]): TypeSlice[] {
  const totals: Record<string, number> = {};
  for (const d of daily) {
    for (const [type, count] of Object.entries(d.callsByType ?? {})) {
      totals[type] = (totals[type] ?? 0) + count;
    }
  }
  return Object.entries(totals).map(([name, value]) => ({ name, value }));
}

function avgDuration(daily: DailyStats[]): number {
  const durations = daily.filter((d) => d.callAvgDuration > 0).map((d) => d.callAvgDuration);
  if (durations.length === 0) return 0;
  return Math.round(durations.reduce((a, b) => a + b, 0) / durations.length);
}

function totalCalls(daily: DailyStats[]): number {
  let sum = 0;
  for (const d of daily) sum += d.callsTotal;
  return sum;
}

// ============================================================================
// Sub-charts
// ============================================================================

function CallStatusStackedChart({ data, statusKeys }: { data: StatusPoint[]; statusKeys: string[] }) {
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

function CallTypePieChart({ data }: { data: TypeSlice[] }) {
  if (data.length === 0) return <Empty description="No call data" />;
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
// Call table columns
// ============================================================================

const callColumns: ColumnsType<AdminCallItem> = [
  {
    title: 'Initiator',
    key: 'initiator',
    render: (_: unknown, r: AdminCallItem) => r.initiator?.displayName ?? '—',
  },
  {
    title: 'Type',
    dataIndex: 'callType',
    key: 'callType',
    width: 90,
    render: (t: string) => <Tag color={TYPE_TAG_COLORS[t] ?? 'default'}>{t}</Tag>,
  },
  {
    title: 'Status',
    dataIndex: 'status',
    key: 'status',
    width: 110,
    render: (s: string) => <Tag color={CALL_STATUS_COLORS[s] ?? 'default'}>{s}</Tag>,
  },
  {
    title: 'Duration',
    dataIndex: 'duration',
    key: 'duration',
    width: 100,
    render: (v: number | null) => formatDuration(v),
  },
  {
    title: 'Participants',
    key: 'participants',
    width: 110,
    render: (_: unknown, r: AdminCallItem) => r._count?.participants ?? r.participantCount ?? 0,
  },
  {
    title: 'Started At',
    dataIndex: 'startedAt',
    key: 'startedAt',
    render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
  },
];

// ============================================================================
// Main Page
// ============================================================================

export function AdminCallsPage() {
  // Chart date range
  const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(createDefaultRange);
  const dailyParams = useMemo(
    () => ({ from: dateRange[0].format('YYYY-MM-DD'), to: dateRange[1].format('YYYY-MM-DD') }),
    [dateRange],
  );
  const { data: daily, isLoading: dailyLoading } = useStatsDaily(dailyParams);

  // Table filters
  const [callType, setCallType] = useState('');
  const [callStatus, setCallStatus] = useState('');
  const [tableDateRange, setTableDateRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [page, setPage] = useState(1);

  const tableParams: CallListQuery = {
    page,
    limit: 10,
    ...(callType ? { type: callType } : {}),
    ...(callStatus ? { status: callStatus } : {}),
    ...(tableDateRange?.[0] ? { from: tableDateRange[0].format('YYYY-MM-DD') } : {}),
    ...(tableDateRange?.[1] ? { to: tableDateRange[1].format('YYYY-MM-DD') } : {}),
  };
  const { data: callData, isLoading: callsLoading } = useAdminCalls(tableParams);

  // Derived chart data
  const { data: statusSeries, keys: statusKeys } = useMemo(() => toCallStatusSeries(daily ?? []), [daily]);
  const typePie = useMemo(() => toCallTypePie(daily ?? []), [daily]);
  const totalCallsCount = useMemo(() => totalCalls(daily ?? []), [daily]);
  const avgDur = useMemo(() => avgDuration(daily ?? []), [daily]);

  const handleRangeChange = useCallback((dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates?.[0] && dates?.[1]) setDateRange([dates[0], dates[1]]);
  }, []);

  const handleTableDateChange = useCallback((dates: [Dayjs | null, Dayjs | null] | null) => {
    if (dates?.[0] && dates?.[1]) {
      setTableDateRange([dates[0], dates[1]]);
    } else {
      setTableDateRange(null);
    }
    setPage(1);
  }, []);

  const handleTableChange = useCallback((pagination: TablePaginationConfig) => {
    setPage(pagination.current ?? 1);
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Calls Overview</h1>

      {/* Date Range for charts */}
      <div className="flex items-center gap-3">
        <span className="font-medium text-gray-600">Date range:</span>
        <RangePicker
          value={dateRange}
          onChange={handleRangeChange}
          allowClear={false}
          disabledDate={(d) => d.isAfter(dayjs())}
        />
      </div>

      {/* Stats Cards */}
      {dailyLoading ? (
        <Row gutter={[16, 16]}>
          {[1, 2, 3].map((i) => (
            <Col xs={24} sm={8} key={i}>
              <Card><Skeleton active paragraph={{ rows: 1 }} /></Card>
            </Col>
          ))}
        </Row>
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={8}>
            <Card><Statistic title="Total Calls" value={totalCallsCount} /></Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card><Statistic title="Avg Duration" value={formatDuration(avgDur)} /></Card>
          </Col>
          <Col xs={24} sm={8}>
            <Card>
              <Statistic
                title="Voice / Video"
                value={`${typePie.find((p) => p.name === 'VOICE')?.value ?? 0} / ${typePie.find((p) => p.name === 'VIDEO')?.value ?? 0}`}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* Charts */}
      {dailyLoading ? (
        <Row gutter={[16, 16]}>
          {[1, 2].map((i) => (
            <Col xs={24} md={12} key={i}>
              <Card><Skeleton active paragraph={{ rows: 8 }} /></Card>
            </Col>
          ))}
        </Row>
      ) : (
        <Row gutter={[16, 16]}>
          <Col xs={24} md={12}>
            <Card title="Calls by Status">
              <CallStatusStackedChart data={statusSeries} statusKeys={statusKeys} />
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card title="Voice vs Video">
              <CallTypePieChart data={typePie} />
            </Card>
          </Col>
        </Row>
      )}

      {/* Call List Table */}
      <Card title="Call History">
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Select
            value={callType}
            onChange={(v) => { setCallType(v); setPage(1); }}
            options={TYPE_OPTIONS}
            style={{ width: 130 }}
            placeholder="Type"
          />
          <Select
            value={callStatus}
            onChange={(v) => { setCallStatus(v); setPage(1); }}
            options={STATUS_OPTIONS}
            style={{ width: 140 }}
            placeholder="Status"
          />
          <RangePicker
            value={tableDateRange}
            onChange={handleTableDateChange}
            placeholder={['From', 'To']}
          />
        </div>
        <Table
          dataSource={callData?.data ?? []}
          columns={callColumns}
          rowKey="id"
          loading={callsLoading}
          onChange={handleTableChange}
          pagination={{
            current: page,
            pageSize: 10,
            total: callData?.total ?? 0,
            showTotal: (total) => `Total ${total} calls`,
          }}
        />
      </Card>
    </div>
  );
}
