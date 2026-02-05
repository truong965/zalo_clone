/**
 * Khởi tạo Socket.IO client (Singleton Pattern)
 */

import { io, Socket } from 'socket.io-client';
import { env } from '@/config/env';

let socket: Socket | null = null;

export function initSocket(): Socket {
  if (socket) {
    return socket;
  }

  socket = io(env.SOCKET_URL, {
    auth: {
      token: localStorage.getItem('accessToken'),
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    console.log('Socket connected:', socket?.id);
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected');
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });

  return socket;
}

export function getSocket(): Socket {
  if (!socket) {
    return initSocket();
  }
  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
