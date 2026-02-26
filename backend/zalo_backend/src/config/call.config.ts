/**
 * Call / WebRTC configuration
 *
 * Centralises all call-related env vars so they can be injected
 * via `@Inject(callConfig.KEY)` in any service.
 *
 * PRODUCTION NOTES:
 * ─────────────────
 * 1. STUN:
 *    - Google STUN (stun.l.google.com:19302) is fine for production — free, global.
 *    - Add your own STUN server as a secondary for redundancy.
 *
 * 2. TURN:
 *    - Dev: self-hosted coturn via docker-compose (turn:localhost:3478)
 *    - Staging: coturn on a dedicated VM with TLS (turns:<domain>:5349)
 *    - Production: managed TURN (Metered.ca / Twilio / Cloudflare)
 *      → Set TURN_PROVIDER env var and use provider API to fetch URLs
 *      → OR set TURN_SERVER_URL + TURN_SERVER_URL_TLS + TURN_SECRET
 *
 * 3. Daily.co (Phase 4):
 *    - Set DAILY_API_KEY and DAILY_DOMAIN when enabling group call / SFU fallback
 *
 * 4. ICE Transport Policy:
 *    - Default: 'relay' (all traffic via TURN — no IP leak, ~50ms extra latency)
 *    - User opt-in: 'all' (P2P direct when possible — lower latency, IP leaks)
 *    - Controlled per-user via future `allowDirectConnection` privacy setting
 */
import { registerAs } from '@nestjs/config';

export default registerAs('call', () => ({
      // ── STUN ─────────────────────────────────────────────────────────────────
      stunServerUrl: process.env.STUN_SERVER_URL || 'stun:stun.l.google.com:19302',

      // ── TURN ─────────────────────────────────────────────────────────────────
      turnServerUrl: process.env.TURN_SERVER_URL || 'turn:localhost:3478',

      // PRODUCTION: uncomment when TLS is configured on coturn or managed TURN
      // turnServerUrlTls: process.env.TURN_SERVER_URL_TLS || '',

      /** Shared secret used to generate HMAC-SHA1 short-lived TURN credentials (RFC 5766) */
      turnSecret: process.env.TURN_SECRET || 'coturn-dev-secret',

      /** Credential TTL in seconds (default 12h). Longer = fewer re-auths, shorter = tighter security */
      turnCredentialTtl: parseInt(process.env.TURN_CREDENTIAL_TTL || '43200', 10),

      // ── TURN Provider (future: managed TURN) ─────────────────────────────────
      // PRODUCTION: set to 'metered' | 'twilio' | 'cloudflare' and provide API key
      // turnProvider: process.env.TURN_PROVIDER || 'self-hosted',
      // turnApiKey: process.env.TURN_API_KEY || '',

      // ── ICE ──────────────────────────────────────────────────────────────────
      /**
       * Default ICE transport policy.
       * - 'relay': force TURN relay (no IP leak, recommended default)
       * - 'all': allow direct P2P + TURN fallback (lower latency, user opt-in)
       *
       * PRODUCTION: keep 'relay' as default for privacy.
       * Frontend can override per-user if `allowDirectConnection` setting exists.
       */
      defaultIceTransportPolicy:
            (process.env.DEFAULT_ICE_TRANSPORT_POLICY as 'relay' | 'all') || 'relay',

      // ── Daily.co (Phase 4) ──────────────────────────────────────────────────
      dailyApiKey: process.env.DAILY_API_KEY || '',
      dailyDomain: process.env.DAILY_DOMAIN || '',

      // ── Call Timeouts ───────────────────────────────────────────────────────
      /** Ringing timeout in ms before auto NO_ANSWER */
      ringingTimeoutMs: parseInt(process.env.CALL_RINGING_TIMEOUT_MS || '30000', 10),

      /** Disconnect grace period in ms before ending call */
      disconnectGraceMs: parseInt(process.env.CALL_DISCONNECT_GRACE_MS || '3000', 10),
}));
