/**
 * BellSlashedIcon — Bell icon with a diagonal slash (🔕 style).
 *
 * Used to indicate muted notifications.
 * Renders the Ant Design BellOutlined with a CSS diagonal line overlay.
 * Compatible with Ant Design icon slots.
 */
import { BellOutlined } from '@ant-design/icons';

interface BellSlashedIconProps {
      className?: string;
}

export function BellSlashedIcon({ className }: BellSlashedIconProps) {
      return (
            <span
                  className={`relative inline-flex items-center justify-center ${className ?? ''}`}
                  role="img"
                  aria-label="bell-slashed"
            >
                  <BellOutlined />
                  <span
                        className="absolute bg-current rounded-full"
                        style={{
                              width: '1.5px',
                              height: '120%',
                              transform: 'rotate(45deg)',
                        }}
                  />
            </span>
      );
}
