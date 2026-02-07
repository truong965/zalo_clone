// src/hooks/use-socket.ts
import { useEffect, useState } from 'react';
import { socketManager, type Socket } from '@/lib/socket';
import { useAuthStore } from '@/features/auth';

export function useSocket() {
      const [socket, setSocket] = useState<Socket | null>(null);
      const [isConnected, setIsConnected] = useState(false);
      const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

      useEffect(() => {
            const accessToken = localStorage.getItem('accessToken');
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
            const handleConnect = () => queueMicrotask(() => setIsConnected(true));
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

      return { socket, isConnected };
}