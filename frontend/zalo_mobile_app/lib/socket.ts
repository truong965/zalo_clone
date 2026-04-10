import { io, Socket } from 'socket.io-client';
import { SocketEvents } from '@/constants/socket-events';

class SocketManager {
  private socket: Socket | null = null;
  private baseUrl: string = '';

  private shouldForcePolling(): boolean {
    return process.env.EXPO_PUBLIC_SOCKET_FORCE_POLLING === 'true';
  }

  private getTransportOptions() {
    const forcePolling = this.shouldForcePolling();

    return {
      transports: forcePolling ? ['polling'] : ['polling', 'websocket'],
      upgrade: !forcePolling,
      tryAllTransports: true,
      rememberUpgrade: false,
    };
  }

  private resolveSocketBaseUrl(): string {
    const envSocketBaseUrl = process.env.EXPO_PUBLIC_SOCKET_BASE_URL?.trim();
    const rawBaseUrl = envSocketBaseUrl || this.baseUrl;

    return rawBaseUrl
      .replace('/api/v1', '')
      .replace(/\/$/, '');
  }

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  connect(token: string): Socket {
    if (this.socket) {
      this.socket.disconnect();
    }

    const baseUrl = this.resolveSocketBaseUrl();
    if (!baseUrl) {
      throw new Error('Socket base URL not configured');
    }
    const socketUrl = `${baseUrl}/socket.io`;

    this.socket = io(socketUrl, {
      path: '/socket.io',
      auth: { token },
      ...this.getTransportOptions(),
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,        // Đợi 1s trước khi thử lại
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      timeout: 20000,
    });

    this.socket.on(SocketEvents.CONNECT, () => {
      console.log('✅ Socket connected:', {
        id: this.socket?.id,
        transport: this.socket?.io.engine?.transport?.name,
      });
    });

    this.socket.on(SocketEvents.CONNECT_ERROR, (error: any) => {
      console.error('❌ Socket connection error:', {
        message: error?.message,
        description: error?.description,
        context: error?.context,
        transport: this.socket?.io.engine?.transport?.name,
      });
    });

    this.socket.on('error', (error) => {
      console.error('❌ Socket transport error:', error);
    });

    this.socket.on(SocketEvents.ERROR, (payload: any) => {
      console.error('❌ Socket application error:', payload);
    });

    // Wrap emit to log all outgoing events
    const originalEmit = this.socket.emit.bind(this.socket);
    this.socket.emit = (event: string, ...args: any[]) => {
      console.log(`[Socket] emit: ${event}`, args[0]);
      return originalEmit(event, ...args);
    };

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  connectUnauthenticated(): Socket {
    if (this.socket) {
      this.socket.disconnect();
    }

    const baseUrl = this.resolveSocketBaseUrl();
    if (!baseUrl) {
      throw new Error('Socket base URL not configured');
    }
    const socketUrl = `${baseUrl}/socket.io`;

    this.socket = io(socketUrl, {
      path: '/socket.io',
      ...this.getTransportOptions(),
      query: { type: 'public' }, // Báo cho Backend đây là kết nối công khai hợp lệ
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 10,
      timeout: 20000,
    });

    this.socket.on(SocketEvents.CONNECT, () => {
      console.log('✅ Socket connected (Unauthenticated):', {
        id: this.socket?.id,
        transport: this.socket?.io.engine?.transport?.name,
      });
    });

    this.socket.on(SocketEvents.CONNECT_ERROR, (error: any) => {
      console.error('❌ Socket connection error (Unauthenticated):', {
        message: error?.message,
        description: error?.description,
        context: error?.context,
        transport: this.socket?.io.engine?.transport?.name,
      });
    });

    return this.socket;
  }

  async emitWithAck<T>(
    event: string,
    data: any,
  ): Promise<T> {
    console.log(`[Socket] emitWithAck: ${event}`, data);
    if (!this.socket) {
      throw new Error('Socket not connected');
    }

    return new Promise((resolve, reject) => {
      // Setup timeout to avoid hanging promises (same behavior as web or reasonable UX)
      this.socket?.timeout(15000).emit(event, data, (err: any, response: any) => {
        if (err) {
          reject(new Error('Socket emit timeout'));
          return;
        }

        if (response && typeof response === 'object' && 'error' in response) {
          reject(new Error(response.error || 'Unknown error'));
          return;
        }

        if (
          response &&
          typeof response === 'object' &&
          'success' in response &&
          'data' in response
        ) {
          resolve(response.data as T);
        } else {
          resolve(response as T);
        }
      });
    });
  }
}

export const socketManager = new SocketManager();
