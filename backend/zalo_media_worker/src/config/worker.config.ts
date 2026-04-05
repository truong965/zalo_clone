// src/config/worker.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('worker', () => ({
  apiUrl: process.env.API_INTERNAL_URL || 'http://localhost:3000',
  apiKey: process.env.INTERNAL_API_KEY || 'dev-internal-key',
}));
