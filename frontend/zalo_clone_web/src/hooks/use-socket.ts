// src/hooks/use-socket.ts
import { useEffect, useState } from 'react';
import { socketManager, type Socket } from '@/lib/socket';
import { authService, useAuthStore } from '@/features/auth';
import { STORAGE_KEYS } from '@/constants/storage-keys';

// Inject auth callbacks once at module load so SocketManager never imports feature modules.
socketManager.init({
      getToken: () => localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN),
      refreshToken: async () => { await authService.refresh(); },
      onLogout: () => useAuthStore.getState().logout(),
      onReset: () => useAuthStore.getState().reset(),
});

export function useSocket() {
      const [socket, setSocket] = useState<Socket | null>(null);
      const [isConnected, setIsConnected] = useState(false);
      const [connectionNonce, setConnectionNonce] = useState(0);
      const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

      useEffect(() => {
            const accessToken = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
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
      }, [isAuthenticated]);

      return { socket, isConnected, connectionNonce };
}