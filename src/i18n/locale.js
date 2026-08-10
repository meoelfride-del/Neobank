export const SUPPORTED_LANGUAGES = ['fr', 'en', 'es', 'pt', 'it', 'de', 'pl', 'ru'];
export const DEFAULT_LANGUAGE = 'fr';
export const LANGUAGE_STORAGE_KEY = 'neobank_language';

export function normalizeLanguage(value) {
  if (typeof value !== 'string') return null;
  const language = value.trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_LANGUAGES.includes(language) ? language : null;
}

export function resolveLanguage({ stored, account, browserLanguages = [] } = {}) {
  return normalizeLanguage(stored)
    || normalizeLanguage(account)
    || browserLanguages.map(normalizeLanguage).find(Boolean)
    || DEFAULT_LANGUAGE;
}

export function languageToLocale(language) {
  const locales = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES', pt: 'pt-PT', it: 'it-IT', de: 'de-DE', pl: 'pl-PL', ru: 'ru-RU' };
  return locales[normalizeLanguage(language)] || locales[DEFAULT_LANGUAGE];
}

export function formatCurrency(value, currency = 'EUR', language = DEFAULT_LANGUAGE) {
  return new Intl.NumberFormat(languageToLocale(language), { style: 'currency', currency }).format(Number(value) || 0);
}

export function formatDate(value, language = DEFAULT_LANGUAGE, options = { dateStyle: 'medium' }) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(languageToLocale(language), options).format(date);
}

