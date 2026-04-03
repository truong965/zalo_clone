import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
};

export const useTranslationStore = create<TranslationStore>()(
  persist(
    (set, get) => ({
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
          const nextPending = { ...state.pendingTranslations };

          if (nextForMessage.length > 0) {
            nextPending[messageId] = nextForMessage;
          } else {
            delete nextPending[messageId];
          }

          return {
            pendingTranslations: nextPending,
          };
        }),
      getTranslation: (messageId, lang) => {
        return get().translations[messageId]?.[lang];
      },
      isTranslationHidden: (messageId, lang) => {
        return Boolean(get().hiddenTranslations[messageId]?.[lang]);
      },
      isTranslationPending: (messageId, lang) => {
        const pending = get().pendingTranslations[messageId] || [];
        if (!lang) {
          return pending.length > 0;
        }

        return pending.includes(lang);
      },
      clearTranslations: () => set({ translations: {}, hiddenTranslations: {}, pendingTranslations: {} }),
    }),
    {
      name: 'ai-translation-storage', // key in localStorage
      partialize: (state) => ({
        translations: state.translations,
        hiddenTranslations: state.hiddenTranslations,
      }),
    }
  )
);
