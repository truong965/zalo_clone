import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

import { RedisHealthIndicator } from './indicators/redis.indicator';
import { DatabaseHealthIndicator } from './indicators/database.indicator';
import { SocketHealthIndicator } from './indicators/socket.indicator';
import { Public } from 'src/common/decorator/customize';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly redisIndicator: RedisHealthIndicator,
    private readonly databaseIndicator: DatabaseHealthIndicator,
    private readonly socketIndicator: SocketHealthIndicator,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.databaseIndicator.isHealthy('database'),
      () => this.redisIndicator.isHealthy('redis'),
      () => this.socketIndicator.isHealthy('socket'),
    ]);
  }

  @Get('redis')
  @Public()
  @HealthCheck()
  checkRedis() {
    return this.health.check([() => this.redisIndicator.isHealthy('redis')]);
  }

  @Get('database')
  @Public()
  @HealthCheck()
  checkDatabase() {
    return this.health.check([
      () => this.databaseIndicator.isHealthy('database'),
    ]);
  }

  @Get('socket')
  @Public()
  @HealthCheck()
  checkSocket() {
    return this.health.check([() => this.socketIndicator.isHealthy('socket')]);
  }
}
