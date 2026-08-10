import { Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../i18n/locale';

export default function LanguageSelector({ compact = false }) {
  const { t, i18n } = useTranslation();
  return (
    <label className="inline-flex items-center gap-2 text-sm text-slate-250/70">
      <Languages size={16} aria-hidden="true" />
      {!compact && <span className="sr-only sm:not-sr-only">{t('language.label')}</span>}
      <select
        value={i18n.resolvedLanguage || i18n.language}
        onChange={(event) => i18n.changeLanguage(event.target.value)}
        aria-label={t('language.label')}
        className="max-w-32 rounded-lg border border-white/10 bg-ink-900 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-mint-400"
      >
        {SUPPORTED_LANGUAGES.map((language) => <option key={language} value={language}>{t(`language.names.${language}`)}</option>)}
      </select>
    </label>
  );
}

