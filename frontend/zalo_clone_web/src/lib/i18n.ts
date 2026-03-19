import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import Backend from 'i18next-http-backend';
import LanguageDetector from 'i18next-browser-languagedetector';
import { STORAGE_KEYS } from '@/constants/storage-keys';

i18n
  .use(Backend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'vi',
    detection: {
      order: ['localStorage', 'navigator'], // Ưu tiên tìm trong localStorage trước, nếu không có thì lấy ngôn ngữ của trình duyệt
      lookupLocalStorage: STORAGE_KEYS.LANGUAGE, // Đọc từ cái key mà bạn đã định nghĩa
      caches: ['localStorage'], // BẤT CỨ KHI NÀO user đổi ngôn ngữ, tự động lưu đè vào đúng key này
    },
    debug: false,
    interpolation: {
      escapeValue: false, // React đã tự chống XSS
    },
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
  });

export default i18n;
