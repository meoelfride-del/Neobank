import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import resources from './resources';
import { LANGUAGE_STORAGE_KEY, resolveLanguage, SUPPORTED_LANGUAGES } from './locale';

const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
const browserLanguages = typeof navigator === 'undefined' ? [] : (navigator.languages || [navigator.language]);

i18n.use(initReactI18next).init({
  resources,
  lng: resolveLanguage({ stored, browserLanguages }),
  fallbackLng: 'fr',
  supportedLngs: SUPPORTED_LANGUAGES,
  interpolation: { escapeValue: false },
  returnNull: false,
});

function applyLanguage(language) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  document.documentElement.lang = language;
}

applyLanguage(i18n.resolvedLanguage || i18n.language);
i18n.on('languageChanged', applyLanguage);

export default i18n;

