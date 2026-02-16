/**
 * GroupProfileHeader — Group avatar, editable name, and quick actions.
 *
 * Composition: stateless presentational component.
 * Admin can edit group name inline.
 */
import { useState, useRef, useEffect } from 'react';
import { Avatar, Button, Input } from 'antd';
import {
      EditOutlined,
      CheckOutlined,
      CloseOutlined,
      BellOutlined,
      PushpinOutlined,
      UserAddOutlined,
      TeamOutlined,
} from '@ant-design/icons';
import type { ConversationUI } from '@/features/conversation/types/conversation';

interface GroupProfileHeaderProps {
      conversation: ConversationUI;
      isAdmin: boolean;
      onUpdateName: (name: string) => Promise<void>;
      onAddMembers: () => void;
}

export function GroupProfileHeader({
      conversation,
      isAdmin,
      onUpdateName,
      onAddMembers,
}: GroupProfileHeaderProps) {
      const [isEditing, setIsEditing] = useState(false);
      const [editName, setEditName] = useState(conversation.name ?? '');
      const inputRef = useRef<ReturnType<typeof Input>>(null);

      useEffect(() => {
            setEditName(conversation.name ?? '');
      }, [conversation.name]);

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

      return (
            <div className="flex-none flex flex-col items-center py-6 bg-white border-b border-gray-100 border-[6px] border-b-[#f4f5f7]">
                  {/* Group Avatar */}
                  <Avatar
                        size={64}
                        src={conversation.avatar}
                        icon={!conversation.avatar ? <TeamOutlined /> : undefined}
                        className="mb-3 border border-gray-200 bg-blue-100"
                  />

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
                                          {conversation.name || 'Nhóm'}
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
                        <div className="flex flex-col items-center gap-2 cursor-pointer group">
                              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                                    <BellOutlined className="text-gray-600 group-hover:text-blue-600" />
                              </div>
                              <span className="text-xs text-gray-500 text-center max-w-[60px]">
                                    Tắt thông báo
                              </span>
                        </div>
                        <div className="flex flex-col items-center gap-2 cursor-pointer group">
                              <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                                    <PushpinOutlined className="text-gray-600 group-hover:text-blue-600" />
                              </div>
                              <span className="text-xs text-gray-500 text-center max-w-[60px]">
                                    Ghim hội thoại
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
                                    Thêm thành viên
                              </span>
                        </div>
                  </div>
            </div>
      );
}
