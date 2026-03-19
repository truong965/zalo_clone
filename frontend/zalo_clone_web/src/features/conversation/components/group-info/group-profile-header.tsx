/**
 * GroupProfileHeader — Group avatar, editable name, and quick actions.
 *
 * Composition: stateless presentational component.
 * Admin can edit group name inline.
 * Admin can update group avatar (click overlay on avatar).
 */
import { useTranslation } from 'react-i18next';
import { useState, useRef, useEffect } from 'react';
import { Avatar, Button, Input, Spin } from 'antd';
import {
      EditOutlined,
      CheckOutlined,
      CloseOutlined,
      BellOutlined,
      PushpinOutlined,
      UserAddOutlined,
      TeamOutlined,
      CameraOutlined,
} from '@ant-design/icons';
import { BellSlashedIcon } from '@/components/icons/bell-slashed';
import type { ConversationUI } from '@/types/api';

interface GroupProfileHeaderProps {
      conversation: ConversationUI;
      isAdmin: boolean;
      onUpdateName: (name: string) => Promise<void>;
      onUpdateAvatar?: (file: File) => Promise<void>;
      onAddMembers: () => void;
      onTogglePin?: () => void;
      onToggleMute?: () => void;
}

export function GroupProfileHeader({
      conversation,
      isAdmin,
      onUpdateName,
      onUpdateAvatar,
      onTogglePin,
      onToggleMute,
      onAddMembers,
}: GroupProfileHeaderProps) {
      const { t } = useTranslation();
      const [isEditing, setIsEditing] = useState(false);
      const [editName, setEditName] = useState(conversation.name ?? '');
      const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
      const inputRef = useRef<ReturnType<typeof Input>>(null);
      const avatarInputRef = useRef<HTMLInputElement>(null);

      // Fix: dùng key prop thay vì useEffect để sync editName với conversation.name
      // Nhưng vì component này không dùng key từ ngoài, ta dùng derived state pattern:
      // chỉ reset editName khi KHÔNG đang edit (tránh ghi đè input của user)
      const prevNameRef = useRef(conversation.name);
      useEffect(() => {
            if (prevNameRef.current !== conversation.name && !isEditing) {
                  setEditName(conversation.name ?? '');
            }
            prevNameRef.current = conversation.name;
      }, [conversation.name, isEditing]);

      const handleSaveName = async () => {
            const trimmed = editName.trim();
            if (!trimmed || trimmed === conversation.name) {
                  setIsEditing(false);
                  setEditName(conversation.name ?? '');
                  return;
            }
            try {
                  await onUpdateName(trimmed);
                  setIsEditing(false);
            } catch {
                  // Error notification handled by use-group-notifications
            }
      };

      const handleCancelEdit = () => {
            setIsEditing(false);
            setEditName(conversation.name ?? '');
      };

      const handleAvatarClick = () => {
            if (!isAdmin || isUploadingAvatar) return;
            avatarInputRef.current?.click();
      };

      const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file || !onUpdateAvatar) return;
            // Reset để có thể chọn lại cùng file
            e.target.value = '';

            try {
                  setIsUploadingAvatar(true);
                  await onUpdateAvatar(file);
            } finally {
                  setIsUploadingAvatar(false);
            }
      };

      return (

            <div className="flex-none flex flex-col items-center py-6 bg-white border-b border-gray-100 border-[6px] border-b-[#f4f5f7]">
                  {/* Group Avatar — admin có thể click để đổi ảnh */}
                  <div className="relative mb-3 group">
                        <Avatar
                              size={64}
                              src={conversation.avatar}
                              icon={!conversation.avatar ? <TeamOutlined /> : undefined}
                              className="border border-gray-200 bg-blue-100"
                        />

                        {/* Overlay upload — chỉ hiện với admin */}
                        {isAdmin && onUpdateAvatar && (
                              <div
                                    className={`
                                          absolute inset-0 rounded-full flex items-center justify-center
                                          bg-black/40 cursor-pointer transition-opacity
                                          ${isUploadingAvatar ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                                    `}
                                    onClick={handleAvatarClick}
                              >
                                    {isUploadingAvatar
                                          ? <Spin size="small" className="[&_.ant-spin-dot-item]:bg-white" />
                                          : <CameraOutlined className="text-white text-lg" />
                                    }
                              </div>
                        )}

                        {/* Hidden file input */}
                        <input
                              ref={avatarInputRef}
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                              onChange={(e) => void handleAvatarFileChange(e)}
                        />
                  </div>

                  {/* Group Name */}
                  <div className="flex items-center gap-2 mb-4 px-4 max-w-full">
                        {isEditing ? (
                              <div className="flex items-center gap-1">
                                    <Input
                                          ref={inputRef as never}
                                          value={editName}
                                          onChange={(e) => setEditName(e.target.value)}
                                          onPressEnter={handleSaveName}
                                          onKeyDown={(e) => {
                                                if (e.key === 'Escape') handleCancelEdit();
                                          }}
                                          maxLength={100}
                                          size="small"
                                          className="max-w-[200px]"
                                          autoFocus
                                    />
                                    <Button
                                          type="text"
                                          size="small"
                                          icon={<CheckOutlined className="text-green-500" />}
                                          onClick={handleSaveName}
                                    />
                                    <Button
                                          type="text"
                                          size="small"
                                          icon={<CloseOutlined className="text-gray-400" />}
                                          onClick={handleCancelEdit}
                                    />
                              </div>
                        ) : (
                              <>
                                    <span className="text-lg font-semibold truncate max-w-[200px]">
                                          {conversation.name || t('conversation.groupProfile.fallbackName')}
                                    </span>
                                    {isAdmin && (
                                          <Button
                                                type="text"
                                                size="small"
                                                icon={<EditOutlined className="text-gray-400" />}
                                                onClick={() => setIsEditing(true)}
                                          />
                                    )}
                              </>
                        )}
                  </div>

                  {/* Quick Actions */}
                  <div className="flex gap-8 justify-center w-full px-4">
                        <div
                              className="flex flex-col items-center gap-2 cursor-pointer group"
                              onClick={onToggleMute}
                        >
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${conversation.isMuted
                                    ? 'bg-blue-100'
                                    : 'bg-gray-100 group-hover:bg-blue-50'
                                    }`}>
                                    {conversation.isMuted
                                          ? <BellSlashedIcon className="text-blue-600" />
                                          : <BellOutlined className="text-gray-600 group-hover:text-blue-600" />
                                    }
                              </div>
                              <span className="text-xs text-gray-500 text-center max-w-[60px]">
                                    {conversation.isMuted ? t('conversation.groupProfile.unmute') : t('conversation.groupProfile.mute')}
                              </span>
                        </div>
                        <div
                              className="flex flex-col items-center gap-2 cursor-pointer group"
                              onClick={onTogglePin}
                        >
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${conversation.isPinned
                                    ? 'bg-blue-100 text-blue-600'
                                    : 'bg-gray-100 group-hover:bg-blue-50'
                                    }`}>
                                    <PushpinOutlined className={conversation.isPinned ? 'text-blue-600' : 'text-gray-600 group-hover:text-blue-600'} />
                              </div>
                              <span className="text-xs text-gray-500 text-center max-w-[60px]">
                                    {conversation.isPinned ? t('conversation.groupProfile.unpin') : t('conversation.groupProfile.pin')}
                              </span>
                        </div>
                        <div
                              className="flex flex-col items-center gap-2 cursor-pointer group"
                              onClick={onAddMembers}
                        >
                              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                                    <UserAddOutlined className="text-gray-600 group-hover:text-blue-600" />
                              </div>
                              <span className="text-xs text-gray-500 text-center max-w-[60px]">
                                    {t('conversation.groupProfile.addMembers')}
                              </span>
                        </div>
                  </div>
            </div>
      );
}