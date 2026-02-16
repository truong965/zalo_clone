/**
 * MemberListItem — Single member row with checkbox
 *
 * Memoized to avoid re-rendering entire list on single toggle
 * (rerender-memo). Uses selectIsSelected selector for stable identity.
 */

import { memo, useCallback } from 'react';
import { Avatar, Checkbox, Typography } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import {
      useCreateGroupStore,
      selectIsSelected,
      type SelectedMember,
} from '../../stores/create-group.store';

const { Text } = Typography;

interface MemberListItemProps {
      id: string;
      displayName: string;
      avatarUrl?: string;
      /** Extra info (e.g. phone number, relationship) */
      subtitle?: string;
      /** Whether this item can be selected (disabled if canMessage=false) */
      disabled?: boolean;
      disabledReason?: string;
}

export const MemberListItem = memo(function MemberListItem({
      id,
      displayName,
      avatarUrl,
      subtitle,
      disabled = false,
      disabledReason,
}: MemberListItemProps) {
      const isSelected = useCreateGroupStore(selectIsSelected(id));
      const toggleMember = useCreateGroupStore((s) => s.toggleMember);

      const handleToggle = useCallback(() => {
            if (disabled) return;
            const member: SelectedMember = { id, displayName, avatarUrl };
            toggleMember(member);
      }, [disabled, id, displayName, avatarUrl, toggleMember]);

      const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleToggle();
            }
      }, [handleToggle]);

      return (
            <div
                  role="checkbox"
                  tabIndex={disabled ? -1 : 0}
                  aria-checked={isSelected}
                  aria-disabled={disabled}
                  aria-label={`${displayName}${disabled && disabledReason ? `, ${disabledReason}` : ''}`}
                  className={`flex items-center gap-3 px-4 py-2 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${disabled
                        ? 'opacity-50 cursor-not-allowed'
                        : 'hover:bg-gray-50'
                        } ${isSelected ? 'bg-blue-50' : ''}`}
                  onClick={handleToggle}
                  onKeyDown={handleKeyDown}
            >
                  <Checkbox checked={isSelected} disabled={disabled} />
                  <Avatar
                        size={36}
                        src={avatarUrl}
                        icon={!avatarUrl ? <UserOutlined /> : undefined}
                        className="flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                        <Text
                              className="block text-sm font-medium truncate"
                              title={displayName}
                        >
                              {displayName}
                        </Text>
                        {(subtitle ?? disabledReason) ? (
                              <Text
                                    type="secondary"
                                    className="block text-xs truncate"
                                    title={disabledReason ?? subtitle}
                              >
                                    {disabled && disabledReason ? disabledReason : subtitle}
                              </Text>
                        ) : null}
                  </div>
            </div>
      );
});
