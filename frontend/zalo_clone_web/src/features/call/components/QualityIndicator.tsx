/**
 * QualityIndicator — Signal bars icon (3 bars) colored by connection quality.
 *
 * Green = GOOD, Yellow = MEDIUM, Red = POOR, Gray = DISCONNECTED.
 * Compact component for overlay in call screens.
 */

import type { ConnectionQuality } from '../types';

const qualityConfig: Record<ConnectionQuality, { bars: number; color: string; label: string }> = {
      GOOD: { bars: 3, color: 'bg-green-500', label: 'Tốt' },
      MEDIUM: { bars: 2, color: 'bg-yellow-500', label: 'Trung bình' },
      POOR: { bars: 1, color: 'bg-red-500', label: 'Kém' },
      DISCONNECTED: { bars: 0, color: 'bg-gray-500', label: 'Mất kết nối' },
};

interface QualityIndicatorProps {
      quality: ConnectionQuality;
}

export function QualityIndicator({ quality }: QualityIndicatorProps) {
      const config = qualityConfig[quality];

      return (
            <div className="flex items-end gap-0.5" title={config.label}>
                  {[1, 2, 3].map((level) => (
                        <div
                              key={level}
                              className={`w-1 rounded-sm transition-colors ${level <= config.bars ? config.color : 'bg-white/30'
                                    }`}
                              style={{ height: `${level * 5 + 3}px` }}
                        />
                  ))}
            </div>
      );
}
