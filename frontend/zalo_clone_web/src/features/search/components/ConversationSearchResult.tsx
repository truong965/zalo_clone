/**
 * ConversationSearchResult — Global search result card grouped by conversation
 *
 * Shows:
 * - Conversation avatar + name
 * - Match count badge
 * - Latest matching message preview with highlighted text
 * - Timestamp of latest match
 *
 * Click → navigate to conversation and open ChatSearchSidebar with keyword prefilled
 */

import { Avatar, Typography } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import type { ConversationMessageGroup, HighlightLocation } from '../types';
import { formatSearchTimestamp } from '../utils/search.util';

const { Text } = Typography;

interface ConversationSearchResultProps {
      data: ConversationMessageGroup;
      onClick?: (data: ConversationMessageGroup) => void;
}

/**
 * Render plain text + highlights[] as React nodes with <mark> tags.
 * Same logic as MessageResult's renderHighlightedPreview.
 */
function renderHighlightedPreview(
      preview: string,
      highlights: HighlightLocation[],
): React.ReactNode[] {
      if (!highlights.length) {
            return [<span key="all">{preview}</span>];
      }

      const nodes: React.ReactNode[] = [];
      let cursor = 0;
      const sorted = [...highlights].sort((a, b) => a.start - b.start);

      sorted.forEach((hl, i) => {
            const start = Math.min(hl.start, preview.length);
            const end = Math.min(hl.end, preview.length);

            if (cursor < start) {
                  nodes.push(<span key={`plain-${i}`}>{preview.slice(cursor, start)}</span>);
            }
            if (start < end) {
                  nodes.push(
                        <mark key={`hl-${i}`} className="bg-yellow-200 text-gray-900 rounded-sm px-0.5">
                              {preview.slice(start, end)}
                        </mark>,
                  );
            }
            cursor = end;
      });

      if (cursor < preview.length) {
            nodes.push(<span key="tail">{preview.slice(cursor)}</span>);
      }

      return nodes;
}

export function ConversationSearchResult({ data, onClick }: ConversationSearchResultProps) {
      const { latestMatch } = data;
      const timestamp = formatSearchTimestamp(latestMatch.createdAt);
      const previewNodes = renderHighlightedPreview(latestMatch.preview, latestMatch.highlights ?? []);

      return (
            <div
                  className="flex items-start gap-3 px-3 py-3 cursor-pointer rounded-lg hover:bg-gray-50 transition-colors"
                  onClick={() => onClick?.(data)}
            >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                        <Avatar
                              size={40}
                              src={data.conversationAvatar || undefined}
                              className={!data.conversationAvatar ? 'bg-blue-500' : ''}
                        >
                              {data.conversationType === 'GROUP'
                                    ? <TeamOutlined />
                                    : data.conversationName?.[0]?.toUpperCase() ?? 'C'}
                        </Avatar>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                        {/* Row 1: Conversation name + match count + time */}
                        <div className="flex justify-between items-center mb-0.5">
                              <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
                                    {data.conversationType === 'GROUP' && (
                                          <TeamOutlined className="text-gray-400 text-xs flex-shrink-0" />
                                    )}
                                    <Text
                                          strong
                                          className="truncate text-sm text-gray-800"
                                          title={data.conversationName}
                                    >
                                          {data.conversationName}
                                    </Text>

                              </div>
                              <Text className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">
                                    {timestamp}
                              </Text>
                        </div>

                        {/* Row 2: Sender name + preview snippet */}
                        <div className="flex items-start gap-1">
                              <Text
                                    className="text-xs text-gray-500 line-clamp-2 leading-relaxed"
                                    title={latestMatch.preview}
                              >
                                    <span className="font-medium text-gray-600">{latestMatch.senderName}: </span>
                                    {previewNodes}
                              </Text>
                        </div>

                        {/* Row 3: Match count hint for multiple matches */}
                        {data.matchCount > 1 && (
                              <span
                                    className="text-[12px] text-blue-500 font-medium whitespace-nowrap"
                                    title={`${data.matchCount} tin nhắn khớp`}
                              >
                                    {data.matchCount > 100 ? "99+" : data.matchCount} kết quả
                              </span>
                        )}
                  </div>
            </div>
      );
}
