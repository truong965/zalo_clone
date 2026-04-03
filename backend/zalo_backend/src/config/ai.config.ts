import { registerAs } from '@nestjs/config';

function parseBooleanEnv(value: string | undefined, defaultValue = false): boolean {
  if (value == null || value === '') return defaultValue;
  return value.toLowerCase() === 'true';
}

export default registerAs('ai', () => ({
  enabled: process.env.AI_AGENT_ENABLED !== 'false',
  unifiedStreamEnabled: parseBooleanEnv(process.env.AI_UNIFIED_STREAM_ENABLED, false),
  baseUrl: process.env.AI_ZALO_URL || 'http://localhost:3001',
  apiKey: process.env.INTERNAL_API_KEY ||'',
}));
