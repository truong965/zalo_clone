import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { PropsWithChildren } from 'react';

import { mobileApi } from '@/services/api';
import type {
      LoginPayload,
      RegisterPayload,
      UserProfile,
      UpdateUserPayload,
      ChangePasswordPayload,
      TwoFactorRequiredResponse,
      VerifyTwoFactorRequest,
      RequestRegisterOtpPayload,
      VerifyRegisterOtpPayload,
} from '@/types/auth';

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
      twoFactorData: TwoFactorRequiredResponse | null;
      login: (payload: LoginPayload) => Promise<void>;
      verify2fa: (payload: VerifyTwoFactorRequest) => Promise<any>;
      clear2fa: () => void;
      register: (payload: RegisterPayload) => Promise<void>;
      requestRegisterOtp: (payload: RequestRegisterOtpPayload) => Promise<void>;
      verifyRegisterOtp: (payload: VerifyRegisterOtpPayload) => Promise<void>;
      logout: () => Promise<void>;
      refreshProfile: () => Promise<void>;
      updateProfile: (payload: UpdateUserPayload) => Promise<void>;
      changePassword: (payload: ChangePasswordPayload) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
      const [accessToken, setAccessToken] = useState<string | null>(null);
      const [user, setUser] = useState<UserProfile | null>(null);
      const [isLoading, setIsLoading] = useState(true);
      const [twoFactorData, setTwoFactorData] = useState<TwoFactorRequiredResponse | null>(null);

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

            if ('status' in response && response.status === '2FA_REQUIRED') {
                  setTwoFactorData(response as TwoFactorRequiredResponse);
                  return;
            }

            const authResponse = response as any;
            await setAccessTokenInStorage(authResponse.accessToken);
            setAccessToken(authResponse.accessToken);

            if (authResponse.user) {
                  setUser(authResponse.user);
                  return;
            }

            const profile = await mobileApi.getProfile(authResponse.accessToken);
            setUser(profile);
      }, []);

      const verify2fa = useCallback(async (payload: VerifyTwoFactorRequest) => {
            const response = await mobileApi.verify2fa(payload);

            if (response.accessToken) {
                  await setAccessTokenInStorage(response.accessToken);
                  setAccessToken(response.accessToken);
                  setTwoFactorData(null);

                  if (response.user) {
                        setUser(response.user);
                  } else {
                        const profile = await mobileApi.getProfile(response.accessToken);
                        setUser(profile);
                  }
            }

            return response;
      }, []);

      const clear2fa = useCallback(() => {
            setTwoFactorData(null);
      }, []);

      const register = useCallback(async (payload: RegisterPayload) => {
            await mobileApi.register(payload);
      }, []);

      const requestRegisterOtp = useCallback(async (payload: RequestRegisterOtpPayload) => {
            await mobileApi.requestRegisterOtp(payload);
      }, []);

      const verifyRegisterOtp = useCallback(async (payload: VerifyRegisterOtpPayload) => {
            await mobileApi.verifyRegisterOtp(payload);
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

      const updateProfile = useCallback(async (payload: UpdateUserPayload) => {
            if (!accessToken || !user) throw new Error('Not authenticated');
            await mobileApi.updateUserProfile(user.id, payload, accessToken);
            await refreshProfile();
      }, [accessToken, user, refreshProfile]);

      const changePassword = useCallback(async (payload: ChangePasswordPayload) => {
            if (!accessToken) throw new Error('Not authenticated');
            const result = await mobileApi.changePassword(payload, accessToken);
            // Optionally update token if rotated (backend currently rotates)
            if (result.accessToken) {
                  await setAccessTokenInStorage(result.accessToken);
                  setAccessToken(result.accessToken);
            }
      }, [accessToken]);

      const value = useMemo<AuthContextValue>(
            () => ({
                  accessToken,
                  user,
                  isLoading,
                  isAuthenticated: Boolean(accessToken),
                  twoFactorData,
                  login,
                  verify2fa,
                  clear2fa,
                  register,
                  requestRegisterOtp,
                  verifyRegisterOtp,
                  logout,
                  refreshProfile,
                  updateProfile,
                  changePassword,
            }),
            [
                  accessToken,
                  isLoading,
                  twoFactorData,
                  login,
                  verify2fa,
                  clear2fa,
                  logout,
                  refreshProfile,
                  register,
                  requestRegisterOtp,
                  verifyRegisterOtp,
                  user,
                  updateProfile,
                  changePassword,
            ],
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
