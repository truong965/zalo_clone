import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth/auth.module';

// Controllers
import { AdminStatsController } from './controllers/admin-stats.controller';
import { AdminUsersController } from './controllers/admin-users.controller';
import { AdminCallsController } from './controllers/admin-calls.controller';
import { AdminActivityController } from './controllers/admin-activity.controller';
import { AdminSystemController } from './controllers/admin-system.controller';

// Services
import { AdminStatsService } from './services/admin-stats.service';
import { AdminUsersService } from './services/admin-users.service';
import { AdminCallsService } from './services/admin-calls.service';
import { AdminActivityService } from './services/admin-activity.service';
import { AdminSystemService } from './services/admin-system.service';

// Event Listeners & Cron (Phase 1)
import { StatsCounterListener } from './listeners/stats-counter.listener';
import { DailyStatsCron } from './cron/daily-stats.cron';

/**
 * AdminModule — PHASE 2 (Backend Admin API)
 *
 * Centralises all admin-panel backend logic:
 * - Stats overview & historical charts   (AdminStatsService)
 * - User management (list, detail, actions)  (AdminUsersService)
 * - Call history & conversation overview  (AdminCallsService)
 * - Anomaly detection tabs               (AdminActivityService)
 * - System health check                  (AdminSystemService)
 *
 * Cross-cutting dependencies (injected via Global modules — no explicit imports needed):
 * - DatabaseModule (@Global)  → PrismaService
 * - RedisModule    (@Global)  → RedisService, RedisPresenceService
 * - EventsModule   (@Global)  → EventPublisher, EventEmitter2
 *
 * Explicit imports:
 * - AuthModule → TokenService (for session revocation in suspend/force-logout)
 */
@Module({
      imports: [AuthModule],
      controllers: [
            AdminStatsController,
            AdminUsersController,
            AdminCallsController,
            AdminActivityController,
            AdminSystemController,
      ],
      providers: [
            // Services
            AdminStatsService,
            AdminUsersService,
            AdminCallsService,
            AdminActivityService,
            AdminSystemService,

            // Event-driven (Phase 1)
            StatsCounterListener,
            DailyStatsCron,
      ],
})
export class AdminModule { }
