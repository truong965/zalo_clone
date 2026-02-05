/**
 * Types cho Profile module
 */

import type { User } from '@/types';

export type { User };

export interface ProfileState {
      profile: User | null;
      isLoading: boolean;
      error: string | null;
}

export interface UpdateProfileRequest {
      firstName?: string;
      lastName?: string;
      bio?: string;
      avatar?: File;
}
