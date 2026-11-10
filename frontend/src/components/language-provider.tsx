'use client';

import { formatters,isLanguage,translate,type Language } from '@/lib/i18n/translate';
import { usePathname } from 'next/navigation';
import { createContext,useContext,useEffect,useMemo,useSyncExternalStore,type ReactNode } from 'react';

export const LANGUAGE_STORAGE_KEY = 'saqta.language.v1';
const LANGUAGE_EVENT = 'saqta:language-changed';
let memoryLanguage: Language | undefined;
function getSnapshot(): Language {
  if (memoryLanguage) return memoryLanguage;
  try { const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY); return isLanguage(stored) ? stored : 'ru'; }
  catch { return 'ru'; }
}
function subscribe(callback: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === LANGUAGE_STORAGE_KEY || event.key === null) { memoryLanguage = undefined; callback(); } };
  window.addEventListener(LANGUAGE_EVENT, callback);
  window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(LANGUAGE_EVENT, callback); window.removeEventListener('storage', onStorage); };
}
function setLanguage(language: Language) {
  memoryLanguage = language;
  try { localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* The current tab still works when storage is unavailable. */ }
  window.dispatchEvent(new Event(LANGUAGE_EVENT));
}
function makeValue(language: Language) {
  return { language, setLanguage, units: (value: number | null, unit: string) => value === null ? translate("Неизвестно", language) : `${formatters(language).number(value)} ${translate(unit, language)}`, t: <T,>(value: T): T => translate(value, language), ...formatters(language) };
}
const LanguageContext = createContext(makeValue('ru'));
export function LanguageProvider({ children }: { children: ReactNode }) {
  const language = useSyncExternalStore(subscribe, getSnapshot, () => 'ru' as Language);
  const pathname = usePathname();
  const value = useMemo(() => makeValue(language), [language]);
  const title = pathname === '/' ? 'Сохраняем еду с помощью данных' : pathname.startsWith('/forecast') ? 'SaqtaFood Forecast' : pathname.startsWith('/save') ? 'SaqtaFood Save' : pathname.startsWith('/docs') ? 'Документация' : pathname === '/about' ? 'О проекте' : pathname === '/privacy' ? 'Политика конфиденциальности' : pathname === '/terms' ? 'Пользовательское соглашение' : 'Эта страница не найдена';
  const pageTitle = title.startsWith('SaqtaFood') ? title : `${value.t(title)} · SaqtaFood`;
  const description = value.t('Прогноз спроса и продажа подходящих остатков для пекарен Казахстана.');
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  return <LanguageContext.Provider value={value}>
    <title>{pageTitle}</title>
    <meta name="description" content={description} />
    <meta property="og:title" content={pageTitle} />
    <meta property="og:description" content={description} />
    <meta property="og:site_name" content="SaqtaFood" />
    <meta property="og:type" content="website" />
    <meta property="og:locale" content={{ ru: 'ru_KZ', kk: 'kk_KZ', en: 'en_GB' }[language]} />
    {children}
  </LanguageContext.Provider>;
}
export function useI18n() { return useContext(LanguageContext); }
