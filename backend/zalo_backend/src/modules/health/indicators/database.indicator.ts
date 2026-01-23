import { Injectable } from '@nestjs/common';
import { HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from 'src/database/prisma.service';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(private readonly prisma: PrismaService) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // Execute a simple query to check database connectivity
      await this.prisma.$queryRaw`SELECT 1`;

      return {
        [key]: {
          status: 'up',
          database: 'postgresql',
        },
      };
    } catch (error) {
      // Thay vì throw HealthCheckError, hãy return status 'down'
      return {
        [key]: {
          status: 'down',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}
