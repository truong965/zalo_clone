/**
 * SearchEmpty — Empty state for search
 *
 * Hiển thị khi:
 * - Chưa nhập keyword (initial state)
 * - Không có kết quả matching
 */

import { Typography } from 'antd';
import { SearchOutlined, InboxOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface SearchEmptyProps {
      /** Whether user has searched (no results) vs initial state */
      hasSearched?: boolean;
      /** Current keyword for "no results" message */
      keyword?: string;
}

export function SearchEmpty({ hasSearched = false, keyword }: SearchEmptyProps) {
      if (hasSearched) {
            return (
                  <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                              <InboxOutlined className="text-3xl text-gray-300" />
                        </div>
                        <Text strong className="block mb-1 text-gray-600">
                              Không tìm thấy kết quả
                        </Text>
                        {keyword && (
                              <Text type="secondary" className="text-sm">
                                    Không có kết quả phù hợp với &ldquo;{keyword}&rdquo;
                              </Text>
                        )}
                        <Text type="secondary" className="text-xs mt-2">
                              Thử tìm kiếm với từ khóa khác
                        </Text>
                  </div>
            );
      }

      return (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                  <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                        <SearchOutlined className="text-5xl text-blue-300" />
                  </div>
                  <Text strong className="block mb-1 text-gray-600">
                        Tìm kiếm
                  </Text>
                  <Text type="secondary" className="text-sm">
                        Tìm tin nhắn, liên hệ, nhóm và file
                  </Text>
            </div>
      );
}
