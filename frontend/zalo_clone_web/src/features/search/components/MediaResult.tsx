/**
 * MediaResult — Search result card for media attachments
 *
 * Hiển thị:
 * - Grid cho images/videos (thumbnail)
 * - List cho documents (file icon + info)
 * - File name, size, uploader, date
 */

import { Typography } from 'antd';
import {
      FileImageOutlined,
      PlaySquareOutlined,
      SoundOutlined,
      FileOutlined,
} from '@ant-design/icons';
import type { MediaSearchResult } from '../types';
import { formatFileSize, formatSearchTimestamp, isVisualMedia } from '../utils/search.util';

const { Text } = Typography;

interface MediaResultProps {
      data: MediaSearchResult;
      onClick?: (result: MediaSearchResult) => void;
}

const MEDIA_ICON_MAP: Record<string, React.ReactNode> = {
      IMAGE: <FileImageOutlined className="text-2xl text-blue-400" />,
      VIDEO: <PlaySquareOutlined className="text-2xl text-purple-400" />,
      AUDIO: <SoundOutlined className="text-2xl text-green-400" />,
      DOCUMENT: <FileOutlined className="text-2xl text-orange-400" />,
};

export function MediaResult({ data, onClick }: MediaResultProps) {
      const isVisual = isVisualMedia(data.mediaType);
      const timestamp = formatSearchTimestamp(data.createdAt);
      const fileSize = formatFileSize(data.size);

      // Visual media — show thumbnail
      if (isVisual && data.thumbnailUrl) {
            return (
                  <div
                        className="cursor-pointer rounded-lg overflow-hidden hover:opacity-90 transition-opacity group relative"
                        onClick={() => onClick?.(data)}
                  >
                        <img
                              src={data.thumbnailUrl}
                              alt={data.originalName}
                              className="w-full h-28 object-cover bg-gray-100"
                              loading="lazy"
                        />
                        {data.mediaType === 'VIDEO' && (
                              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                    <PlaySquareOutlined className="text-white text-2xl" />
                              </div>
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1">
                              <Text className="text-[10px] text-white block truncate">
                                    {data.originalName}
                              </Text>
                        </div>
                  </div>
            );
      }

      // Non-visual media — file row
      return (
            <div
                  className="flex items-center gap-3 px-3 py-3 cursor-pointer rounded-lg hover:bg-gray-50 transition-colors"
                  onClick={() => onClick?.(data)}
            >
                  {/* File icon */}
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        {MEDIA_ICON_MAP[data.mediaType] ?? MEDIA_ICON_MAP.DOCUMENT}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                        <Text strong className="truncate text-sm text-gray-800 block">
                              {data.originalName}
                        </Text>
                        <Text className="text-xs text-gray-400 block">
                              {fileSize} · {data.uploadedByName} · {timestamp}
                        </Text>
                        {data.conversationName && (
                              <Text className="text-[11px] text-gray-400 block truncate">
                                    {data.conversationName}
                              </Text>
                        )}
                  </div>
            </div>
      );
}

/**
 * MediaResultGrid — Grid layout cho visual media results
 */
interface MediaResultGridProps {
      items: MediaSearchResult[];
      onItemClick?: (result: MediaSearchResult) => void;
}

export function MediaResultGrid({ items, onItemClick }: MediaResultGridProps) {
      const visualItems = items.filter((m) => isVisualMedia(m.mediaType) && m.thumbnailUrl);
      const fileItems = items.filter((m) => !isVisualMedia(m.mediaType) || !m.thumbnailUrl);

      return (
            <div>
                  {/* Visual grid */}
                  {visualItems.length > 0 && (
                        <div className="grid grid-cols-3 gap-1 p-2">
                              {visualItems.map((item) => (
                                    <MediaResult key={item.id} data={item} onClick={onItemClick} />
                              ))}
                        </div>
                  )}

                  {/* File list */}
                  {fileItems.length > 0 && (
                        <div className="flex flex-col">
                              {fileItems.map((item) => (
                                    <MediaResult key={item.id} data={item} onClick={onItemClick} />
                              ))}
                        </div>
                  )}
            </div>
      );
}
