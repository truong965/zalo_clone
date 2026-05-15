import { Stack } from 'expo-router';

import { LoginScreen } from '@/features/auth/login-screen';

export default function LoginRoute() {
      return (
            <>
                  <Stack.Screen options={{ headerShown: false }} />
                  <LoginScreen />
            </>
      );
}
