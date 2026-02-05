/**
 * Base Event Classes & Decorators
 *
 * All domain events and event listeners in this system must use these base classes.
 * They provide:
 * - Standard event structure (eventId, version, timestamp, source)
 * - Idempotency guarantee (prevents duplicate processing)
 * - Traceability (correlationId, causationId)
 * - Event versioning (for backward compatibility)
 */

export { DomainEvent } from './domain-event';
export { IdempotentListener } from './idempotent-listener';
