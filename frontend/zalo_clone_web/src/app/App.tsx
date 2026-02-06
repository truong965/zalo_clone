/**
 * Root Component
 */

import { RouterProvider } from 'react-router-dom';
import { router } from '@/routes';
import { AppProviders } from './providers';

import { useEffect } from 'react';
import { useAuthStore } from '@/features/auth/stores/auth.store'; // Import store
export default function App() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);

  useEffect(() => {
    initializeAuth(); // Gọi 1 lần duy nhất khi Mount
  }, [initializeAuth]);
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
