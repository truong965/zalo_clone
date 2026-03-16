import { Redirect } from 'expo-router';
import type { Href } from 'expo-router';

import { useAuth } from '@/providers/auth-provider';

export default function IndexRoute() {
      const { isAuthenticated, isLoading } = useAuth();
      const loginHref = '/login' as Href;

      if (isLoading) {
            return null;
      }

      if (isAuthenticated) {
            return <Redirect href="/(tabs)" />;
      }

      return <Redirect href={loginHref} />;
}
