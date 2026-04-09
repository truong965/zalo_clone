// src/hooks/use-socket.ts
import { useEffect, useState } from 'react';
import { socketManager, type Socket } from '@/lib/socket';
import { authService, useAuthStore } from '@/features/auth';
import { notification } from 'antd';

// Inject auth callbacks once at module load so SocketManager never imports feature modules.
socketManager.init({
      getToken: () => useAuthStore.getState().accessToken,
      refreshToken: async () => { await useAuthStore.getState().refreshToken(); },
      onLogout: () => useAuthStore.getState().logout(),
      onReset: () => useAuthStore.getState().reset(),
      onError: (message: string) => {
            const description = message === 'answered_elsewhere' 
                 ? 'Cuộc gọi đã được trả lời trên thiết bị khác' 
                 : message;
            notification.error({
                  message: 'Thông báo',
                  description,
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

            // Set initial state
            queueMicrotask(() => setIsConnected(socketInstance.connected));

            // Cleanup
            return () => {
                  socketInstance.off('connect', handleConnect);
                  socketInstance.off('disconnect', handleDisconnect);
            };
      }, [isAuthenticated, accessToken]);

      return { socket, isConnected, connectionNonce };
}