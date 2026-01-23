import { Injectable, Logger, Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  AuthenticatedSocket,
  SocketMetadata,
} from 'src/common/interfaces/socket-client.interface';
import { RedisRegistryService } from 'src/modules/redis/services/redis-registry.service';
import { RedisPresenceService } from 'src/modules/redis/services/redis-presence.service';
import { DeviceFingerprintService } from 'src/modules/auth/services/device-fingerprint.service';
import socketConfig from 'src/config/socket.config';
import { Request } from 'express';
import { SocketConnectionLoggerService } from './socket-connection-logger.service';

@Injectable()
export class SocketStateService {
  private readonly logger = new Logger(SocketStateService.name);

  constructor(
    private readonly redisRegistry: RedisRegistryService,
    private readonly redisPresence: RedisPresenceService,
    private readonly deviceFingerprint: DeviceFingerprintService,
    private readonly connectionLogger: SocketConnectionLoggerService,
    @Inject(socketConfig.KEY)
    private readonly config: ConfigType<typeof socketConfig>,
  ) {}

  /**
   * Handle new socket connection
   */
  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    try {
      // Extract device info from socket handshake
      const deviceInfo = this.extractDeviceInfo(client);

      // Store deviceId on socket for later use
      client.deviceId = deviceInfo.deviceId;

      // Build socket metadata
      if (client.userId !== undefined) {
        const metadata: SocketMetadata = {
          socketId: client.id,
          userId: client.userId,
          deviceId: deviceInfo.deviceId,
          ipAddress: deviceInfo.ipAddress,
          userAgent: deviceInfo.userAgent,
          connectedAt: new Date(),
          serverInstance: this.config.serverInstance,
        };

        // Register socket in Redis
        await this.redisRegistry.registerSocket(metadata);

        // Mark user as online with this device
        await this.redisPresence.setUserOnline(
          client.userId,
          deviceInfo.deviceId,
        );

        // Log connection to database
        await this.connectionLogger.logConnection(metadata);
      }
      this.logger.log(
        `Socket connected: ${client.id} | User: ${client.userId} | Device: ${deviceInfo.deviceId}`,
      );
    } catch (error) {
      this.logger.error('Error handling socket connection:', error);
      throw error;
    }
  }

  /**
   * Handle socket disconnection
   */
  async handleDisconnection(
    client: AuthenticatedSocket,
    reason: string,
  ): Promise<boolean | void> {
    try {
      if (!client.userId) {
        this.logger.warn(`Socket ${client.id} disconnected without userId`);
        return;
      }

      // Unregister socket from Redis
      await this.redisRegistry.unregisterSocket(client.id);

      // Remove device from user's presence
      // If last device, user will be marked offline
      if (!client.deviceId) {
        this.logger.warn(`Socket ${client.id} disconnected without deviceId`);
        return;
      }
      const isOffline = await this.redisPresence.removeUserDevice(
        client.userId,
        client.deviceId,
      );
      //  Log disconnection to database
      // TODO: In Phase 2, track actual message counts from socket events
      await this.connectionLogger.logDisconnection(
        client.id,
        reason,
        0, // messagesSent - will be tracked in Phase 2
        0, // messagesReceived - will be tracked in Phase 2
      );

      this.logger.log(
        `Socket disconnected: ${client.id} | User: ${client.userId} | Reason: ${reason} | Offline: ${isOffline}`,
      );

      return isOffline;
    } catch (error) {
      this.logger.error('Error handling socket disconnection:', error);
    }
  }

  /**
   * Get all socket IDs for a user
   */
  async getUserSockets(userId: string): Promise<string[]> {
    return this.redisRegistry.getUserSockets(userId);
  }

  /**
   * Check if user is online
   */
  async isUserOnline(userId: string): Promise<boolean> {
    return this.redisPresence.isUserOnline(userId);
  }

  /**
   * Get socket metadata
   */
  async getSocketMetadata(socketId: string): Promise<SocketMetadata | null> {
    return this.redisRegistry.getSocketMetadata(socketId);
  }

  /**
   * Refresh socket heartbeat
   */
  async refreshHeartbeat(socketId: string, userId: string): Promise<void> {
    await Promise.all([
      this.redisRegistry.refreshSocketTTL(socketId),
      this.redisPresence.refreshUserPresence(userId),
    ]);
  }

  /**
   * Extract device info from socket
   */
  private extractDeviceInfo(client: AuthenticatedSocket): {
    deviceId: string;
    ipAddress: string;
    userAgent: string;
  } {
    // Create a mock Express request object for device fingerprint service
    const mockRequest = {
      headers: {
        'user-agent': client.handshake.headers['user-agent'] || '',
        'x-device-name': client.handshake.headers['x-device-name'],
        'x-device-type': client.handshake.headers['x-device-type'],
        'x-platform': client.handshake.headers['x-platform'],
        'x-screen-resolution': client.handshake.headers['x-screen-resolution'],
        'x-timezone': client.handshake.headers['x-timezone'],
        'accept-language': client.handshake.headers['accept-language'],
        'accept-encoding': client.handshake.headers['accept-encoding'],
        'x-forwarded-for': client.handshake.headers['x-forwarded-for'],
        'x-real-ip': client.handshake.headers['x-real-ip'],
      },
      ip: client.handshake.address,
      socket: {
        remoteAddress: client.handshake.address,
      },
    } as unknown as Request;

    const deviceInfo = this.deviceFingerprint.extractDeviceInfo(mockRequest);

    return {
      deviceId: deviceInfo.deviceId,
      ipAddress: deviceInfo.ipAddress,
      userAgent: deviceInfo.userAgent,
    };
  }
}
