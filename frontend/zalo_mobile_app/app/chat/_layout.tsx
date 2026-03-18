import { Stack } from 'expo-router';

export default function ChatLayout() {
      return (
            <Stack>
                  {/* Hide default header depuis we use custom ChatHeader */}
                  <Stack.Screen
                        name="[id]"
                        options={{
                              headerShown: false,
                        }}
                  />
                  <Stack.Screen
                        name="[id]/settings"
                        options={{
                              headerShown: false,
                        }}
                  />
            </Stack>
      );
}
