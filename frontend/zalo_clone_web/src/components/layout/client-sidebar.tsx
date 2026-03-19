import { Layout, Avatar, Tooltip, Popover, Button, Modal, Badge } from 'antd';
import {
  MessageOutlined,
  ContainerOutlined,
  PhoneOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  ProfileOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/features/auth';
import { useState } from 'react';
import { UserProfileModal } from '@/features/profile/components/user-profile-modal';
import { useFriendshipStore } from '@/features/contacts/stores/friendship.store';
import { useMissedCallCount } from '@/features/call';
import { ROUTES } from '@/config/routes';
import { useTranslation } from 'react-i18next';

const { Sider } = Layout;

// Định nghĩa kiểu cho Icon Item
interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  isActive?: boolean;
  onClick?: () => void;
  isBottom?: boolean; // Thêm props để phân biệt icon trên và dưới
  badgeCount?: number; // Badge count hiển thị trên icon
}

const SidebarIcon = ({ icon, label, isActive, onClick, isBottom, badgeCount }: SidebarItemProps) => (
  <Tooltip title={label} placement="right">
    <div
      onClick={onClick}
      className={`
        w-12 h-12 flex items-center justify-center rounded-xl cursor-pointer transition-all mx-auto mb-1
        ${isActive
          ? 'bg-[#005AE0] text-white shadow-sm'
          : 'text-white/80 hover:bg-[#005AE0] hover:text-white'
        }
      `}
    >
      <Badge count={badgeCount} size="small" offset={[2, -2]}>
        <div className={`${isBottom ? 'text-xl' : 'text-2xl'} ${isActive ? 'text-white' : 'text-white/80'}`}>
          {icon}
        </div>
      </Badge>
    </div>
  </Tooltip>
);

export function ClientSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuthStore(); // Lấy user từ store
  const { t } = useTranslation();
  const pendingReceivedCount = useFriendshipStore((s) => s.pendingReceivedCount);
  const { data: missedCallData } = useMissedCallCount();
  const missedCallCount = missedCallData?.count ?? 0;

  // State quản lý Modal
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const handleLogout = () => {
    // [3] Hiện Modal xác nhận
    Modal.confirm({
      title: t('layout.client.logoutConfirmTitle'),
      icon: <ExclamationCircleOutlined />,
      content: t('layout.client.logoutConfirmContent'),
      okText: t('layout.client.logout'),
      cancelText: t('layout.client.cancel'),
      okButtonProps: { danger: true }, // Nút màu đỏ để cảnh báo
      centered: true,
      onOk: async () => {
        try {
          await logout(); // Gọi action logout trong store (xóa token, clear state)
          navigate(ROUTES.LOGIN); // Chuyển hướng về trang login
        } catch (error) {
          console.error("Logout failed:", error);
          // Vẫn force chuyển về login nếu lỗi để tránh kẹt user
          navigate(ROUTES.LOGIN);
        }
      },
    });
  };
  // Xử lý mở modal profile
  const handleOpenProfile = () => {
    setPopoverOpen(false); // Đóng popover trước
    setIsProfileModalOpen(true); // Mở modal
  };
  const userProfileContent = (
    <div className="w-60">
      <div className="p-3 border-b border-gray-100 mb-2">
        <p className="font-bold text-gray-800 text-base">{user?.displayName || t('layout.client.defaultUser')}</p>
      </div>
      <Button
        type="text"
        block
        className="text-left h-10 flex items-center gap-3 text-gray-700 hover:bg-blue-50 hover:text-blue-600"
        icon={<ProfileOutlined />}
        onClick={handleOpenProfile} // Gọi hàm mở modal
      >
        {t('layout.client.profile')}
      </Button>
    </div>
  );

  const settingsContent = (
    <div className="w-48">
      <Button
        type="text"
        danger
        block
        className="text-left flex items-center gap-2"
        icon={<LogoutOutlined />}
        onClick={handleLogout}
      >
        {t('layout.client.logout')}
      </Button>
    </div>
  );

  return (
    <>
      <Sider
        width={72} // Tăng nhẹ chiều rộng sidebar cho thoáng
        className="!bg-[#0068ff] h-screen flex flex-col border-none select-none z-50 py-6" // Thêm py-6
        trigger={null}
        collapsible={false}
      >
        <div className="flex flex-col h-full items-center justify-between">

          {/* === TOP SECTION === */}
          <div className="flex flex-col items-center gap-6 w-full">

            {/* Avatar */}
            <Popover
              content={userProfileContent}
              trigger="click"
              placement="rightTop"
              arrow={false} // Bỏ mũi tên cho đẹp
              open={popoverOpen}
              onOpenChange={setPopoverOpen}
            >
              <div className="cursor-pointer hover:opacity-90 transition-opacity">
                <Avatar
                  size={48} // Avatar to hơn chút
                  src={user?.avatarUrl}
                  icon={<UserOutlined />}
                  className="bg-white text-[#0068ff] shadow-md border-2 border-white/20"
                // src="url-anh-cua-ban" 
                />
              </div>
            </Popover>

            {/* Main Navigation */}
            <div className="w-full space-y-2">
              <SidebarIcon
                icon={<MessageOutlined />}
                label={t('layout.client.messages')}
                isActive={location.pathname.startsWith(ROUTES.CHAT)}
                onClick={() => navigate(ROUTES.CHAT)}
              />

              <SidebarIcon
                icon={<ContainerOutlined />}
                label={t('layout.client.contacts')}
                isActive={location.pathname.startsWith(ROUTES.CONTACTS)}
                onClick={() => navigate(ROUTES.CONTACTS)}
                badgeCount={pendingReceivedCount}
              />

              <SidebarIcon
                icon={<PhoneOutlined />}
                label={t('layout.client.calls')}
                isActive={location.pathname.startsWith(ROUTES.CALLS)}
                onClick={() => navigate(ROUTES.CALLS)}
                badgeCount={missedCallCount > 0 ? missedCallCount : undefined}
              />
            </div>
          </div>

          {/* === BOTTOM SECTION === */}
          <div className="flex flex-col items-center gap-3 w-full pb-4">
            {/* <SidebarIcon
            icon={<CloudOutlined />}
            label="Cloud của tôi"
            isBottom={true} // Icon dưới thường nhỏ hơn chút
            onClick={() => { }}
          />

          <SidebarIcon
            icon={<FolderOpenOutlined />}
            label="Quản lý file"
            isBottom={true}
            onClick={() => { }}
          />

          <SidebarIcon
            icon={<ToolOutlined />}
            label="Công cụ"
            isBottom={true}
            onClick={() => { }}
          /> */}

            <SidebarIcon
              icon={<SettingOutlined />}
              label={t('layout.client.settings')}
              isBottom={true}
              isActive={location.pathname.startsWith(ROUTES.SETTINGS)}
              onClick={() => navigate(ROUTES.SETTINGS)}
            />
            <Popover content={settingsContent} trigger="click" placement="rightBottom" arrow={false}>
              <div>
                <SidebarIcon
                  icon={<LogoutOutlined />}
                  label={t('layout.client.logout')}
                  isBottom={true}
                />
              </div>
            </Popover>
          </div>

        </div>
      </Sider>
      <UserProfileModal
        open={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />
    </>
  );
}