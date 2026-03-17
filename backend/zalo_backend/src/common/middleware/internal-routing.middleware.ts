/**
 * Internal API Router Middleware
 *
 * Separates internal routes from public API routes.
 * Internal routes are served at /internal/* without the global /api/v1 prefix.
 *
 * This allows:
 * - Service-to-service communication via /internal/* (not exposed through public API)
 * - Different authentication (InternalAuthGuard instead of JWT)
 * - Clean separation for future API Gateway routing
 */

import { INestApplication } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

/**
 * Registers internal routing before global prefix is applied.
 * Extracts /internal/*** routes and handles them with special routing.
 */
export function setupInternalRouting(app: INestApplication): void {
      // Middleware to intercept and mark internal routes
      app.use((req: Request, _res: Response, next: NextFunction) => {
            // Mark internal routes for special handling
            if (req.path.startsWith('/internal/')) {
                  (req as any).isInternal = true;
            }
            next();
      });
}

/**
 * Usage in main.ts:
 *
 * ```
 * import { setupInternalRouting } from './internal/internal-routing.middleware';
 *
 * // ... in bootstrap():
 * const app = await NestFactory.create(AppModule);
 * setupInternalRouting(app);  // Register before global prefix
 * app.setGlobalPrefix('api');
 * // ...
 * ```
 *
 * This keeps /internal/* routes at root level while /api/v1/* handles public API.
 */
