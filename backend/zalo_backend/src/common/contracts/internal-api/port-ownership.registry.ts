import { CONVERSATION_SYSTEM_MESSAGE_PORT } from './conversation-system-message.port';
import { FRIENDSHIP_READ_PORT } from './friendship-read.port';
import { INTERACTION_READ_PORT } from './interaction-read.port';
import { PRIVACY_READ_PORT } from './privacy-read.port';

export interface InternalApiPortOwnership {
  token: symbol;
  tokenName: string;
  ownerModule: string;
  contractFile: string;
  intent: 'read' | 'command';
  crossDomainUseCases: string[];
}

/**
 * Source of truth for internal API ports ownership.
 *
 * Rule: cross-module callers must depend on these tokens/interfaces,
 * never import concrete services directly.
 */
export const INTERNAL_API_PORT_OWNERSHIP: InternalApiPortOwnership[] = [
  {
    token: PRIVACY_READ_PORT,
    tokenName: 'PRIVACY_READ_PORT',
    ownerModule: 'privacy',
    contractFile: 'src/common/contracts/internal-api/privacy-read.port.ts',
    intent: 'read',
    crossDomainUseCases: [
      'authorization checks',
      'search privacy filtering',
      'friendship/presence visibility',
    ],
  },
  {
    token: FRIENDSHIP_READ_PORT,
    tokenName: 'FRIENDSHIP_READ_PORT',
    ownerModule: 'friendship',
    contractFile: 'src/common/contracts/internal-api/friendship-read.port.ts',
    intent: 'read',
    crossDomainUseCases: [
      'presence fanout',
      'relationship-aware policy checks',
    ],
  },
  {
    token: INTERACTION_READ_PORT,
    tokenName: 'INTERACTION_READ_PORT',
    ownerModule: 'authorization',
    contractFile: 'src/common/contracts/internal-api/interaction-read.port.ts',
    intent: 'read',
    crossDomainUseCases: [
      'cross-domain canMessage/canCall/canViewProfile checks',
      'blocked relationship checks',
    ],
  },
  {
    token: CONVERSATION_SYSTEM_MESSAGE_PORT,
    tokenName: 'CONVERSATION_SYSTEM_MESSAGE_PORT',
    ownerModule: 'conversation',
    contractFile:
      'src/common/contracts/internal-api/conversation-system-message.port.ts',
    intent: 'command',
    crossDomainUseCases: [
      'call/reminder system-message broadcast',
      'cross-domain conversation timeline updates',
    ],
  },
];
