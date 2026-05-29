import { Avatar, Checkbox, Progress, Radio } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import type { PollOptionDetail } from '@/types/api';

interface PollOptionRowProps {
      option: PollOptionDetail;
      isMultiple: boolean;
      isClosed: boolean;
      isSelected: boolean;
      hasVoted: boolean;
      onSelect: () => void;
      showResults: boolean;
}

export function PollOptionRow({
      option,
      isMultiple,
      isClosed,
      isSelected,
      hasVoted,
      onSelect,
      showResults,
}: PollOptionRowProps) {
      const Control = isMultiple ? Checkbox : Radio;

      return (
            <button
                  type="button"
                  disabled={isClosed}
                  onClick={onSelect}
                  className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                        isSelected
                              ? 'border-blue-400 bg-blue-50/60'
                              : 'border-gray-100 bg-white hover:border-gray-200'
                  } ${isClosed ? 'cursor-default opacity-90' : 'cursor-pointer'}`}
            >
                  <div className="flex items-start gap-2">
                        {!isClosed && (
                              <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                                    <Control
                                          checked={isSelected}
                                          disabled={isClosed}
                                          onChange={onSelect}
                                    />
                              </div>
                        )}
                        <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                    <span className="text-[14px] text-gray-800 break-words">
                                          {option.text}
                                    </span>
                                    {showResults && (
                                          <span className="text-[12px] text-gray-500 shrink-0">
                                                {option.percent}%
                                          </span>
                                    )}
                              </div>
                              {showResults && (
                                    <Progress
                                          percent={option.percent}
                                          showInfo={false}
                                          strokeColor={hasVoted ? '#0068ff' : '#b8d4ff'}
                                          trailColor="#eef2f7"
                                          size="small"
                                          className="mt-1.5 mb-1"
                                    />
                              )}
                              {showResults && option.voters.length > 0 && (
                                    <div className="flex items-center -space-x-1.5 mt-1">
                                          {option.voters.map((v) => (
                                                <Avatar
                                                      key={v.id}
                                                      size={22}
                                                      src={v.avatarUrl ?? undefined}
                                                      icon={!v.avatarUrl ? <UserOutlined /> : undefined}
                                                      className="border-2 border-white"
                                                />
                                          ))}
                                          {option.voteCount > option.voters.length && (
                                                <span className="text-[11px] text-gray-400 ml-2">
                                                      +{option.voteCount - option.voters.length}
                                                </span>
                                          )}
                                    </div>
                              )}
                        </div>
                  </div>
            </button>
      );
}
