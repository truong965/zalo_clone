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

    const socketUrl = this.baseUrl.replace('/api/v1', '') || 'http://localhost:8000';
    
    this.socket = io(socketUrl, {
      path: '/socket.io',
      auth: { token },
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
    });

    this.socket.on(SocketEvents.CONNECT, () => {
      console.log('✅ Socket connected:', this.socket?.id);
    });

    this.socket.on(SocketEvents.CONNECT_ERROR, (error) => {
      console.error('❌ Socket connection error:', error.message);
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
}

export const socketManager = new SocketManager();
