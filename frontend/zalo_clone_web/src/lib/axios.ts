/**
 * Cấu hình Axios với Interceptor tự động refresh token
 * Tích hợp với JWT Auth flow của backend:
 * ✅ Access token được lưu trữ trong localStorage
 * ✅ Refresh token được lưu trữ trong httpOnly cookie (quản lý bởi browser)
 * ✅ Tự động refresh token khi 401 Unauthorized
 * ✅ Token rotation: refresh endpoint trả về refresh token mới
 */

import axios from 'axios';
import type { AxiosError } from 'axios';
import { env } from '@/config/env';
import { API_ENDPOINTS } from '@/constants/api-endpoints';
import { STORAGE_KEYS } from '@/constants/storage-keys';
import { ROUTES } from '@/config/routes';
import { ApiError } from './api-error';

// ============================================================================
// AXIOS INSTANCE CONFIGURATION
// ============================================================================

const api = axios.create({
  baseURL: env.BACKEND_URL,
  timeout: 10000,
  withCredentials: true, // ✅ Gửi cookies cùng request (cần cho httpOnly cookie)
  headers: {
    'Content-Type': 'application/json',
  },
});

// ============================================================================
// REQUEST INTERCEPTOR - Thêm Access Token vào header
// ============================================================================

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// ============================================================================
// RESPONSE INTERCEPTOR - Tự động refresh token nếu hết hạn
// ============================================================================

// Locking mechanism để tránh multiple refresh requests
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
    const originalRequest = error.config as Record<string, any>;

    // ✅ Chỉ retry một lần (tránh infinite loop)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Skip refresh for auth endpoints (login, register, refresh)
      if (
        originalRequest.url?.includes('/auth/login') ||
        originalRequest.url?.includes('/auth/register') ||
        originalRequest.url?.includes('/auth/refresh')
      ) {
        redirectToLogin();
        return Promise.reject(ApiError.from(error));
      }

      try {
        // ============================================
        // REFRESH TOKEN LOGIC
        // ============================================

        // Nếu đang refresh, chờ kết quả rồi retry
        if (isRefreshing) {
          return new Promise((resolve) => {
            addRefreshSubscriber((token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            });
          });
        }

        // Đánh dấu đang refresh
        isRefreshing = true;

        // Gọi refresh endpoint
        // ✅ Refresh token được gửi tự động qua httpOnly cookie
        const response = await axios.post(
          API_ENDPOINTS.AUTH.REFRESH,
          {},
          {
            withCredentials: true, // Gửi httpOnly cookie
          },
        );

        const { accessToken, expiresIn } = response.data.data;

        // Cập nhật access token
        localStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, accessToken);
        localStorage.setItem(STORAGE_KEYS.EXPIRES_IN, expiresIn.toString());

        // ✅ Refresh token mới được set như httpOnly cookie bởi server
        // (không cần xử lý ở client)

        // Thực thi các request đang chờ
        onRefreshed(accessToken);

        // Retry original request với token mới
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError: unknown) {
        // ============================================
        // REFRESH FAILED - CẦN LOGIN LẠI
        // ============================================

        // Clear tokens
        localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
        localStorage.removeItem(STORAGE_KEYS.EXPIRES_IN);

        // Redirect to login
        redirectToLogin();

        return Promise.reject(ApiError.from(refreshError));
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(ApiError.from(error));
  },
);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Redirect to login page (xóa tokens trước)
 */
const redirectToLogin = () => {
  // Clear auth data
  localStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.EXPIRES_IN);

  // Redirect
  window.location.href = ROUTES.LOGIN;
};

export default api;
