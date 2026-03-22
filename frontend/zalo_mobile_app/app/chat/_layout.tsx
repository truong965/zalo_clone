import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ChatLayout() {
      return (
            <Stack>
                  {/* Hide default header depuis we use custom ChatHeader */}
                  <SafeAreaView
                        className={`flex-1 bg-primary`}
                        edges={['top']}
                  >
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
                  </SafeAreaView>
            </Stack>
      );
}
