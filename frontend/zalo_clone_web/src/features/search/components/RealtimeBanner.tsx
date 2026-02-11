/**
 * RealtimeBanner — Notification strip for new realtime matches
 *
 * Khi newMatches.length > 0, hiển thị banner "X kết quả mới"
 * Click → merge newMatches vào results + clear buffer
 * Auto-merge sau 5 giây
 */

import { useEffect, useRef } from 'react';
import { Button, Typography } from 'antd';
import { BellOutlined } from '@ant-design/icons';

const { Text } = Typography;

/** Auto-merge delay (ms) */
const AUTO_MERGE_DELAY = 5000;

interface RealtimeBannerProps {
      /** Number of pending new matches */
      count: number;
      /** Called when user clicks to merge */
      onMerge: () => void;
}

export function RealtimeBanner({ count, onMerge }: RealtimeBannerProps) {
      const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

      // Auto-merge after 5 seconds
      useEffect(() => {
            if (count === 0) return;

            timerRef.current = setTimeout(() => {
                  onMerge();
            }, AUTO_MERGE_DELAY);

            return () => {
                  if (timerRef.current) {
                        clearTimeout(timerRef.current);
                  }
            };
      }, [count, onMerge]);

      if (count === 0) return null;

      return (
            <div className="mx-2 mb-2">
                  <Button
                        type="primary"
                        ghost
                        block
                        size="small"
                        icon={<BellOutlined />}
                        onClick={onMerge}
                        className="rounded-lg text-xs"
                  >
                        <Text className="text-xs">
                              {count} kết quả mới
                        </Text>
                  </Button>
            </div>
      );
}
