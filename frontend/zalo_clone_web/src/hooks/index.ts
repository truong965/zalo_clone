/**
 * Custom Hooks
 */

import { useAppStore } from '@/stores/use-app-store';
import { useCallback, useEffect, useState } from 'react';

/**
 * Hook để lấy thông tin user hiện tại
 */
export function useAuth() {
  const { user, isAuthenticated, setUser, setIsAuthenticated } = useAppStore();

  const logout = useCallback(() => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
    setIsAuthenticated(false);
  }, [setUser, setIsAuthenticated]);

  return {
    user,
    isAuthenticated,
    logout,
  };
}

/**
 * Hook để detect mobile view
 */
export function useMobileView(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(window.innerWidth < breakpoint);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < breakpoint);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);

  return isMobile;
}

/**
 * Hook cho Debounce
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Hook để tracking previous value
 */
export function usePrevious<T>(value: T): T | undefined {
  const [previous, setPrevious] = useState<T | undefined>();

  useEffect(() => {
    setPrevious(value);
  }, [value]);

  return previous;
}
