/**
 * Types cho Auth module
 */

import type { User, LoginRequest, RegisterRequest, AuthResponse } from '@/types';

export type { User, LoginRequest, RegisterRequest, AuthResponse };

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}
