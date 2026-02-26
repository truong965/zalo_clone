/**
 * ICE Configuration Service
 *
 * Builds the complete ICE server list sent to WebRTC clients.
 * Combines STUN servers + TURN credentials, and applies the appropriate
 * `iceTransportPolicy` based on user privacy settings.
 *
 * PRODUCTION NOTES:
 * ─────────────────
 * 1. iceTransportPolicy:
 *    - 'relay' (default): ALL media goes through TURN server
 *      → No IP address leak, ~20-50ms extra latency
 *      → Recommended for privacy-conscious users
 *    - 'all': browser tries direct P2P first, falls back to TURN
 *      → Lower latency when P2P works (~70% of cases)
 *      → Exposes real IP to peer (and via STUN to STUN server)
 *
 * 2. allowDirectConnection:
 *    - Currently NOT in the schema (Phase 0 didn't add it)
 *    - When added to PrivacySettings:
 *      ```prisma
 *      allowDirectConnection Boolean @default(false) @map("allow_direct_connection")
 *      ```
 *    - This service already handles it — just uncomment the prisma lookup
 *    - Default false = relay-only = safe default
 *
 * 3. For managed TURN (production):
 *    - Replace TurnCredentialService.generateCredentials() with provider API
 *    - ICE servers from provider typically include both STUN + TURN
 *    - This service still handles iceTransportPolicy selection
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import * as NestConfig from '@nestjs/config';
import callConfig from 'src/config/call.config';
import {
      IceServerConfig,
      TurnCredentialService,
} from './turn-credential.service';

/** Complete ICE configuration sent to WebRTC client */
export interface IceConfig {
      iceServers: IceServerConfig[];
      iceTransportPolicy: 'relay' | 'all';
}

@Injectable()
export class IceConfigService {
      private readonly logger = new Logger(IceConfigService.name);

      constructor(
            @Inject(callConfig.KEY)
            private readonly config: NestConfig.ConfigType<typeof callConfig>,
            private readonly turnCredentialService: TurnCredentialService,
      ) { }

      /**
       * Build ICE configuration for a specific user.
       *
       * @param userId - User who will use this ICE config
       * @returns Complete ICE server list + transport policy
       */
      async getIceConfig(userId: string): Promise<IceConfig> {
            const iceServers: IceServerConfig[] = [];

            // 1. STUN server (free, for ICE candidate gathering)
            //    Always included even in relay mode — needed for server-reflexive candidates
            const stunUrl = this.config.stunServerUrl;
            if (stunUrl) {
                  iceServers.push({ urls: stunUrl });
            }

            // 2. TURN server (authenticated, for media relay)
            const turnCredentials =
                  this.turnCredentialService.generateCredentials(userId);
            iceServers.push(turnCredentials);

            // 3. Determine transport policy based on user privacy settings
            //
            // PRODUCTION TODO: When `allowDirectConnection` is added to PrivacySettings schema:
            // ──────────────────────────────────────────────────────────────────────────
            // const settings = await this.prisma.privacySettings.findUnique({
            //   where: { userId },
            //   select: { allowDirectConnection: true },
            // });
            // const userAllowsDirect = settings?.allowDirectConnection ?? false;
            // const iceTransportPolicy = userAllowsDirect ? 'all' : 'relay';
            // ──────────────────────────────────────────────────────────────────────────
            //
            // For now, use the global default from config:
            const iceTransportPolicy = this.config.defaultIceTransportPolicy;

            this.logger.debug(
                  `ICE config for user ${userId}: ${iceServers.length} servers, policy=${iceTransportPolicy}`,
            );

            return { iceServers, iceTransportPolicy };
      }
}
