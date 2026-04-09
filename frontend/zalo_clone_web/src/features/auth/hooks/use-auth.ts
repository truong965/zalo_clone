/**
 * useAuth Hook - Custom hook for authentication operations
 * Provides easy access to auth store and common auth operations
 */

import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ROUTES } from '@/config/routes';
import { useAuthStore } from '../stores/auth.store';
import type { LoginRequest, RegisterRequest } from '@/types';

export function useAuth() {
      const navigate = useNavigate();

      // Select specific state from store
      const {
            user,
            isAuthenticated,
            isLoading,
            error,
            sessions,
            setError,
            login: storeLogin,
            register: storeRegister,
            logout: storeLogout,
            getProfile,
            getSessions,
            revokeSession,
            refreshToken,
            updateProfile,
            requestRegisterOtp: storeRequestRegisterOtp,
            verifyRegisterOtp: storeVerifyRegisterOtp,
      } = useAuthStore();

      // ============================================================================
      // AUTH OPERATIONS with side effects
      // ============================================================================

      /**
       * Login with phone and password
       * Navigates to chat on success
       */
      const login = useCallback(
            async (payload: LoginRequest) => {
                  try {
                        const result = await storeLogin(payload);
                        
                        // If 2FA is required, return result to component
                        if ('status' in result && result.status === '2FA_REQUIRED') {
                              return result;
                        }

                        // Navigate after successful login — admins go to dashboard
                        const loggedInUser = useAuthStore.getState().user;
                        if (loggedInUser?.role === 'ADMIN') {
                              navigate(ROUTES.ADMIN_DASHBOARD);
                        } else {
                              navigate(ROUTES.CHAT);
                        }
                        return result;
                  } catch (error: any) {
                        // Error is already set in store
                        throw error;
                  }
            },

            [storeLogin, navigate],
      );

      /**
       * Register new user
       * Navigates to login on success
       */
      const register = useCallback(
            async (payload: RegisterRequest) => {
                  try {
                        await storeRegister(payload);
                        // Navigate to login after successful registration
                        navigate(ROUTES.LOGIN);
                  } catch (error: any) {
                        // Error is already set in store
                        throw error;
                  }
            },
            [storeRegister, navigate],
      );

      /**
       * Logout and redirect to login
       */
      const logout = useCallback(async () => {
            try {
                  await storeLogout();
                  navigate(ROUTES.LOGIN);
            } catch (error: any) {
                  // Error is already set in store
                  throw error;
            }
      }, [storeLogout, navigate]);

      /**
       * Clear error message
       */
      const clearError = useCallback(() => {
            setError(null);
      }, [setError]);

      return {
            // State
            user,
            isAuthenticated,
            isLoading,
            error,
            sessions,

            // Operations
            login,
            register,
            logout,
            getProfile,
            getSessions,
            revokeSession,
            refreshToken,
            updateProfile,
            requestRegisterOtp: storeRequestRegisterOtp,
            verifyRegisterOtp: storeVerifyRegisterOtp,
            verify2fa: useAuthStore((state) => state.verify2fa),
            send2faSmsChallenge: useAuthStore((state) => state.send2faSmsChallenge),
            send2faEmailChallenge: useAuthStore((state) => state.send2faEmailChallenge),
            send2faTotpChallenge: useAuthStore((state) => state.send2faTotpChallenge),
            send2faPushChallenge: useAuthStore((state) => state.send2faPushChallenge),


            // Utilities
            clearError,
      };
}
