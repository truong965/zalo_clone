import React, { createContext, useContext, useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { socketManager } from '@/lib/socket';
import { useAuth } from './auth-provider';
import { mobileApi } from '@/services/api';
import { SocketEvents } from '@/constants/socket-events';

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
});

export const useSocket = () => useContext(SocketContext);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { accessToken, isAuthenticated, logout } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    socketManager.setBaseUrl(mobileApi.baseUrl);
    
    if (isAuthenticated && accessToken) {
      const s = socketManager.connect(accessToken);
      setSocket(s);

      const onConnect = () => setIsConnected(true);
      const onDisconnect = () => setIsConnected(false);
      const onAuthFailed = async () => {
        await logout();
      };
      const onAuthForceLogout = async () => {
        await logout();
      };

      s.on('connect', onConnect);
      s.on('disconnect', onDisconnect);
      s.on(SocketEvents.AUTH_FAILED, onAuthFailed);
      s.on(SocketEvents.AUTH_FORCE_LOGOUT, onAuthForceLogout);

      return () => {
        s.off('connect', onConnect);
        s.off('disconnect', onDisconnect);
        s.off(SocketEvents.AUTH_FAILED, onAuthFailed);
        s.off(SocketEvents.AUTH_FORCE_LOGOUT, onAuthForceLogout);
        socketManager.disconnect();
      };
    } else {
      socketManager.disconnect();
      setSocket(null);
      setIsConnected(false);
    }
  }, [isAuthenticated, accessToken, logout]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}
