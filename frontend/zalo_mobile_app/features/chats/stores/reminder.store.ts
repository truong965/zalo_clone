import { create } from 'zustand';

export interface ReminderAlert {
  id: string;
  reminderId: string;
  content: string;
  conversationId?: string | null;
  creatorId?: string | null;
  triggeredAt?: string;
}

interface ReminderStore {
  alerts: ReminderAlert[];
  pushAlert: (alert: ReminderAlert) => void;
  dismissAlert: (reminderId: string) => void;
  clearAlerts: () => void;
}

export const useReminderStore = create<ReminderStore>((set) => ({
  alerts: [],
  pushAlert: (alert) =>
    set((state) => {
      if (state.alerts.some((a) => a.reminderId === alert.reminderId)) return state;
      return { alerts: [...state.alerts, alert] };
    }),
  dismissAlert: (reminderId) =>
    set((state) => ({
      alerts: state.alerts.filter((a) => a.reminderId !== reminderId),
    })),
  clearAlerts: () => set({ alerts: [] }),
}));
