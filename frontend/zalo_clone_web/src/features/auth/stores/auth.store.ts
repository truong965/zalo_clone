/**
 * Auth Store - Global state management using Zustand
 * Manages authentication state, user info, and auth operations
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { authService, type AuthResponseData, type DeviceSession } from '../api/auth.service';
import { STORAGE_KEYS } from '@/constants/storage-keys';
import type { User,  TwoFactorRequiredResponse,
  VerifyTwoFactorRequest,
} from '@/types/api';

import { ApiError } from '@/lib/api-error';
import { injectAuthCallbacks } from '@/lib/axios';
import { ROUTES } from '@/config/routes';

// ============================================================================
// TYPES
// ============================================================================

export interface AuthState {
      // State
      user: User | null;
      accessToken: string | null; // In-memory token
      isAuthenticated: boolean;
      isLoading: boolean;
      error: string | null;
      sessions: DeviceSession[];

      // Actions
      setUser: (user: User | null) => void;
      setAccessToken: (token: string | null) => void;
      setLoading: (loading: boolean) => void;
      setError: (error: string | null) => void;
      setSessions: (sessions: DeviceSession[]) => void;

      // Auth Operations
      register: (payload: Parameters<typeof authService.register>[0]) => Promise<void>;
      login: (payload: Parameters<typeof authService.login>[0]) => Promise<AuthResponseData | TwoFactorRequiredResponse>;

      logout: () => Promise<void>;
      refreshToken: () => Promise<void>;
      getProfile: () => Promise<void>;
      updateProfile: (payload: Partial<User>) => Promise<void>;
      deactivateAccount: (password: string) => Promise<void>;
      deleteAccount: (id: string, password: string) => Promise<void>;
      getSessions: () => Promise<void>;
      revokeSession: (deviceId: string) => Promise<void>;
      requestRegisterOtp: (payload: { phoneNumber: string }) => Promise<void>;
      verifyRegisterOtp: (payload: { phoneNumber: string; otp: string }) => Promise<void>;

      // 2FA
      verify2fa: (payload: VerifyTwoFactorRequest) => Promise<AuthResponseData>;
      send2faSmsChallenge: (pendingToken: string) => Promise<{ maskedPhone: string }>;
      send2faEmailChallenge: (pendingToken: string) => Promise<{ maskedEmail: string }>;
      send2faTotpChallenge: (pendingToken: string) => Promise<void>;
      send2faPushChallenge: (pendingToken: string) => Promise<void>;


      // Utility
      reset: () => void;

      _hasHydrated: boolean; // Tracks if store loaded from localStorage
      isInitializing: boolean; // Tracks if silent refresh is in progress
      initializeAuth: () => Promise<void>;
      setAuthData: (data: AuthResponseData) => void;
}

// ============================================================================
// ZUSTAND STORE
// ============================================================================

export const useAuthStore = create<AuthState>()(
      devtools(
            persist(
                  (set, get) => {
                        // Bẻ gãy circular dependency: Inject logic vào axios mà không cần import trực tiếp store vào axios.ts
                        injectAuthCallbacks({
                              getAccessToken: () => get().accessToken,
                              setAccessToken: (token) => set({ accessToken: token }),
                              onLogout: () => {
                                    get().reset();
                                    console.warn('[AuthStore] Auth failed or session expired. Redirecting to login...');
                                    if (typeof window !== 'undefined') {
                                          window.location.href = ROUTES.LOGIN;
                                    }
                              },
                        });

                        return {
                              // ========== INITIAL STATE ==========
                              user: null,
                              accessToken: null,
                              isAuthenticated: false, 
                              isLoading: false,
                              error: null,
                              sessions: [],
                              _hasHydrated: false,
                              isInitializing: true, 

                              // ========== STATE SETTERS ==========
                              setUser: (user) => set({ user, isAuthenticated: !!user }),

                              setAccessToken: (accessToken) => set({ accessToken }),

                              setLoading: (isLoading) => set({ isLoading }),

                              setError: (error) => set({ error }),

                              setSessions: (sessions) => set({ sessions }),

                              // ========== AUTH OPERATIONS ==========
                              /**
                               * Initialize Auth - Performs Silent Refresh if user was previously logged in
                               */
                              initializeAuth: async () => {
                                    set({ _hasHydrated: true });
                                    // If already have accessToken, we are good
                                    if (get().accessToken) {
                                          set({ isInitializing: false });
                                          return;
                                    }

                                    // If not marked as authenticated in persisted store, stop immediately
                                    if (!get().isAuthenticated && !get().user) {
                                          set({ isInitializing: false });
                                          return;
                                    }

                                    try {
                                          // Thay vì gọi refresh() thủ công dễ gây race-condition với interceptor,
                                          // ta chỉ cần gọi getProfile(). Nếu token hết hạn, interceptor sẽ tự động
                                          // thực hiện refresh một lần duy nhất và retry request này.
                                          const user = await authService.getProfile();
                                          
                                          set({ 
                                                user: user, 
                                                isAuthenticated: true, 
                                                isInitializing: false 
                                          });
                                    } catch (error) {
                                          // If refresh fails (cookie expired/invalid) -> Reset state
                                          // This prevents the user from being stuck in "Checking session"
                                          set({ 
                                                accessToken: null,
                                                user: null, 
                                                isAuthenticated: false, 
                                                isInitializing: false 
                                          });
                                    }
                              },

                              /**
                               * Register new user
                               */
                              register: async (payload) => {
                                    try {
                                          set({ isLoading: true, error: null });
                                          const data = await authService.register(payload) as any; 
                                          set({ user: (data as any).user || data, isAuthenticated: true, isLoading: false });
                                    } catch (error: unknown) {
                                          const errorMsg = ApiError.from(error).message || 'Registration failed';
                                          set({ error: errorMsg, isLoading: false });
                                          throw error;
                                    }
                              },

                              /**
                               * Login with phone and password
                               */
                              login: async (payload) => {
                                    try {
                                          set({ isLoading: true, error: null });
                                          const data = await authService.login(payload);
                                          
                                          if ('status' in data && data.status === '2FA_REQUIRED') {
                                                set({ isLoading: false });
                                                return data;
                                          }

                                          sessionStorage.removeItem(STORAGE_KEYS.CHAT_SELECTED_ID);
                                          const loginData = data as AuthResponseData;
                                          set({ 
                                                user: loginData.user, 
                                                accessToken: loginData.accessToken,
                                                isAuthenticated: true, 
                                                isLoading: false 
                                          });
                                          return data as AuthResponseData;
                                    } catch (error: unknown) {
                                          const errorMsg = ApiError.from(error).message || 'Login failed';
                                          set({ error: errorMsg, isLoading: false });
                                          throw error;
                                        }
                                  },


                              /**
                               * Logout from current device
                               */
                              logout: async () => {
                                    try {
                                          set({ isLoading: true });
                                          await authService.logout();
                                          sessionStorage.removeItem(STORAGE_KEYS.CHAT_SELECTED_ID);
                                          set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false, error: null });
                                    } catch (error: unknown) {
                                          const errorMsg = ApiError.from(error).message || 'Logout failed';
                                          set({ error: errorMsg, isLoading: false });
                                          throw error;
                                    }
                              },

                              /**
                               * Refresh access token
                               */
                               refreshToken: async () => {
                                     try {
                                           const data = await authService.refresh();
                                           set({ accessToken: data.accessToken, isAuthenticated: true });
                                     } catch (error) {
                                           set({ user: null, accessToken: null, isAuthenticated: false, error: 'Session expired' });
                                           throw error;
                                     }
                               },

                              /**
                               * Fetch current user profile
                               */
                              getProfile: async () => {
                                    try {
                                          set({ isLoading: true, error: null });
                                          const user = await authService.getProfile();
                                          set({ user, isAuthenticated: true, isLoading: false });
                                    } catch (error: unknown) {
                                          const errorMsg = ApiError.from(error).message || 'Failed to fetch profile';
                                          set({ error: errorMsg, isLoading: false });
                                          throw error;
                                    }
                              },

                              /**
                               * Update current user profile
                               */
                              updateProfile: async (payload: Partial<User>) => {
                                    try {
                                          const { user } = get();
                                          if (!user) throw new Error('Unauthorized');
                                          set({ isLoading: true, error: null });
                                          const updatedUser = await authService.updateProfile(user.id, payload);
                                          set({ user: updatedUser, isLoading: false });
                                    } catch (error: unknown) {
                                          const errorMsg = ApiError.from(error).message || 'Failed to update profile';
                                          set({ error: errorMsg, isLoading: false });
                                          throw error;
                                    }
                              },

                              /**
                               * Deactivate current account
                               */
                              deactivateAccount: async (password: string) => {
                                    try {
                                          set({ isLoading: true, error: null });
                                          await authService.deactivateAccount(password);
                                          get().reset();
                                    } catch (error: unknown) {
                                          const errorMsg = ApiError.from(error).message || 'Account deactivation failed';
                                          set({ error: errorMsg, isLoading: false });
                                          throw error;
                                    }
                              },

                              /**
                               * Permanently delete current account
                               */
                              deleteAccount: async (id: string, password: string) => {
                                    try {
                                          set({ isLoading: true, error: null });
                                          await authService.deleteAccount(id, password);
                                          get().reset();
                                    } catch (error: unknown) {
                                          const errorMsg = ApiError.from(error).message || 'Account deletion failed';
                                          set({ error: errorMsg, isLoading: false });
                                          throw error;
                                    }
                              },

                              /**
                               * Fetch all active sessions
                               */
                              getSessions: async () => {
                                    try {
                                          set({ isLoading: true, error: null });
                                          const result = await authService.getSessions();
                                          set({ sessions: result.sessions, isLoading: false });
                                    } catch (error: unknown) {
                                          const errorMsg = ApiError.from(error).message || 'Failed to fetch sessions';
                                          set({ error: errorMsg, isLoading: false });
                                          throw error;
                                    }
                              },

                              /**
                               * Revoke specific device session
                               */
                              revokeSession: async (deviceId: string) => {
                                    try {
                                          await authService.revokeSession(deviceId);
                                          const result = await authService.getSessions();
                                          set({ sessions: result.sessions });
                                    } catch (error: unknown) {
                                          const errorMsg = ApiError.from(error).message || 'Failed to revoke session';
                                          set({ error: errorMsg });
                                          throw error;
                                    }
                              },
                              /**
                               * Request registration OTP
                               */
                              requestRegisterOtp: async (payload) => {
                                    try {
                                          set({ isLoading: true, error: null });
                                          await authService.requestRegisterOtp(payload);
                                          set({ isLoading: false });
                                    } catch (error: unknown) {
                                          const errorMsg = ApiError.from(error).message || 'Failed to request OTP';
                                          set({ error: errorMsg, isLoading: false });
                                          throw error;
                                    }
                              },

                              /**
                               * Verify registration OTP
                               */
                              verifyRegisterOtp: async (payload) => {
                                    try {
                                          set({ isLoading: true, error: null });
                                          await authService.verifyRegisterOtp(payload);
                                          set({ isLoading: false });
                                    } catch (error: unknown) {
                                          const errorMsg = ApiError.from(error).message || 'Failed to verify OTP';
                                          set({ error: errorMsg, isLoading: false });
                                          throw error;
                                    }
                              },

                              /**
                               * Verify 2FA code or Push
                               */
                              verify2fa: async (payload) => {
                                    try {
                                          set({ isLoading: true, error: null });
                                          const data = await authService.verify2fa(payload);
                                          set({ 
                                                user: data.user, 
                                                accessToken: data.accessToken,
                                                isAuthenticated: true, 
                                                isLoading: false 
                                          });
                                          return data;
                                    } catch (error: unknown) {
                                          const errorMsg = ApiError.from(error).message || '2FA verification failed';
                                          set({ error: errorMsg, isLoading: false });
                                          throw error;
                                    }
                              },

                              /**
                               * Trigger SMS 2FA challenge
                               */
                              send2faSmsChallenge: async (pendingToken) => {
                                    try {
                                          set({ isLoading: true, error: null });
                                          const data = await authService.send2faSmsChallenge(pendingToken);
                                          set({ isLoading: false });
                                          return data;
                                    } catch (error: unknown) {
                                          const errorMsg = ApiError.from(error).message || 'Failed to send SMS';
                                          set({ error: errorMsg, isLoading: false });
                                          throw error;
                                    }
                              },

                              /**
                               * Trigger Email 2FA challenge
                               */
                              send2faEmailChallenge: async (pendingToken) => {
                                     try {
                                           set({ isLoading: true, error: null });
                                           const data = await authService.send2faEmailChallenge(pendingToken);
                                           set({ isLoading: false });
                                           return data;
                                     } catch (error: unknown) {
                                           const errorMsg = ApiError.from(error).message || 'Failed to send Email';
                                           set({ error: errorMsg, isLoading: false });
                                           throw error;
                                     }
                               },

                               /**
                                * Trigger TOTP activation challenge
                                */
                                send2faTotpChallenge: async (pendingToken) => {
                                      try {
                                            set({ isLoading: true, error: null });
                                            await authService.send2faTotpChallenge(pendingToken);
                                            set({ isLoading: false });
                                      } catch (error: unknown) {
                                            const errorMsg = ApiError.from(error).message || 'Failed to activate Authenticator';
                                            set({ error: errorMsg, isLoading: false });
                                            throw error;
                                      }
                                },

                                /**
                                 * Trigger Push challenge
                                 */
                                send2faPushChallenge: async (pendingToken) => {
                                      try {
                                            set({ isLoading: true, error: null });
                                            await authService.send2faPushChallenge(pendingToken);
                                            set({ isLoading: false });
                                      } catch (error: unknown) {
                                            const errorMsg = ApiError.from(error).message || 'Failed to send Push notification';
                                            set({ error: errorMsg, isLoading: false });
                                            throw error;
                                      }
                                },

                              // ========== UTILITY ==========


                              /**
                               * Reset auth state
                               */
                              reset: () => {
                                    sessionStorage.removeItem(STORAGE_KEYS.CHAT_SELECTED_ID);
                                    set({
                                          user: null,
                                          accessToken: null,
                                          isAuthenticated: false,
                                          isLoading: false,
                                          error: null,
                                          sessions: [],
                                    });
                              },

                              /**
                               * Set auth data directly (used by QR login)
                               */
                              setAuthData: (data) => {
                                    sessionStorage.removeItem(STORAGE_KEYS.CHAT_SELECTED_ID);
                                    set({
                                          user: data.user,
                                          accessToken: data.accessToken,
                                          isAuthenticated: true,
                                          isLoading: false,
                                          error: null,
                                    });
                              },
                        };
                  },
                  {
                        name: STORAGE_KEYS.AUTH_STORE, // localStorage key
                        partialize: (state: AuthState) => ({
                              user: state.user,
                              isAuthenticated: state.isAuthenticated,
                        }),
                        /**
                         * onRehydrateStorage - Automatically called when store finishes loading from localStorage
                         * We use this to trigger silent refresh if the user was previously logged in.
                         */
                        onRehydrateStorage: () => (state) => {
                              if (state) {
                                    state.initializeAuth();
                              }
                        },
                  },
            ),
      ),
);
