import axios from 'axios';
import type { AxiosError } from 'axios';
import { env } from '@/config/env';
import { API_ENDPOINTS } from '@/constants/api-endpoints';
import { ApiError } from './api-error';

// ============================================================================
// AUTH CALLBACKS (Breaking Circular Dependency)
// ============================================================================

interface AuthCallbacks {
  getAccessToken: () => string | null;
  setAccessToken: (token: string) => void;
  onLogout: () => void;
}

let authCallbacks: AuthCallbacks | null = null;

/**
 * Inject auth logic from the store into the axios instance.
 * This prevents axios.ts <-> auth.store.ts circular dependency.
 */
export const injectAuthCallbacks = (callbacks: AuthCallbacks) => {
  authCallbacks = callbacks;
};

// ============================================================================
// AXIOS INSTANCE CONFIGURATION
// ============================================================================

const api = axios.create({
  baseURL: env.BACKEND_URL,
  timeout: 10000,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
  paramsSerializer: {
    indexes: null, // use 'id=1&id=2' instead of 'id[]=1&id[]=2'
  },
});

// ============================================================================
// REQUEST INTERCEPTOR
// ============================================================================

api.interceptors.request.use(
  (config) => {
    const token = authCallbacks?.getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    try {
      config.headers['X-Device-Type'] = 'WEB';
      let platform = 'WEB';
      if (typeof navigator !== 'undefined' && navigator.platform) {
        const plat = navigator.platform.toLowerCase();
        if (plat.includes('win')) platform = 'WINDOWS';
        else if (plat.includes('mac')) platform = 'MACOS';
        else if (plat.includes('linux')) platform = 'LINUX';
      }
      config.headers['X-Platform'] = platform;
      config.headers['X-Device-Name'] = 'Web Browser';
    } catch (e) {
      // Ignore SSR
    }

    return config;
  },
  (error) => Promise.reject(error),
);

// ============================================================================
// RESPONSE INTERCEPTOR - Silent Refresh Logic
// ============================================================================

let isRefreshing = false;
let refreshSubscribers: ((token: string) => void)[] = [];

const onRefreshed = (token: string) => {
  refreshSubscribers.forEach((callback) => callback(token));
  refreshSubscribers = [];
};

const addRefreshSubscriber = (callback: (token: string) => void) => {
  refreshSubscribers.push(callback);
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as any;

    if (error.response?.status === 401 && !originalRequest._retry) {
      // console.log(`[Axios] 401 Detected on ${originalRequest.url}. Starting refresh flow...`);
      originalRequest._retry = true;

      // Skip refresh for login/register
      if (originalRequest.url?.includes('/auth/login') || originalRequest.url?.includes('/auth/register')) {
        return Promise.reject(ApiError.from(error));
      }

      // If refresh failed itself
      if (originalRequest.url?.includes('/auth/refresh')) {
        console.warn('[Axios] Refresh token invalid/expired. Redirecting to login.');
        authCallbacks?.onLogout();
        return Promise.reject(ApiError.from(error));
      }

      try {
        if (isRefreshing) {
          // console.log('[Axios] Already refreshing... queuing request.');
          return new Promise((resolve) => {
            addRefreshSubscriber((token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            });
          });
        }

        isRefreshing = true;
        // console.log('[Axios] Calling /auth/refresh...');

        // IMPORTANT: Must use the same instance but avoid infinite loops
        const response = await api.post(API_ENDPOINTS.AUTH.REFRESH, {});

        const { accessToken } = response.data.data;
        // console.log('[Axios] Refresh successful. New access token received.');

        authCallbacks?.setAccessToken(accessToken);
        onRefreshed(accessToken);

        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        console.error('[Axios] Silent refresh failed:', refreshError);
        authCallbacks?.onLogout();
        return Promise.reject(ApiError.from(refreshError));
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(ApiError.from(error));
  },
);

export default api;
