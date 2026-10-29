'use client';

import { languages } from '@/lib/i18n/translate';
import { useI18n } from './language-provider';

export function LanguageSwitcher() {
  const { language, setLanguage } = useI18n();
  return <div className="language-switcher" role="group" aria-label={language === 'kk' ? 'Сайт тілі' : language === 'en' ? 'Website language' : 'Язык сайта'}>
    {languages.map(item => <button key={item.code} type="button" lang={item.code} aria-label={item.name} title={item.name} aria-pressed={language === item.code} onClick={() => setLanguage(item.code)}>{item.label}</button>)}
  </div>;
}
