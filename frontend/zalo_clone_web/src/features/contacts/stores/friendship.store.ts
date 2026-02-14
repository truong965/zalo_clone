/**
 * Friendship Store — Zustand
 *
 * Manages UI-only state for the friendship module:
 * - Badge counts for pending friend requests (updated via socket)
 * - Active tab in friend requests view
 *
 * Server state (friends list, request lists) is managed by TanStack Query
 * in friendship.api.ts — this store only handles ephemeral UI state.
 */

import { create } from 'zustand';

export type FriendRequestTab = 'received' | 'sent';

interface FriendshipState {
      /** Number of pending received friend requests (for badge display) */
      pendingReceivedCount: number;
      /** Number of pending sent friend requests */
      pendingSentCount: number;
      /** Active tab in the friend requests view */
      activeTab: FriendRequestTab;
}

interface FriendshipActions {
      setPendingReceivedCount: (count: number) => void;
      incrementPendingReceived: () => void;
      decrementPendingReceived: () => void;
      setPendingSentCount: (count: number) => void;
      incrementPendingSent: () => void;
      decrementPendingSent: () => void;
      setActiveTab: (tab: FriendRequestTab) => void;
      /** Reset all counts (e.g., on logout) */
      reset: () => void;
}

const initialState: FriendshipState = {
      pendingReceivedCount: 0,
      pendingSentCount: 0,
      activeTab: 'received',
};

export const useFriendshipStore = create<FriendshipState & FriendshipActions>(
      (set) => ({
            ...initialState,

            setPendingReceivedCount: (count) =>
                  set({ pendingReceivedCount: Math.max(0, count) }),

            incrementPendingReceived: () =>
                  set((state) => ({
                        pendingReceivedCount: state.pendingReceivedCount + 1,
                  })),

            decrementPendingReceived: () =>
                  set((state) => ({
                        pendingReceivedCount: Math.max(0, state.pendingReceivedCount - 1),
                  })),

            setPendingSentCount: (count) =>
                  set({ pendingSentCount: Math.max(0, count) }),

            incrementPendingSent: () =>
                  set((state) => ({
                        pendingSentCount: state.pendingSentCount + 1,
                  })),

            decrementPendingSent: () =>
                  set((state) => ({
                        pendingSentCount: Math.max(0, state.pendingSentCount - 1),
                  })),

            setActiveTab: (tab) => set({ activeTab: tab }),

            reset: () => set(initialState),
      }),
);
