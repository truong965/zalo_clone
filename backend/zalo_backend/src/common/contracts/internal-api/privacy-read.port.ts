import type { PrivacySettingsResponseDto } from '@modules/privacy/dto/privacy.dto';

export const PRIVACY_READ_PORT = Symbol('PRIVACY_READ_PORT');

/**
 * Read-only privacy contract exposed for cross-domain usage.
 */
export interface IPrivacyReadPort {
  /**
   * Get effective privacy settings for the target user.
   */
  getSettings(userId: string): Promise<PrivacySettingsResponseDto>;

  /**
   * Batch-read privacy settings for a set of users.
   */
  getManySettings(
    userIds: string[],
  ): Promise<Map<string, PrivacySettingsResponseDto>>;
}
