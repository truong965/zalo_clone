/**
 * ReminderModule — User-scoped reminders with PostgreSQL polling scheduler.
 *
 * Owns:
 * - Reminder CRUD (ReminderService + ReminderController)
 * - Cron-based scheduling (ReminderSchedulerService — polls DB every 30s)
 * - Socket notification (ReminderSocketListener — pushes to user)
 * - System message on creation (ReminderSystemMessageListener)
 *
 * Event-driven architecture:
 *   ReminderService emits events → listeners react
 *   ReminderSchedulerService polls DB → emits triggered events → socket push
 *
 * No direct imports from other feature modules.
 */

import { Module, forwardRef } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DatabaseModule } from 'src/database/prisma.module';
import { SocketModule } from 'src/socket/socket.module';

// Service
import { ReminderService } from './services/reminder.service';
import { ReminderSchedulerService } from './services/reminder-scheduler.service';

// Listener
import { ReminderSocketListener } from './listeners/reminder-socket.listener';
import { ReminderSystemMessageListener } from './listeners/reminder-system-message.listener';

// Controller
import { ReminderController } from './reminder.controller';

@Module({
      imports: [
            DatabaseModule,
            EventEmitterModule,
            forwardRef(() => SocketModule),
      ],
      controllers: [ReminderController],
      providers: [
            ReminderService,
            ReminderSchedulerService,
            ReminderSocketListener,
            ReminderSystemMessageListener,
      ],
      exports: [ReminderService],
})
export class ReminderModule { }
