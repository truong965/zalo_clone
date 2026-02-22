/**
 * Global App Store sử dụng Zustand
 */

import { create } from 'zustand';
import { STORAGE_KEYS } from '@/constants/storage-keys';

interface AppState {
  // Theme
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;

  // UI
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // Settings
  language: string;
  setLanguage: (lang: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // Theme
  theme: (localStorage.getItem(STORAGE_KEYS.THEME) as 'light' | 'dark') || 'light',
  setTheme: (theme) => {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
    set({ theme });
  },

  // UI
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  // Settings
  language: localStorage.getItem(STORAGE_KEYS.LANGUAGE) || 'vi',
  setLanguage: (lang) => {
    localStorage.setItem(STORAGE_KEYS.LANGUAGE, lang);
    set({ language: lang });
  },
}));
