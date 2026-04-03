import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

type TranslationStore = {
  // Map of messageId -> Map of targetLang -> translated text
  translations: Record<string, Record<string, string>>;
  // Map of messageId -> Map of lang -> hidden state
  hiddenTranslations: Record<string, Record<string, boolean>>;
  // Map of messageId -> targetLangs currently waiting for async AI result
  pendingTranslations: Record<string, string[]>;
  
  setTranslation: (messageId: string, lang: string, text: string) => void;
  removeTranslation: (messageId: string, lang: string) => void;
  hideTranslation: (messageId: string, lang: string) => void;
  showTranslation: (messageId: string, lang: string) => void;
  startTranslation: (messageId: string, lang: string) => void;
  finishTranslation: (messageId: string, lang: string) => void;
  getTranslation: (messageId: string, lang: string) => string | undefined;
  isTranslationHidden: (messageId: string, lang: string) => boolean;
  isTranslationPending: (messageId: string, lang?: string) => boolean;
  clearTranslations: () => void;
  
  // Initialize store from AsyncStorage
  hydrate: () => Promise<void>;
};

const STORAGE_KEY = '@translation_store';

export const useTranslationStore = create<TranslationStore>((set, get) => ({
  translations: {},
  hiddenTranslations: {},
  pendingTranslations: {},

  setTranslation: (messageId, lang, text) =>
    set((state) => ({
      hiddenTranslations: {
        ...state.hiddenTranslations,
        [messageId]: {
          ...(state.hiddenTranslations[messageId] || {}),
          [lang]: false,
        },
      },
      translations: {
        ...state.translations,
        [messageId]: {
          ...(state.translations[messageId] || {}),
          [lang]: text,
        },
      },
    })),

  removeTranslation: (messageId, lang) =>
    set((state) => {
      const existing = state.translations[messageId];
      if (!existing || !(lang in existing)) {
        return state;
      }

      const nextByLang = { ...existing };
      delete nextByLang[lang];

      const nextTranslations = { ...state.translations };
      if (Object.keys(nextByLang).length > 0) {
        nextTranslations[messageId] = nextByLang;
      } else {
        delete nextTranslations[messageId];
      }

      const hiddenByMessage = state.hiddenTranslations[messageId] || {};
      const nextHiddenByLang = { ...hiddenByMessage };
      delete nextHiddenByLang[lang];

      const nextHiddenTranslations = { ...state.hiddenTranslations };
      if (Object.keys(nextHiddenByLang).length > 0) {
        nextHiddenTranslations[messageId] = nextHiddenByLang;
      } else {
        delete nextHiddenTranslations[messageId];
      }

      return {
        translations: nextTranslations,
        hiddenTranslations: nextHiddenTranslations,
      };
    }),

  hideTranslation: (messageId, lang) =>
    set((state) => ({
      hiddenTranslations: {
        ...state.hiddenTranslations,
        [messageId]: {
          ...(state.hiddenTranslations[messageId] || {}),
          [lang]: true,
        },
      },
    })),

  showTranslation: (messageId, lang) =>
    set((state) => ({
      hiddenTranslations: {
        ...state.hiddenTranslations,
        [messageId]: {
          ...(state.hiddenTranslations[messageId] || {}),
          [lang]: false,
        },
      },
    })),

  startTranslation: (messageId, lang) =>
    set((state) => {
      const existing = state.pendingTranslations[messageId] || [];
      if (existing.includes(lang)) {
        return state;
      }

      return {
        pendingTranslations: {
          ...state.pendingTranslations,
          [messageId]: [...existing, lang],
        },
      };
    }),

  finishTranslation: (messageId, lang) =>
    set((state) => {
      const existing = state.pendingTranslations[messageId] || [];
      if (existing.length === 0) {
        return state;
      }

      const nextForMessage = existing.filter((value) => value !== lang);

      const nextPendingTranslations = { ...state.pendingTranslations };
      if (nextForMessage.length > 0) {
        nextPendingTranslations[messageId] = nextForMessage;
      } else {
        delete nextPendingTranslations[messageId];
      }

      return {
        pendingTranslations: nextPendingTranslations,
      };
    }),

  getTranslation: (messageId, lang) => {
    const state = get();
    return state.translations[messageId]?.[lang];
  },

  isTranslationHidden: (messageId, lang) => {
    const state = get();
    return state.hiddenTranslations[messageId]?.[lang] ?? false;
  },

  isTranslationPending: (messageId, lang) => {
    const state = get();
    const pending = state.pendingTranslations[messageId] || [];
    return lang ? pending.includes(lang) : pending.length > 0;
  },

  clearTranslations: () =>
    set(() => ({
      translations: {},
      hiddenTranslations: {},
      pendingTranslations: {},
    })),

  hydrate: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const { translations, hiddenTranslations } = JSON.parse(stored);
        set({
          translations: translations || {},
          hiddenTranslations: hiddenTranslations || {},
        });
      }
    } catch (error) {
      console.error('Failed to hydrate translation store:', error);
    }
  },
}));

// Watch for changes and persist to AsyncStorage
let prevTranslations = useTranslationStore.getState().translations;
let prevHiddenTranslations = useTranslationStore.getState().hiddenTranslations;

useTranslationStore.subscribe((state) => {
  const { translations, hiddenTranslations } = state;

  if (
    translations !== prevTranslations ||
    hiddenTranslations !== prevHiddenTranslations
  ) {
    prevTranslations = translations;
    prevHiddenTranslations = hiddenTranslations;

    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        translations,
        hiddenTranslations,
      })
    ).catch((error) =>
      console.error('Failed to persist translation store:', error)
    );
  }
});
