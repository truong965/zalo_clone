import { useEffect, useState } from 'react';
import { useCallStore } from '@/features/call/stores/call.store';
import { socketManager, type Socket } from '@/lib/socket';
import { useAuthStore } from '@/features/auth';
import { notification } from 'antd';
import { SocketEvents } from '@/constants/socket-events';

// Inject auth callbacks once at module load so SocketManager never imports feature modules.
socketManager.init({
      getToken: () => useAuthStore.getState().accessToken,
      refreshToken: async () => { await useAuthStore.getState().refreshToken(); },
      onLogout: () => useAuthStore.getState().logout(),
      onReset: () => useAuthStore.getState().reset(),
      onError: (message: string, code?: string) => {
            const normalizedMessage = message?.toLowerCase?.() ?? '';

            // Incoming call has its own full-screen UI, so suppress generic global popups.
            if (
                  normalizedMessage === 'incoming_call' ||
                  normalizedMessage.includes('incoming call') ||
                  normalizedMessage.includes('call:incoming')
            ) {
                  return;
            }

            // Fix: Catch call-related errors directly and force reset call UI.
            const isCallContext =
                  code === 'CALL_ERROR' ||
                  normalizedMessage.includes('privacy') ||
                  normalizedMessage.includes('friendship') ||
                  normalizedMessage.includes('call') ||
                  normalizedMessage === 'answered_elsewhere' ||
                  normalizedMessage === 'caller_cancelled' ||
                  normalizedMessage === 'rejected_elsewhere';

            if (isCallContext) {
                  const isCallEndedNotice =
                        normalizedMessage === 'answered_elsewhere' ||
                        normalizedMessage === 'caller_cancelled' ||
                        normalizedMessage === 'rejected_elsewhere' ||
                        normalizedMessage.includes('hangup') ||
                        normalizedMessage.includes('no_answer') ||
                        normalizedMessage.includes('call ended') ||
                        normalizedMessage.includes('call_ended') ||
                        normalizedMessage.includes('đã kết thúc');

                  console.warn('[Socket Global Error] Resetting call state due to error:', message);
                  useCallStore.getState().setError(message);
                  useCallStore.getState().resetCallState();

                  if (isCallEndedNotice) {
                        notification.info({
                              message: 'Cuộc gọi đã kết thúc',
                              placement: 'topRight',
                        });
                        return; // Don't show a second notification
                  }

                  notification.error({
                        message: 'Lỗi cuộc gọi',
                        description: message,
                        placement: 'topRight',
                  });
                  return; // Don't show the generic notification
            }

            notification.error({
                  message: 'Thông báo',
                  description: message,
                  placement: 'topRight',
            });
      },
});

export function useSocket() {
      const [socket, setSocket] = useState<Socket | null>(null);
      const [isConnected, setIsConnected] = useState(false);
      const [connectionNonce, setConnectionNonce] = useState(0);
      const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
      const accessToken = useAuthStore((s) => s.accessToken);

      useEffect(() => {
            if (!isAuthenticated || !accessToken) {
                  socketManager.disconnect();
                  queueMicrotask(() => {
                        setSocket(null);
                        setIsConnected(false);
                  });
                  return;
            }

            // Connect socket
            const socketInstance = socketManager.connect(accessToken);
            queueMicrotask(() => setSocket(socketInstance));

            // Track connection status
            const handleConnect = () => queueMicrotask(() => {
                  setIsConnected(true);
                  setConnectionNonce((v) => v + 1);
            });
            const handleDisconnect = () => queueMicrotask(() => setIsConnected(false));

            socketInstance.on('connect', handleConnect);
            socketInstance.on('disconnect', handleDisconnect);

            // [Account Sync] Listen for account updates (email changed elsewhere)
            socketInstance.on(SocketEvents.ACCOUNT_EMAIL_UPDATED, (data) => {
                  console.log('🔄 Account email updated elsewhere. Refreshing profile...', data);
                  void useAuthStore.getState().getProfile();
            });

            // [Security] Listen for force logout signal
            socketInstance.on(SocketEvents.AUTH_FORCE_LOGOUT, (data) => {
                  console.warn('⚠️ Force logout received from server:', data?.reason);
                  void useAuthStore.getState().logout();
                  notification.warning({
                        message: 'Phiên đăng nhập hết hạn',
                        description: data?.reason || 'Bạn đã đăng xuất khỏi thiết bị này.',
                        placement: 'topRight',
                  });
            });

            // Set initial state
            queueMicrotask(() => setIsConnected(socketInstance.connected));

            // Cleanup
            return () => {
                  socketInstance.off('connect', handleConnect);
                  socketInstance.off('disconnect', handleDisconnect);
                  socketInstance.off(SocketEvents.ACCOUNT_EMAIL_UPDATED);
                  socketInstance.off(SocketEvents.AUTH_FORCE_LOGOUT);
            };
      }, [isAuthenticated, accessToken]);

      return { socket, isConnected, connectionNonce };
}