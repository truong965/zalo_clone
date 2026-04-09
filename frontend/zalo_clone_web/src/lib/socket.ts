// src/lib/socket.ts
import { env } from '@/config/env';
import { io, Socket } from 'socket.io-client';
import { SocketEvents } from '@/constants/socket-events';

interface SocketAuthCallbacks {
  getToken: () => string | null;
  refreshToken: () => Promise<void>;
  onLogout: () => Promise<void>;
  onReset: () => void;
  onError?: (message: string) => void;
}

class SocketManager {
  private socket: Socket | null = null;
  private token: string | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  private isRefreshingAuth = false;
  private refreshedOnceForThisSocket = false;

  // DI callbacks — set via init() before first connect()
  private getTokenFn: () => string | null = () => null;
  private refreshTokenFn: () => Promise<void> = async () => { };
  private onLogoutFn: () => Promise<void> = async () => { };
  private onResetFn: () => void = () => { };
  private onErrorFn: (message: string) => void = (msg) => console.error('Socket Global Error:', msg);

  /**
   * Inject auth callbacks so this class never imports from @/features/auth.
   * Call this once during application bootstrap (e.g. in use-socket.ts).
   */
  init(callbacks: SocketAuthCallbacks): void {
    this.getTokenFn = callbacks.getToken;
    this.refreshTokenFn = callbacks.refreshToken;
    this.onLogoutFn = callbacks.onLogout;
    this.onResetFn = callbacks.onReset;
    if (callbacks.onError) {
      this.onErrorFn = callbacks.onError;
    }
  }

  private ensureSocket(): Socket {
    if (this.socket) return this.socket;

    // Backend: @WebSocketGateway({ namespace: '/socket.io', ... })
    // => Client must connect to that namespace by using URL + namespace suffix.
    this.socket = io(`${env.SOCKET_URL}/socket.io`, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: this.token ? { token: this.token } : {},
      query: this.token ? {} : { type: 'public' },
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
 
    this.socket.on(SocketEvents.SERVER_SHUTDOWN, () => {
      console.warn('⚠️ Server is shutting down. Disconnecting gracefully...');
      this.disconnect();
    });

    this.socket.on('error', (error) => {
      console.error('❌ Socket transport error:', error);
    });

    // Application-level error events from the backend (WsExceptionFilter fallback)
    this.socket.on(SocketEvents.ERROR, (payload: any) => {
      console.error('❌ Socket error:', payload);
      const message = payload.message || payload.error || 'Unknown socket error';
      this.onErrorFn(message);
    });

    return this.socket;
  }

  private async refreshAuthAndReconnect(): Promise<void> {
    if (this.isRefreshingAuth) return;
    if (this.refreshedOnceForThisSocket) {
      try {
        await this.onLogoutFn();
      } catch {
        this.onResetFn();
      }
      this.disconnect();
      return;
    }

    this.isRefreshingAuth = true;
    this.refreshedOnceForThisSocket = true;
    try {
      await this.refreshTokenFn();
      const newToken = this.getTokenFn();
      if (!newToken) {
        try {
          await this.onLogoutFn();
        } catch {
          this.onResetFn();
        }
        this.disconnect();
        return;
      }
      this.connect(newToken);
    } catch {
      try {
        await this.onLogoutFn();
      } catch {
        this.onResetFn();
      }
      this.disconnect();
    } finally {
      this.isRefreshingAuth = false;
    }
  }

  connect(token: string): Socket {
    this.token = token;
    
    // Nếu token thay đổi, disconnect socket cũ để tạo kết nối xác thực mới
    if (this.socket && (!this.socket.auth || (this.socket.auth as any).token !== token)) {
      this.socket.disconnect();
      this.socket = null;
    }

    const socket = this.ensureSocket();
    socket.auth = { token };
    socket.io.opts.query = {};

    if (!socket.connected) {
      socket.connect();
    }

    return socket;
  }

  connectUnauthenticated(): Socket {
    this.token = null;

    if (this.socket && (this.socket.auth as any)?.token) {
      this.socket.disconnect();
      this.socket = null;
    }

    const socket = this.ensureSocket();
    socket.auth = {};
    socket.io.opts.query = { type: 'public' };

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

  /**
   * Unified emit with acknowledgment.
   * Automatically handles { error: string } from backend and triggers global notification.
   */
  async emitWithAck<T>(
    event: string,
    data: any,
    options?: { skipGlobalError?: boolean }
  ): Promise<T> {
    const socket = this.ensureSocket();

    return new Promise((resolve, reject) => {
      socket.emit(event, data, (response: any) => {
        if (response && typeof response === 'object' && 'error' in response) {
          const errorMsg = response.error || 'Unknown error';
          if (!options?.skipGlobalError) {
            this.onErrorFn(errorMsg);
          }
          reject(new Error(errorMsg));
          return;
        }

        // Backend WsTransformInterceptor wraps success in { success: true, data: T }
        if (
          response &&
          typeof response === 'object' &&
          'success' in response &&
          'data' in response
        ) {
          resolve(response.data as T);
        } else {
          // Fallback for non-wrapped responses
          resolve(response as T);
        }
      });
    });
  }
}

export const socketManager = new SocketManager();
export { Socket };