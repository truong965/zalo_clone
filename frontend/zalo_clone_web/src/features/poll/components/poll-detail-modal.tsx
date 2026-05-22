import { Modal, List, Avatar } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import type { PollDetail } from '@/types/api';

interface PollDetailModalProps {
      open: boolean;
      onClose: () => void;
      poll: PollDetail | null;
}

export function PollDetailModal({ open, onClose, poll }: PollDetailModalProps) {
      return (
            <Modal
                  title="Chi tiết bình chọn"
                  open={open}
                  onCancel={onClose}
                  footer={null}
                  width={480}
                  destroyOnHidden
            >
                  {poll ? (
                        <div className="space-y-4 py-2">
                              <p className="font-medium text-gray-800">{poll.question}</p>
                              <p className="text-[13px] text-gray-500">
                                    {poll.totalVoters} người đã bình chọn
                                    {poll.isClosed ? ' · Đã kết thúc' : ''}
                              </p>
                              {poll.options.map((opt) => (
                                    <div key={opt.id} className="border-b border-gray-50 pb-3 last:border-0">
                                          <div className="flex justify-between text-[14px] mb-2">
                                                <span className="text-gray-800">{opt.text}</span>
                                                <span className="text-gray-500">
                                                      {opt.voteCount} ({opt.percent}%)
                                                </span>
                                          </div>
                                          <List
                                                size="small"
                                                dataSource={opt.voters}
                                                locale={{ emptyText: 'Chưa có phiếu' }}
                                                renderItem={(v) => (
                                                      <List.Item className="!px-0 !py-1">
                                                            <List.Item.Meta
                                                                  avatar={
                                                                        <Avatar
                                                                              size={28}
                                                                              src={v.avatarUrl ?? undefined}
                                                                              icon={
                                                                                    !v.avatarUrl ? (
                                                                                          <UserOutlined />
                                                                                    ) : undefined
                                                                              }
                                                                        />
                                                                  }
                                                                  title={
                                                                        <span className="text-[13px]">
                                                                              {v.displayName}
                                                                        </span>
                                                                  }
                                                            />
                                                      </List.Item>
                                                )}
                                          />
                                    </div>
                              ))}
                        </div>
                  ) : null}
            </Modal>
      );
}
