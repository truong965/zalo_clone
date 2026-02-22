/**
 * Custom Hooks
 */

// Re-export useAuth from auth feature for convenience
export { useAuth } from '@/features/auth/hooks/use-auth';

import { useEffect, useRef, useState } from 'react';

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
 * Hook để tracking previous value.
 * Dùng useRef thay vì useState để tránh trigger re-render thừa.
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  const previous = ref.current;
  ref.current = value;
  return previous;
}
