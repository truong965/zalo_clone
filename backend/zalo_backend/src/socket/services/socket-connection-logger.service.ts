import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import {
  SocketMetadata,
  DisconnectReason,
} from 'src/common/interfaces/socket-client.interface';

@Injectable()
export class SocketConnectionLoggerService {
  private readonly logger = new Logger(SocketConnectionLoggerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log new socket connection to database
   */
  async logConnection(metadata: SocketMetadata): Promise<void> {
    try {
      await this.prisma.socketConnection.create({
        data: {
          userId: metadata.userId,
          socketId: metadata.socketId,
          deviceId: metadata.deviceId,
          serverInstance: metadata.serverInstance,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          connectedAt: metadata.connectedAt,
        },
      });

      this.logger.debug(
        `Socket connection logged to DB: ${metadata.socketId} for user ${metadata.userId}`,
      );
    } catch (error) {
      // Don't throw - logging failure shouldn't crash connection
      this.logger.error('Failed to log socket connection to DB:', error);
    }
  }

  /**
   * Log socket disconnection and calculate metrics
   */
  async logDisconnection(
    socketId: string,
    reason: string,
    messagesSent: number = 0,
    messagesReceived: number = 0,
  ): Promise<void> {
    try {
      const now = new Date();

      // Find the connection record
      const connection = await this.prisma.socketConnection.findFirst({
        where: {
          socketId,
          disconnectedAt: null, // Only update if not already disconnected
        },
        orderBy: {
          connectedAt: 'desc', // Get most recent connection
        },
      });

      if (!connection) {
        this.logger.warn(
          `Socket connection not found in DB for disconnection: ${socketId}`,
        );
        return;
      }

      // Calculate duration in seconds
      const durationMs = now.getTime() - connection.connectedAt.getTime();
      const durationSeconds = Math.floor(durationMs / 1000);

      // Update with disconnection info
      await this.prisma.socketConnection.update({
        where: { id: connection.id },
        data: {
          disconnectedAt: now,
          disconnectReason: this.normalizeDisconnectReason(reason),
          duration: durationSeconds,
          messagesSent,
          messagesReceived,
        },
      });

      this.logger.debug(
        `Socket disconnection logged: ${socketId} (duration: ${durationSeconds}s)`,
      );
    } catch (error) {
      this.logger.error('Failed to log socket disconnection to DB:', error);
    }
  }

  /**
   * Update message counters for active connection
   */
  async incrementMessageCount(
    socketId: string,
    type: 'sent' | 'received',
  ): Promise<void> {
    try {
      const connection = await this.prisma.socketConnection.findFirst({
        where: {
          socketId,
          disconnectedAt: null,
        },
        orderBy: {
          connectedAt: 'desc',
        },
      });

      if (!connection) return;

      await this.prisma.socketConnection.update({
        where: { id: connection.id },
        data: {
          messagesSent:
            type === 'sent' ? { increment: 1 } : connection.messagesSent,
          messagesReceived:
            type === 'received'
              ? { increment: 1 }
              : connection.messagesReceived,
        },
      });
    } catch (error) {
      // Silent fail - don't impact message delivery
      this.logger.debug(
        'Failed to update message count:',
        (error as Error).message,
      );
    }
  }

  /**
   * Normalize disconnect reason to match database enum
   */
  private normalizeDisconnectReason(reason: string): string {
    const reasonMap: Record<string, string> = {
      [DisconnectReason.CLIENT_DISCONNECT]: 'client_disconnect',
      [DisconnectReason.SERVER_SHUTDOWN]: 'server_shutdown',
      [DisconnectReason.TIMEOUT]: 'timeout',
      [DisconnectReason.AUTH_FAILED]: 'auth_failed',
      [DisconnectReason.TRANSPORT_ERROR]: 'transport_error',
      [DisconnectReason.PING_TIMEOUT]: 'ping_timeout',

      // Socket.IO built-in reasons
      'transport close': 'transport_error',
      'transport error': 'transport_error',
      'ping timeout': 'ping_timeout',
      'server namespace disconnect': 'server_shutdown',
      'client namespace disconnect': 'client_disconnect',
    };

    return reasonMap[reason] || 'client_disconnect';
  }

  /**
   * Cleanup old connection logs (retention policy: 7 days)
   * Call this from a cron job
   */
  async cleanupOldLogs(retentionDays: number = 7): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await this.prisma.socketConnection.deleteMany({
        where: {
          disconnectedAt: {
            not: null,
            lt: cutoffDate,
          },
        },
      });

      this.logger.log(
        `Cleaned up ${result.count} socket connection logs older than ${retentionDays} days`,
      );

      return result.count;
    } catch (error) {
      this.logger.error('Failed to cleanup old socket logs:', error);
      return 0;
    }
  }

  /**
   * Get connection statistics
   */
  async getConnectionStats(userId?: string): Promise<{
    total: number;
    active: number;
    averageDuration: number;
  }> {
    const where = userId ? { userId } : {};

    const [total, active, avgDuration] = await Promise.all([
      this.prisma.socketConnection.count({ where }),
      this.prisma.socketConnection.count({
        where: { ...where, disconnectedAt: null },
      }),
      this.prisma.socketConnection.aggregate({
        where: { ...where, duration: { not: null } },
        _avg: { duration: true },
      }),
    ]);

    return {
      total,
      active,
      averageDuration: Math.floor(avgDuration._avg.duration || 0),
    };
  }
}
