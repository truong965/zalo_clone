/**
 * Root Component
 */

import { RouterProvider } from 'react-router-dom';
import { router } from '@/routes';
import { AppProviders } from './providers';

import { useEffect } from 'react';
export default function App() {
  useEffect(() => {
    // Auth initialization is now handled by the store's onRehydrateStorage callback
  }, []);
  return (
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  );
}
