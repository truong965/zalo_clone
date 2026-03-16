import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { notification } from 'antd';
import { SocketEvents } from '@/constants/socket-events';
import { authService } from '@/features/auth/api/auth.service';
import { ROUTES } from '@/config/routes';
import { useSocket } from '@/hooks/use-socket';

export function useAuthForceLogout() {
  const navigate = useNavigate();
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleForceLogout = (data: { reason?: string }) => {
      // 1. Clear local auth data immediately to prevent further API calls
      authService.clearAuthData();

      // 2. Stop realtime channel to avoid stale events
      socket.disconnect();

      // 3. Redirect immediately so protected routes are enforced without waiting for user action
      navigate(ROUTES.LOGIN, { replace: true });

      // 4. Notify user with reason
      notification.warning({
        message: 'Đăng xuất tự động',
        description:
          data?.reason ||
          'Tài khoản của bạn vừa đăng nhập ở thiết bị khác hoặc đã bị thu hồi phiên.',
        placement: 'bottomRight',
      });
    };

    socket.on(SocketEvents.AUTH_FORCE_LOGOUT, handleForceLogout);

    return () => {
      socket.off(SocketEvents.AUTH_FORCE_LOGOUT, handleForceLogout);
    };
  }, [isConnected, navigate, socket]);
}
