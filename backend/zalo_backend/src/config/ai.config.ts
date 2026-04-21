import { registerAs } from '@nestjs/config';

function parseBooleanEnv(value: string | undefined, defaultValue = false): boolean {
  if (value == null || value === '') return defaultValue;
  return value.toLowerCase() === 'true';
}

function normalizeAiBaseUrl(rawValue: string | undefined): string {
  const fallback = 'http://127.0.0.1:3001';
  const value = (rawValue || fallback).trim();

  return value
    .replace(/^http:\/\/localhost(?=[:/]|$)/i, 'http://127.0.0.1')
    .replace(/^https:\/\/localhost(?=[:/]|$)/i, 'https://127.0.0.1')
    .replace(/\/+$/, '');
}

export default registerAs('ai', () => ({
  enabled: process.env.AI_AGENT_ENABLED !== 'false',
  unifiedStreamEnabled: parseBooleanEnv(process.env.AI_UNIFIED_STREAM_ENABLED, false),
  baseUrl: normalizeAiBaseUrl(process.env.AI_ZALO_URL),
  apiKey: process.env.INTERNAL_API_KEY || '',
}));
