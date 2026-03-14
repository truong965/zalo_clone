// src/config/worker.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('worker', () => ({
  internalApiKey: process.env.API_INTERNAL_KEY || 'dev-internal-key',
}));
