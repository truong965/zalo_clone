/**
 * MediaThumbnail — Renders a single media item as a compact preview tile.
 *
 * Used inside the info sidebar Collapse panels (Ảnh/Video, File).
 * Images/videos show a thumbnail with an overlay play icon for videos.
 * Files show a file icon + truncated name.
 *
 * Rules applied:
 * - rendering-conditional-render: ternary instead of && for conditional JSX
 * - architecture-avoid-boolean-props: uses item.messageType to branch display
 */

import { FileOutlined, PlayCircleOutlined } from '@ant-design/icons';
import type { RecentMediaItem } from '@/types/api';

interface MediaThumbnailProps {
      item: RecentMediaItem;
}

export function MediaThumbnail({ item }: MediaThumbnailProps) {
      const isVisualMedia =
            item.messageType === 'IMAGE' || item.messageType === 'VIDEO';

      return (
            <div className="aspect-square bg-gray-100 rounded overflow-hidden cursor-pointer hover:opacity-80 transition-opacity relative">
                  {isVisualMedia && item.thumbnailUrl ? (
                        <>
                              <img
                                    src={item.thumbnailUrl}
                                    alt={item.originalName}
                                    className="w-full h-full object-cover"
                                    loading="lazy"
                              />
                              {item.messageType === 'VIDEO' ? (
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                          <PlayCircleOutlined className="text-white text-2xl drop-shadow" />
                                    </div>
                              ) : null}
                        </>
                  ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-1">
                              <FileOutlined className="text-lg text-blue-500" />
                        </div>
                  )}
            </div>
      );
}
