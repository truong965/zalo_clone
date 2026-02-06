import { registerAs } from '@nestjs/config';

export default registerAs('socket', () => ({
  // CORS configuration
  cors: {
    // origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST'],
  },

  // Connection settings
  pingInterval: process.env.PING_INTERVAL
    ? parseInt(process.env.PING_INTERVAL, 10)
    : 25000, // 25 seconds
  pingTimeout: process.env.PING_TIMEOUT
    ? parseInt(process.env.PING_TIMEOUT, 10)
    : 20000, // 20 seconds
  upgradeTimeout: process.env.UPGRADE_TIMEOUT
    ? parseInt(process.env.UPGRADE_TIMEOUT, 10)
    : 10000, // 10 seconds

  // Transport settings
  transports: ['websocket', 'polling'],
  allowUpgrades: true,

  // Server identifier (for multi-instance deployment)
  serverInstance:
    process.env.SERVER_INSTANCE || `server-${process.env.HOSTNAME || 'local'}`,

  // Namespace
  namespace: '/socket.io',

  // Max payload size (64KB)
  maxHttpBufferSize: parseInt(process.env.MAX_PAYLOAD_SIZE!, 10) || 64 * 1024,

  // Connection limits
  maxConnections: parseInt(process.env.MAX_SOCKET_CONNECTIONS!, 10) || 10000,

  // Graceful shutdown
  gracefulShutdownTimeout: 30000, // 30 seconds
}));
