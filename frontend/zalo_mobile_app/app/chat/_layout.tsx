import { Stack, useGlobalSearchParams } from 'expo-router';
import { useAuth } from '@/providers/auth-provider';
import { useConversationSocketSync } from '@/features/chats/hooks/use-conversation-socket-sync';

export default function ChatLayout() {
  const { id } = useGlobalSearchParams<{ id: string }>();
  const { user } = useAuth();
  
  // Mounted globally for all chat screens
  useConversationSocketSync(id as string, user?.id);

  return (
    <Stack
      screenOptions={{
        headerShown: false, // Default: hide native header as we use custom headers
      }}
    >
      <Stack.Screen
        name="[id]"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="[id]/media"
        options={{
          headerShown: true, // Show header for media browser
        }}
      />
      <Stack.Screen
        name="[id]/settings"
        options={{
          headerShown: false,
        }}
      />
      <Stack.Screen
        name="[id]/members"
        options={{
          headerShown: false,
        }}
      />
      {/* PinnedMessagesScreen calls its own Stack.Screen with headerShown: true, which works */}
    </Stack>
  );
}
