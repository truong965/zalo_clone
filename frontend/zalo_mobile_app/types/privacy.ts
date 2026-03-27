/**
 * Privacy Feature Types
 * Mirrors backend PrivacySettingsResponseDto and UpdatePrivacySettingsDto
 */

export type PrivacyLevel = 'EVERYONE' | 'CONTACTS';

export interface PrivacySettings {
      userId: string;
      showProfile: PrivacyLevel;
      whoCanMessageMe: PrivacyLevel;
      whoCanCallMe: PrivacyLevel;
      showOnlineStatus: boolean;
      showLastSeen: boolean;
      updatedAt: string;
}

export interface UpdatePrivacySettingsPayload {
      showProfile?: PrivacyLevel;
      whoCanMessageMe?: PrivacyLevel;
      whoCanCallMe?: PrivacyLevel;
      showOnlineStatus?: boolean;
      showLastSeen?: boolean;
}
