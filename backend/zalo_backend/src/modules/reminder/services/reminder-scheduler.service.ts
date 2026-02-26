/**
 * ReminderSchedulerService — PostgreSQL polling scheduler.
 *
 * Replaces Bull Queue with a @Cron-based approach:
 * - Polls PostgreSQL every 30 seconds for due reminders
 * - Uses optimistic locking (updateMany with isTriggered=false guard)
 *   for safe multi-instance deployment
 * - Only marks `isTriggered = true` — NOT `isCompleted`
 *   → user must explicitly acknowledge/dismiss (two-phase completion)
 *
 * Also handles auto-completion grace period:
 * - Daily cron marks reminders triggered > 7 days ago as completed
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from 'src/database/prisma.service';
import { ReminderTriggeredEvent } from '../events/reminder.events';

/** Batch size per cron tick — prevents memory spikes */
const POLL_BATCH_SIZE = 100;

/** Grace period before auto-completing triggered but unacknowledged reminders */
const AUTO_COMPLETE_GRACE_DAYS = 7;

@Injectable()
export class ReminderSchedulerService {
      private readonly logger = new Logger(ReminderSchedulerService.name);
      private isProcessing = false;

      constructor(
            private readonly prisma: PrismaService,
            private readonly eventEmitter: EventEmitter2,
      ) { }

      /**
       * Poll PostgreSQL every 30 seconds for reminders whose time has arrived.
       * Guard `isProcessing` prevents overlapping when a batch takes > 30s.
       */
      @Cron('*/30 * * * * *')
      async pollDueReminders() {
            if (this.isProcessing) return;
            this.isProcessing = true;

            try {
                  const dueReminders = await this.prisma.reminder.findMany({
                        where: {
                              isTriggered: false,
                              isCompleted: false,
                              remindAt: { lte: new Date() },
                        },
                        orderBy: { remindAt: 'asc' },
                        take: POLL_BATCH_SIZE,
                  });

                  if (dueReminders.length === 0) return;

                  this.logger.log(`Found ${dueReminders.length} due reminder(s) to trigger`);

                  for (const reminder of dueReminders) {
                        try {
                              // Atomic update — only trigger if not yet triggered (optimistic lock)
                              const updated = await this.prisma.reminder.updateMany({
                                    where: {
                                          id: reminder.id,
                                          isTriggered: false, // guard: another instance may have triggered it
                                    },
                                    data: {
                                          isTriggered: true,
                                          triggeredAt: new Date(),
                                    },
                              });

                              // Already triggered by another instance → skip
                              if (updated.count === 0) continue;

                              this.eventEmitter.emit(
                                    ReminderTriggeredEvent.eventName,
                                    new ReminderTriggeredEvent(
                                          reminder.id,
                                          reminder.userId,
                                          reminder.conversationId,
                                          reminder.messageId?.toString() ?? null,
                                          reminder.content,
                                    ),
                              );

                              this.logger.log(`Triggered reminder ${reminder.id} for user ${reminder.userId}`);
                        } catch (error) {
                              this.logger.error(`Failed to trigger reminder ${reminder.id}:`, error);
                              // Continue processing remaining reminders
                        }
                  }
            } catch (error) {
                  this.logger.error('Cron pollDueReminders failed:', error);
            } finally {
                  this.isProcessing = false;
            }
      }

      /**
       * Auto-complete grace period: once a day, mark reminders that were
       * triggered > 7 days ago but still unacknowledged as completed.
       * Prevents TRIGGERED reminders from lingering forever.
       */
      @Cron(CronExpression.EVERY_DAY_AT_3AM)
      async autoCompleteStaleReminders() {
            try {
                  const graceCutoff = new Date();
                  graceCutoff.setDate(graceCutoff.getDate() - AUTO_COMPLETE_GRACE_DAYS);

                  const result = await this.prisma.reminder.updateMany({
                        where: {
                              isTriggered: true,
                              isCompleted: false,
                              triggeredAt: { lte: graceCutoff },
                        },
                        data: {
                              isCompleted: true,
                              completedAt: new Date(),
                        },
                  });

                  if (result.count > 0) {
                        this.logger.log(`Auto-completed ${result.count} stale reminder(s) (triggered > ${AUTO_COMPLETE_GRACE_DAYS} days ago)`);
                  }
            } catch (error) {
                  this.logger.error('Auto-complete stale reminders failed:', error);
            }
      }
}
