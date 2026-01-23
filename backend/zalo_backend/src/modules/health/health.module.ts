import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { RedisHealthIndicator } from './indicators/redis.indicator';
import { DatabaseHealthIndicator } from './indicators/database.indicator';
import { SocketHealthIndicator } from './indicators/socket.indicator';
import { RedisModule } from '../redis/redis.module';
import { SocketModule } from 'src/socket/socket.module';
import { DatabaseModule } from 'src/database/prisma.module';
@Module({
  imports: [TerminusModule, RedisModule, SocketModule, DatabaseModule],
  controllers: [HealthController],
  providers: [
    RedisHealthIndicator,
    DatabaseHealthIndicator,
    SocketHealthIndicator,
  ],
})
export class HealthModule {}
