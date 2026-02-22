/**
 * Auth Store - Global state management using Zustand
 * Manages authentication state, user info, and auth operations
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { authService, type AuthResponseData, type SessionInfo } from '../api/auth.service';
import { STORAGE_KEYS } from '@/constants/storage-keys';
import type { User } from '@/types/api';

// ============================================================================
// TYPES
// ============================================================================

export interface AuthState {
      // State
      user: User | null;
      isAuthenticated: boolean;
      isLoading: boolean;
      error: string | null;
      sessions: SessionInfo[];

      // Actions
      setUser: (user: User | null) => void;
      setLoading: (loading: boolean) => void;
      setError: (error: string | null) => void;
      setSessions: (sessions: SessionInfo[]) => void;

      // Auth Operations
      register: (payload: Parameters<typeof authService.register>[0]) => Promise<void>;
      login: (payload: Parameters<typeof authService.login>[0]) => Promise<AuthResponseData>;
      logout: () => Promise<void>;
      refreshToken: () => Promise<void>;
      getProfile: () => Promise<void>;
      getSessions: () => Promise<void>;
      revokeSession: (deviceId: string) => Promise<void>;

      // Utility
      reset: () => void;

      isInitializing: boolean;
      initializeAuth: () => Promise<void>;
}

// ============================================================================
// ZUSTAND STORE
// ============================================================================

export const useAuthStore = create<AuthState>()(
      devtools(
            persist(
                  (set) => ({
                        // ========== INITIAL STATE ==========
                        user: null,
                        isAuthenticated: authService.isAuthenticated(),
                        isLoading: false,
                        error: null,
                        sessions: [],
                        isInitializing: true,
                        // ========== STATE SETTERS ==========
                        setUser: (user) => set({ user, isAuthenticated: !!user }),

                        setLoading: (isLoading) => set({ isLoading }),

                        setError: (error) => set({ error }),

                        setSessions: (sessions) => set({ sessions }),

                        // ========== AUTH OPERATIONS ==========
                        initializeAuth: async () => {
                              const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
                              if (!token) {
                                    set({ isInitializing: false, isAuthenticated: false, user: null });
                                    return;
                              }

                              try {
                                    // Gọi API /me để lấy User mới nhất (có Role/Permission chuẩn)
                                    // Token sẽ tự attach nhờ axios interceptor
                                    const user = await authService.getProfile();
                                    set({ user, isAuthenticated: true, isInitializing: false });
                              } catch (error) {
                                    // Nếu lỗi (ví dụ token hết hạn và refresh thất bại) -> Reset
                                    set({ user: null, isAuthenticated: false, isInitializing: false });
                                    // Không cần redirect ở đây vì Axios Interceptor đã làm rồi
                              }
                        },
                        /**
                         * Register new user
                         */
                        register: async (payload) => {
                              try {
                                    set({ isLoading: true, error: null });
                                    const user = await authService.register(payload);
                                    set({ user, isAuthenticated: true, isLoading: false });
                              } catch (error: any) {
                                    const errorMsg = error?.response?.data?.message || 'Registration failed';
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
                                    set({ user: data.user, isAuthenticated: true, isLoading: false });
                                    return data;
                              } catch (error: any) {
                                    const errorMsg = error?.response?.data?.message || 'Login failed';
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
                                    set({ user: null, isAuthenticated: false, isLoading: false, error: null });
                              } catch (error: any) {
                                    const errorMsg = error?.response?.data?.message || 'Logout failed';
                                    set({ error: errorMsg, isLoading: false });
                                    throw error;
                              }
                        },

                        /**
                         * Refresh access token
                         */
                        refreshToken: async () => {
                              try {
                                    await authService.refresh();
                              } catch (error) {
                                    // Refresh failed, need to login again
                                    set({ user: null, isAuthenticated: false, error: 'Session expired' });
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
                                    set({ user, isLoading: false });
                              } catch (error: any) {
                                    const errorMsg = error?.response?.data?.message || 'Failed to fetch profile';
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
                                    const sessions = await authService.getSessions();
                                    set({ sessions, isLoading: false });
                              } catch (error: any) {
                                    const errorMsg = error?.response?.data?.message || 'Failed to fetch sessions';
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
                                    // Refresh sessions list
                                    const sessions = await authService.getSessions();
                                    set({ sessions });
                              } catch (error: any) {
                                    const errorMsg = error?.response?.data?.message || 'Failed to revoke session';
                                    set({ error: errorMsg });
                                    throw error;
                              }
                        },

                        // ========== UTILITY ==========

                        /**
                         * Reset auth state
                         */
                        reset: () => set({
                              user: null,
                              isAuthenticated: false,
                              isLoading: false,
                              error: null,
                              sessions: [],
                        }),
                  }),
                  {
                        name: STORAGE_KEYS.AUTH_STORE, // localStorage key
                        partialize: (state) => ({
                              // Only persist specific fields
                              user: state.user,
                              isAuthenticated: state.isAuthenticated,
                        }),
                  },
            ),
      ),
);
