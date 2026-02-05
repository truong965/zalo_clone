import { Module, Provider, OnModuleInit } from '@nestjs/common';
import {
  EventVersioningRegistry,
  globalEventRegistry,
} from './versioned-event';
import { EventStrategyInitializer } from './event-strategy-initializer.service';

/**
 * PHASE 3.4: EventVersioningModule
 *
 * Provides event versioning and schema evolution support
 * - Centralized event version registry
 * - Event upgrade/downgrade handlers
 * - Schema compatibility checking
 */

// Provide the global registry as injectable service
export const EventVersioningProvider: Provider = {
  provide: 'EVENT_VERSIONING_REGISTRY',
  useValue: globalEventRegistry,
};

@Module({
  providers: [EventVersioningProvider, EventStrategyInitializer],
  exports: ['EVENT_VERSIONING_REGISTRY', EventStrategyInitializer],
})
export class EventVersioningModule implements OnModuleInit {
  constructor(private readonly initializer: EventStrategyInitializer) {}

  /**
   * Initialize all event strategies when module loads
   * This ensures the registry is populated before any handlers run
   */
  onModuleInit(): void {
    this.initializer.initialize();
  }
}
