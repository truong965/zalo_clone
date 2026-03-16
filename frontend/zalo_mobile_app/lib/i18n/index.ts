import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from '@/translations/en.json';
import vi from '@/translations/vi.json';

const fallbackLanguage = 'vi';
const deviceLanguage = Localization.getLocales()[0]?.languageCode ?? fallbackLanguage;

if (!i18n.isInitialized) {
      void i18n.use(initReactI18next).init({
            compatibilityJSON: 'v4',
            lng: deviceLanguage,
            fallbackLng: fallbackLanguage,
            resources: {
                  en: { translation: en },
                  vi: { translation: vi },
            },
            interpolation: {
                  escapeValue: false,
            },
      });
}

export { i18n };
