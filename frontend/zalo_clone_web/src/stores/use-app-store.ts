/**
 * Global App Store sử dụng Zustand
 */

import { create } from 'zustand';
import { STORAGE_KEYS } from '@/constants/storage-keys';

/** Apply or remove the `dark` class on <html> for Tailwind dark mode */
function applyThemeToDom(theme: 'light' | 'dark') {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

const storedTheme = (localStorage.getItem(STORAGE_KEYS.THEME) as 'light' | 'dark') || 'light';
// Apply immediately on module load so there's no flash
applyThemeToDom(storedTheme);

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
  theme: storedTheme,
  setTheme: (theme) => {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
    applyThemeToDom(theme);
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
