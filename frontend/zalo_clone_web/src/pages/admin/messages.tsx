/**
 * Admin Messages Page — Statistics Overview (no message content shown)
 *
 * Layout:
 * - Row 1: Volume BarChart (30 days) + PieChart (message type breakdown)
 * - Row 2: Media Storage BarChart + Media uploads Statistic
 * - Row 3: Conversation List Table (type, members, dates)
 *
 * Skills applied:
 * - rendering-conditional-render (ternary)
 * - rerender-derived-state-no-effect (useMemo for chart data)
 * - architecture-compound-components (charts as separate components)
 * - rerender-lazy-state-init (createDefaultRange)
 */

import { useState, useMemo, useCallback } from 'react';
import { Row, Col, Card, Table, Select, Skeleton, Statistic, DatePicker, Tag, Empty } from 'antd';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import { useStatsDaily, useAdminConversations } from '@/features/admin';
import type { DailyStats, AdminConversationItem, ConversationListQuery } from '@/features/admin';

const { RangePicker } = DatePicker;

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_DAYS = 30;
const PIE_COLORS = ['#1677ff', '#52c41a', '#faad14', '#ff4d4f', '#722ed1', '#13c2c2'];

function createDefaultRange(): [Dayjs, Dayjs] {
      return [dayjs().subtract(DEFAULT_DAYS, 'day'), dayjs()];
}

// ============================================================================
// Chart data helpers
// ============================================================================

interface VolumePoint { date: string; messages: number }
interface MediaPoint { date: string; bytes: number }
interface PieSlice { name: string; value: number }

function toVolumeSeries(daily: DailyStats[]): VolumePoint[] {
      return daily.map((d) => ({ date: dayjs(d.date).format('MM/DD'), messages: d.messagesTotal }));
}

function toMediaSeries(daily: DailyStats[]): MediaPoint[] {
      return daily.map((d) => ({ date: dayjs(d.date).format('MM/DD'), bytes: Number(d.mediaBytes ?? '0') }));
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

function sumField(daily: DailyStats[], field: 'mediaUploads' | 'mediaBytes'): number {
      let sum = 0;
      for (const d of daily) {
            sum += Number(d[field] ?? 0);
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
// Sub-charts
// ============================================================================

function MessageVolumeChart({ data }: { data: VolumePoint[] }) {
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

function MessageTypePieChart({ data }: { data: PieSlice[] }) {
      if (data.length === 0) return <Empty description="No data" />;
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

function MediaStorageChart({ data }: { data: MediaPoint[] }) {
      return (
            <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" fontSize={12} />
                        <YAxis fontSize={12} tickFormatter={(v: number) => formatBytes(v)} />
                        <Tooltip formatter={(v: number | undefined) => formatBytes(v ?? 0)} />
                        <Bar dataKey="bytes" fill="#52c41a" name="Media Bytes" radius={[4, 4, 0, 0]} />
                  </BarChart>
            </ResponsiveContainer>
      );
}

// ============================================================================
// Conversation columns
// ============================================================================

const TYPE_COLORS: Record<string, string> = { DIRECT: 'blue', GROUP: 'green' };
const TYPE_OPTIONS = [
      { label: 'All', value: '' },
      { label: 'Direct', value: 'DIRECT' },
      { label: 'Group', value: 'GROUP' },
];

const conversationColumns: ColumnsType<AdminConversationItem> = [
      {
            title: 'Type',
            dataIndex: 'type',
            key: 'type',
            width: 100,
            render: (t: string) => <Tag color={TYPE_COLORS[t] ?? 'default'}>{t}</Tag>,
      },
      { title: 'Name', dataIndex: 'name', key: 'name', render: (v: string | null) => v ?? '—' },
      {
            title: 'Members',
            key: 'members',
            width: 100,
            render: (_: unknown, r: AdminConversationItem) => r._count?.members ?? 0,
      },
      {
            title: 'Created',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
      },
      {
            title: 'Last Message',
            dataIndex: 'lastMessageAt',
            key: 'lastMessageAt',
            render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '—'),
      },
];

// ============================================================================
// Main Page
// ============================================================================

export function AdminMessagesPage() {
      // Date range for charts
      const [dateRange, setDateRange] = useState<[Dayjs, Dayjs]>(createDefaultRange);
      const dailyParams = useMemo(
            () => ({ from: dateRange[0].format('YYYY-MM-DD'), to: dateRange[1].format('YYYY-MM-DD') }),
            [dateRange],
      );
      const { data: daily, isLoading: dailyLoading } = useStatsDaily(dailyParams);

      // Conversation list
      const [convType, setConvType] = useState('');
      const [convPage, setConvPage] = useState(1);
      const convParams: ConversationListQuery = {
            page: convPage,
            limit: 10,
            ...(convType ? { type: convType } : {}),
      };
      const { data: convData, isLoading: convLoading } = useAdminConversations(convParams);

      // Derived chart data
      const volumeSeries = useMemo(() => toVolumeSeries(daily ?? []), [daily]);
      const mediaSeries = useMemo(() => toMediaSeries(daily ?? []), [daily]);
      const pieData = useMemo(() => toMessageTypePie(daily ?? []), [daily]);
      const totalUploads = useMemo(() => sumField(daily ?? [], 'mediaUploads'), [daily]);
      const totalBytes = useMemo(() => sumField(daily ?? [], 'mediaBytes'), [daily]);

      const handleRangeChange = useCallback((dates: [Dayjs | null, Dayjs | null] | null) => {
            if (dates?.[0] && dates?.[1]) setDateRange([dates[0], dates[1]]);
      }, []);

      const handleConvTableChange = useCallback((pagination: TablePaginationConfig) => {
            setConvPage(pagination.current ?? 1);
      }, []);

      return (
            <div className="space-y-6">
                  <h1 className="text-2xl font-bold">Messages Overview</h1>

                  {/* Date Range */}
                  <div className="flex items-center gap-3">
                        <span className="font-medium text-gray-600">Date range:</span>
                        <RangePicker
                              value={dateRange}
                              onChange={handleRangeChange}
                              allowClear={false}
                              disabledDate={(d) => d.isAfter(dayjs())}
                        />
                  </div>

                  {/* Charts Row 1 */}
                  {dailyLoading ? (
                        <Row gutter={[16, 16]}>
                              {[1, 2].map((i) => (
                                    <Col xs={24} md={12} key={i}>
                                          <Card><Skeleton active paragraph={{ rows: 8 }} /></Card>
                                    </Col>
                              ))}
                        </Row>
                  ) : (
                        <>
                              <Row gutter={[16, 16]}>
                                    <Col xs={24} md={12}>
                                          <Card title="Message Volume per Day">
                                                <MessageVolumeChart data={volumeSeries} />
                                          </Card>
                                    </Col>
                                    <Col xs={24} md={12}>
                                          <Card title="Message Type Breakdown">
                                                <MessageTypePieChart data={pieData} />
                                          </Card>
                                    </Col>
                              </Row>

                              {/* Charts Row 2 */}
                              <Row gutter={[16, 16]}>
                                    <Col xs={24} md={12}>
                                          <Card title="Media Storage per Day">
                                                <MediaStorageChart data={mediaSeries} />
                                          </Card>
                                    </Col>
                                    <Col xs={24} sm={12} md={6}>
                                          <Card>
                                                <Statistic title="Total Media Uploads" value={totalUploads} />
                                          </Card>
                                    </Col>
                                    <Col xs={24} sm={12} md={6}>
                                          <Card>
                                                <Statistic title="Total Storage" value={formatBytes(totalBytes)} />
                                          </Card>
                                    </Col>
                              </Row>
                        </>
                  )}

                  {/* Conversations Table */}
                  <Card title="Conversations">
                        <div className="mb-4">
                              <Select
                                    value={convType}
                                    onChange={(v) => { setConvType(v); setConvPage(1); }}
                                    options={TYPE_OPTIONS}
                                    style={{ width: 160 }}
                                    placeholder="Type"
                              />
                        </div>
                        <Table
                              dataSource={convData?.data ?? []}
                              columns={conversationColumns}
                              rowKey="id"
                              loading={convLoading}
                              onChange={handleConvTableChange}
                              pagination={{
                                    current: convPage,
                                    pageSize: 10,
                                    total: convData?.total ?? 0,
                                    showTotal: (total) => `Total ${total} conversations`,
                              }}
                        />
                  </Card>
            </div>
      );
}
