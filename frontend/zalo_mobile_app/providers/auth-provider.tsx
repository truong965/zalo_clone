import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { mobileApi } from '@/services/api';
import type { LoginPayload, RegisterPayload, UserProfile } from '@/types/auth';

const ACCESS_TOKEN_KEY = 'zalo_mobile_access_token';

async function getAccessToken() {
      return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

async function setAccessTokenInStorage(accessToken: string) {
      await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, accessToken);
}

async function clearAccessTokenInStorage() {
      await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
}

type AuthContextValue = {
      accessToken: string | null;
      user: UserProfile | null;
      isLoading: boolean;
      isAuthenticated: boolean;
      login: (payload: LoginPayload) => Promise<void>;
      register: (payload: RegisterPayload) => Promise<void>;
      logout: () => Promise<void>;
      refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
      const [accessToken, setAccessToken] = useState<string | null>(null);
      const [user, setUser] = useState<UserProfile | null>(null);
      const [isLoading, setIsLoading] = useState(true);

      const hydrateAuth = useCallback(async () => {
            try {
                  const token = await getAccessToken();

                  if (!token) {
                        setIsLoading(false);
                        return;
                  }

                  setAccessToken(token);
                  const profile = await mobileApi.getProfile(token);
                  setUser(profile);
            } catch {
                  await clearAccessTokenInStorage();
                  setAccessToken(null);
                  setUser(null);
            } finally {
                  setIsLoading(false);
            }
      }, []);

      useEffect(() => {
            void hydrateAuth();
      }, [hydrateAuth]);

      const login = useCallback(async (payload: LoginPayload) => {
            const response = await mobileApi.login(payload);
            await setAccessTokenInStorage(response.accessToken);
            setAccessToken(response.accessToken);

            if (response.user) {
                  setUser(response.user);
                  return;
            }

            const profile = await mobileApi.getProfile(response.accessToken);
            setUser(profile);
      }, []);

      const register = useCallback(async (payload: RegisterPayload) => {
            await mobileApi.register(payload);
      }, []);

      const logout = useCallback(async () => {
            await clearAccessTokenInStorage();
            setAccessToken(null);
            setUser(null);
      }, []);

      const refreshProfile = useCallback(async () => {
            if (!accessToken) {
                  return;
            }

            const profile = await mobileApi.getProfile(accessToken);
            setUser(profile);
      }, [accessToken]);

      const value = useMemo<AuthContextValue>(
            () => ({
                  accessToken,
                  user,
                  isLoading,
                  isAuthenticated: Boolean(accessToken),
                  login,
                  register,
                  logout,
                  refreshProfile,
            }),
            [accessToken, isLoading, login, logout, refreshProfile, register, user],
      );

      return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
      const context = useContext(AuthContext);

      if (!context) {
            throw new Error('useAuth must be used within AuthProvider');
      }

      return context;
}
