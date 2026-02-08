// src/lib/socket.ts
import { env } from '@/config/env';
import { io, Socket } from 'socket.io-client';
import { SocketEvents } from '@/constants/socket-events';
import { authService } from '@/features/auth/api/auth.service';
import { useAuthStore } from '@/features/auth/stores/auth.store';

class SocketManager {
  private socket: Socket | null = null;
  private token: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  private isRefreshingAuth = false;
  private refreshedOnceForThisSocket = false;

  private ensureSocket(): Socket {
    if (this.socket) return this.socket;

    // Backend: @WebSocketGateway({ namespace: '/socket.io', ... })
    // => Client must connect to that namespace by using URL + namespace suffix.
    this.socket = io(`${env.SOCKET_URL}/socket.io`, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token: this.token ?? '' },
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: this.maxReconnectAttempts,
    });

    // Connection events
    this.socket.on('connect', () => {
      console.log('✅ Socket connected:', this.socket?.id);
      this.reconnectAttempts = 0;
      this.refreshedOnceForThisSocket = false;
    });

    this.socket.on('disconnect', (reason) => {
      console.warn('⚠️ Socket disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error.message);
      const isAuthError =
        typeof error.message === 'string' &&
        (error.message.toLowerCase().includes('unauthorized') ||
          error.message.toLowerCase().includes('jwt') ||
          error.message.toLowerCase().includes('auth'));

      if (isAuthError) {
        void this.refreshAuthAndReconnect();
        return;
      }

      this.reconnectAttempts++;
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('🔴 Max reconnect attempts reached');
        this.disconnect();
      }
    });

    this.socket.on(SocketEvents.AUTH_FAILED, () => {
      void this.refreshAuthAndReconnect();
    });

    this.socket.on('error', (error) => {
      console.error('❌ Socket error:', error);
    });

    return this.socket;
  }

  private async refreshAuthAndReconnect(): Promise<void> {
    if (this.isRefreshingAuth) return;
    if (this.refreshedOnceForThisSocket) {
      try {
        await useAuthStore.getState().logout();
      } catch {
        useAuthStore.getState().reset();
      }
      this.disconnect();
      return;
    }

    this.isRefreshingAuth = true;
    this.refreshedOnceForThisSocket = true;
    try {
      await authService.refresh();
      const newToken = localStorage.getItem('accessToken');
      if (!newToken) {
        try {
          await useAuthStore.getState().logout();
        } catch {
          useAuthStore.getState().reset();
        }
        this.disconnect();
        return;
      }
      this.connect(newToken);
    } catch {
      try {
        await useAuthStore.getState().logout();
      } catch {
        useAuthStore.getState().reset();
      }
      this.disconnect();
    } finally {
      this.isRefreshingAuth = false;
    }
  }

  connect(token: string): Socket {
    this.token = token;
    const socket = this.ensureSocket();
    socket.auth = { token };

    if (!socket.connected) {
      socket.connect();
    }

    return socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.token = null;
      this.isRefreshingAuth = false;
      this.refreshedOnceForThisSocket = false;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const socketManager = new SocketManager();
export { Socket };