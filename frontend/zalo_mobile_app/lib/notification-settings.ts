import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface NotificationState {
  isEnabled: boolean; // Global app-wide notifications
  isCallEnabledInApp: boolean; // Receive calls while app is active
  setEnabled: (enabled: boolean) => void;
  setCallEnabledInApp: (enabled: boolean) => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      isEnabled: true,
      isCallEnabledInApp: true,
      setEnabled: (enabled: boolean) => set({ isEnabled: enabled }),
      setCallEnabledInApp: (enabled: boolean) => set({ isCallEnabledInApp: enabled }),
    }),
    {
      name: 'notification-settings-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);

// Helper for non-hook usage (like in RootLayout's setNotificationHandler)
export const getNotificationEnabledSync = () => useNotificationStore.getState().isEnabled;
export const getCallEnabledInAppSync = () => useNotificationStore.getState().isCallEnabledInApp;
