import { io, Socket } from 'socket.io-client';
import { SocketEvents } from '@/constants/socket-events';

class SocketManager {
  private socket: Socket | null = null;
  private baseUrl: string = '';

  setBaseUrl(url: string) {
    this.baseUrl = url;
  }

  connect(token: string): Socket {
    if (this.socket) {
      this.socket.disconnect();
    }

    const baseUrl = this.baseUrl.replace('/api/v1', '') || 'http://localhost:8000';
    const socketUrl = `${baseUrl}/socket.io`;

    this.socket = io(socketUrl, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,        // Đợi 1s trước khi thử lại
      reconnectionDelayMax: 5000,
    });

    this.socket.on(SocketEvents.CONNECT, () => {
      console.log('✅ Socket connected:', this.socket?.id);
    });

    this.socket.on(SocketEvents.CONNECT_ERROR, (error) => {
      console.error('❌ Socket connection error:', error.message);
    });

    this.socket.on('error', (error) => {
      console.error('❌ Socket transport error:', error);
    });

    this.socket.on(SocketEvents.ERROR, (payload: any) => {
      console.error('❌ Socket application error:', payload);
    });

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

  async emitWithAck<T>(
    event: string,
    data: any,
  ): Promise<T> {
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
