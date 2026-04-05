// src/config/worker.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('worker', () => ({
  internalApiKey: process.env.INTERNAL_API_KEY,
}));
