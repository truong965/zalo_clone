import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface FriendshipUIState {
  lastSeenInvitationCount: number;
  isBadgeDismissed: boolean;
  setLastSeenInvitationCount: (count: number) => void;
  dismissBadge: () => void;
  resetBadge: () => void;
}

export const useFriendshipUIStore = create<FriendshipUIState>()(
  persist(
    (set) => ({
      lastSeenInvitationCount: 0,
      isBadgeDismissed: false,
      setLastSeenInvitationCount: (count) => set({ lastSeenInvitationCount: count }),
      dismissBadge: () => set({ isBadgeDismissed: true }),
      resetBadge: () => set({ isBadgeDismissed: false }),
    }),
    {
      name: 'friendship-ui-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
