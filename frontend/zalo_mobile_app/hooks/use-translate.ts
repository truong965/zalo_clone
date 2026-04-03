import { useCallback } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { mobileApi } from '@/services/api';
import { useTranslationStore } from './use-translation-store';

interface TranslateResponse {
  data?: {
    translatedText: string;
  };
  translatedText?: string;
}

export function useTranslate() {
  const { accessToken: authToken } = useAuth();
  const {
    setTranslation,
    startTranslation,
    finishTranslation,
  } = useTranslationStore();

  const translate = useCallback(
    async (messageId: string, conversationId: string, targetLang: string, content?: string) => {
      if (!authToken) {
        console.error('No auth token available for translation');
        return;
      }

      startTranslation(messageId, targetLang);

      try {
        const data = await mobileApi.translateMessage(authToken, {
          conversationId,
          messageId,
          targetLang,
        }) as TranslateResponse;
        const translatedText = data.data?.translatedText || data.translatedText;
        
        if (translatedText) {
          setTranslation(messageId, targetLang, translatedText);
          finishTranslation(messageId, targetLang);
          return;
        }

        // Backend may return 202 and emit socket event later.
        // Keep pending state for UX loading; auto-expire to avoid infinite spinner.
        setTimeout(() => {
          if (useTranslationStore.getState().isTranslationPending(messageId, targetLang)) {
            finishTranslation(messageId, targetLang);
            console.warn('[useTranslate] Translation timeout waiting for socket event');
          }
        }, 30_000);
      } catch (error) {
        console.error('Translation error:', error);
        finishTranslation(messageId, targetLang);
      }
    },
    [authToken, setTranslation, startTranslation, finishTranslation]
  );

  return { translate };
}
