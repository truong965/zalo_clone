/**
 * TURN Credential Service
 *
 * Generates short-lived TURN credentials using HMAC-SHA1 (RFC 5766).
 * These credentials are validated by coturn's `use-auth-secret` mechanism.
 *
 * How it works:
 * 1. Backend generates `username = unixTimestampExpiry:userId`
 * 2. Backend generates `credential = HMAC-SHA1(TURN_SECRET, username)`
 * 3. Client passes (username, credential) to the TURN server
 * 4. Coturn validates with the same shared secret
 * 5. Credentials auto-expire after TTL (default 12h)
 *
 * PRODUCTION NOTES:
 * ─────────────────
 * 1. If using managed TURN (Metered.ca / Twilio):
 *    - Replace this service with provider-specific API calls
 *    - Metered: GET https://api.metered.ca/api/v1/turn/credentials?apiKey=<key>
 *    - Twilio: POST https://api.twilio.com/2010-04-01/Accounts/{sid}/Tokens.json
 *    - The provider returns ready-to-use ICE servers with credentials
 *
 * 2. TURN_SECRET must be:
 *    - Same value in both NestJS .env AND coturn config
 *    - Strong random string in production (use `openssl rand -base64 32`)
 *    - NEVER exposed to client (only derived credentials are sent)
 *
 * 3. TURNS (TLS) — when TLS is configured:
 *    - Add a second ICE server entry with `turns:` protocol and port 5349
 *    - Same credential works for both TURN and TURNS
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import * as NestConfig from '@nestjs/config';
import { createHmac } from 'crypto';
import callConfig from 'src/config/call.config';

/** ICE server configuration sent to WebRTC client */
export interface IceServerConfig {
      urls: string | string[];
      username?: string;
      credential?: string;
}

@Injectable()
export class TurnCredentialService {
      private readonly logger = new Logger(TurnCredentialService.name);

      constructor(
            @Inject(callConfig.KEY)
            private readonly config: NestConfig.ConfigType<typeof callConfig>,
      ) { }

      /**
       * Generate time-limited TURN credentials for a given user.
       *
       * @param userId - The user requesting credentials (embedded in username for auditing)
       * @returns TURN ICE server config with short-lived credentials
       */
      generateCredentials(userId: string): IceServerConfig {
            const ttl = this.config.turnCredentialTtl;
            const secret = this.config.turnSecret;
            const turnUrl = this.config.turnServerUrl;

            // username = unixExpiryTimestamp:userId (coturn parses expiry from the left side)
            const expiryTimestamp = Math.floor(Date.now() / 1000) + ttl;
            const username = `${expiryTimestamp}:${userId}`;

            // credential = Base64(HMAC-SHA1(secret, username))
            const credential = createHmac('sha1', secret)
                  .update(username)
                  .digest('base64');

            this.logger.debug(
                  `Generated TURN credentials for user ${userId}, expires in ${ttl}s`,
            );

            return {
                  urls: [
                        turnUrl,                            // turn:host:3478 (UDP)
                        turnUrl.replace('turn:', 'turn:') + '?transport=tcp', // TCP fallback
                        // PRODUCTION: add TURNS URL when TLS is configured:
                        // this.config.turnServerUrlTls,     // turns:host:5349
                  ],
                  username,
                  credential,
            };
      }
}
