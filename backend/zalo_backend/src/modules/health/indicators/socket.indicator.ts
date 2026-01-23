import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult } from '@nestjs/terminus';
import { SocketGateway } from 'src/socket/socket.gateway';

@Injectable()
export class SocketHealthIndicator {
  constructor(private readonly socketGateway: SocketGateway) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const stats = await this.socketGateway.getServerStats();

    return {
      [key]: {
        status: 'up',
        ...stats,
      },
    };
  }
}
