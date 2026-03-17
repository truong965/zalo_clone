import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { RedisService } from 'src/modules/redis/redis.service';
import { RedisKeyBuilder } from '@shared/redis/redis-key-builder';

/**
 * Status lifecycle of a QR session:
 * PENDING → SCANNED → APPROVED → (consumed via exchange) → deleted
 */
export enum QrSessionStatus {
  PENDING = 'PENDING',
  SCANNED = 'SCANNED',
  APPROVED = 'APPROVED',
  CANCELLED = 'CANCELLED',
}

export interface QrSessionData {
  status: QrSessionStatus;
  webSocketId: string;
  deviceTrackingId: string;
  deviceName: string;
  platform: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  /** Set after scan by mobile */
  userId?: string;
  /** Device ID of the mobile app that scanned the QR */
  mobileDeviceId?: string;
  /** Set after approve — one-time exchange ticket */
  ticket?: string;
}

/** TTL constants */
const QR_SESSION_TTL = 180; // 3 minutes
const QR_LOCK_TTL = 5; // 5 seconds
const QR_TICKET_TTL = 15; // 15 seconds

@Injectable()
export class QrSessionRedisService {
  private readonly logger = new Logger(QrSessionRedisService.name);

  constructor(private readonly redis: RedisService) {}

  // ────────────── Session CRUD ──────────────

  /**
   * Create a new QR session in Redis with 180s TTL.
   * Returns the generated qrSessionId (UUID).
   */
  async createSession(
    data: Omit<QrSessionData, 'status' | 'createdAt'>,
  ): Promise<string> {
    const qrSessionId = uuidv4();
    const session: QrSessionData = {
      ...data,
      status: QrSessionStatus.PENDING,
      createdAt: new Date().toISOString(),
    };

    const key = RedisKeyBuilder.qrSession(qrSessionId);
    await this.redis.setex(key, QR_SESSION_TTL, JSON.stringify(session));

    this.logger.debug(`QR session created: ${qrSessionId}`);
    return qrSessionId;
  }

  /**
   * Retrieve a QR session from Redis. Returns null if expired or not found.
   */
  async getSession(qrSessionId: string): Promise<QrSessionData | null> {
    const key = RedisKeyBuilder.qrSession(qrSessionId);
    const raw = await this.redis.get(key);
    if (!raw) return null;

    return JSON.parse(raw) as QrSessionData;
  }

  /**
   * Update the session status and optionally merge extra fields.
   * Preserves the remaining TTL by reading the current value and writing back.
   */
  async updateStatus(
    qrSessionId: string,
    status: QrSessionStatus,
    extra?: Partial<QrSessionData>,
  ): Promise<void> {
    const key = RedisKeyBuilder.qrSession(qrSessionId);
    const raw = await this.redis.get(key);
    if (!raw) {
      this.logger.warn(`QR session not found for update: ${qrSessionId}`);
      return;
    }

    const session = JSON.parse(raw) as QrSessionData;
    const updated: QrSessionData = { ...session, status, ...extra };

    // When setting APPROVED status, we use a shorter TTL for the ticket
    const ttl =
      status === QrSessionStatus.APPROVED ? QR_TICKET_TTL : QR_SESSION_TTL;
    await this.redis.setex(key, ttl, JSON.stringify(updated));
  }

  /**
   * Atomically consume the exchange ticket (one-time use).
   * Returns the ticket string if it exists, or null if already consumed / expired.
   *
   * Uses a GET-then-DELETE pattern:
   * 1. GET session → read ticket field
   * 2. If ticket exists → remove it from session data and write back
   * 3. Return the ticket
   *
   * This is safe because the caller holds a Redis distributed lock.
   */
  async consumeTicket(qrSessionId: string): Promise<string | null> {
    const key = RedisKeyBuilder.qrSession(qrSessionId);
    const raw = await this.redis.get(key);
    if (!raw) return null;

    const session = JSON.parse(raw) as QrSessionData;
    if (!session.ticket) return null;

    const ticket = session.ticket;

    // Remove ticket from session — subsequent calls will get null
    session.ticket = undefined;
    // Keep a short TTL — session will be deleted after exchange completes
    await this.redis.setex(key, QR_TICKET_TTL, JSON.stringify(session));

    return ticket;
  }

  /**
   * Delete a QR session (cleanup after successful exchange).
   */
  async deleteSession(qrSessionId: string): Promise<void> {
    const key = RedisKeyBuilder.qrSession(qrSessionId);
    await this.redis.del(key);
  }

  // ────────────── Distributed Lock ──────────────

  /**
   * Acquire a distributed lock for token exchange.
   * Prevents race conditions when multiple exchanges happen simultaneously.
   * Uses SETNX (set-if-not-exists) with a 5s TTL.
   */
  async acquireLock(userId: string): Promise<boolean> {
    const key = RedisKeyBuilder.qrSessionLock(userId);
    const client = this.redis.getClient();

    // SET key value NX EX ttl → returns 'OK' if acquired, null if already locked
    const result = await client.set(key, '1', 'EX', QR_LOCK_TTL, 'NX');
    return result === 'OK';
  }

  /**
   * Release the distributed lock after exchange completes (success or failure).
   */
  async releaseLock(userId: string): Promise<void> {
    const key = RedisKeyBuilder.qrSessionLock(userId);
    await this.redis.del(key);
  }
}
