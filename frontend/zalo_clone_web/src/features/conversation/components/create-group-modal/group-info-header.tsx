/**
 * GroupInfoHeader — Avatar upload + Group name input
 *
 * Top section of the Create Group Modal.
 * Avatar click opens file picker, name input with max 100 chars.
 */

import { useRef } from 'react';
import { Input, Avatar, message } from 'antd';
import { CameraOutlined, TeamOutlined } from '@ant-design/icons';
import { useCreateGroupStore } from '../../stores/create-group.store';

const MAX_NAME_LENGTH = 100;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function GroupInfoHeader() {
      const groupName = useCreateGroupStore((s) => s.groupName);
      const avatarPreview = useCreateGroupStore((s) => s.avatarPreview);
      const setGroupName = useCreateGroupStore((s) => s.setGroupName);
      const setAvatarFile = useCreateGroupStore((s) => s.setAvatarFile);

      const fileInputRef = useRef<HTMLInputElement>(null);

      const handleAvatarClick = () => {
            fileInputRef.current?.click();
      };

      const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;

            if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
                  void message.error('Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP');
                  return;
            }

            if (file.size > MAX_FILE_SIZE) {
                  void message.error('Kích thước ảnh tối đa 5MB');
                  return;
            }

            setAvatarFile(file);
            // Reset input so same file can be selected again
            e.target.value = '';
      };

      return (
            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                  {/* Avatar upload */}
                  <div
                        className="relative cursor-pointer group flex-shrink-0"
                        onClick={handleAvatarClick}
                  >
                        <Avatar
                              size={48}
                              src={avatarPreview}
                              icon={!avatarPreview ? <TeamOutlined /> : undefined}
                              className="bg-blue-100 text-blue-500"
                        />
                        <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <CameraOutlined className="text-white text-sm" />
                        </div>
                        <input
                              ref={fileInputRef}
                              type="file"
                              accept={ACCEPTED_IMAGE_TYPES.join(',')}
                              className="hidden"
                              onChange={handleFileChange}
                        />
                  </div>

                  {/* Name input */}
                  <Input
                        placeholder="Nhập tên nhóm..."
                        value={groupName}
                        onChange={(e) => setGroupName(e.target.value)}
                        maxLength={MAX_NAME_LENGTH}
                        variant="borderless"
                        className="text-base font-medium"
                        autoFocus
                  />
            </div>
      );
}
