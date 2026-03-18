/**
 * MediaResult — Search result card for media attachments
 *
 * Hiển thị:
 * - Grid cho images/videos (thumbnail)
 * - List cho documents (file icon + info)
 * - File name, size, uploader, date
 */

import { Typography } from 'antd';
import { PlaySquareOutlined } from '@ant-design/icons';
import type { MediaSearchResult } from '../types';
import { isVisualMedia } from '../utils/search.util';
import { RecentFileItem } from '@/features/chat/components/recent-file-item';

const { Text } = Typography;

interface MediaResultProps {
      data: MediaSearchResult;
      onClick?: (result: MediaSearchResult) => void;
}

export function MediaResult({ data, onClick }: MediaResultProps) {
      const isVisual = isVisualMedia(data.mediaType);

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
            <RecentFileItem
                  originalName={data.originalName}
                  sizeBytes={Number(data.size)}
                  createdAt={data.createdAt}
                  cdnUrl={data.cdnUrl}
                  mimeType={data.mimeType}
                  extraLine1={data.uploadedByName}
                  extraLine2={data.conversationName}
            />
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
