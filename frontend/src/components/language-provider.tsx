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
  const title = pathname === '/' ? 'Сохраняем еду с помощью данных' : pathname.startsWith('/forecast') ? 'Прогнозирование' : pathname.startsWith('/save') ? 'SAQTA Save' : pathname.startsWith('/docs') ? 'Документация' : pathname === '/about' ? 'О проекте' : 'Эта страница не найдена';
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  return <LanguageContext.Provider value={value}>
    <title>{`${value.t(title)} · SAQTA`}</title>
    <meta name="description" content={value.t('Прогноз спроса и продажа подходящих остатков для пекарен Казахстана.')} />
    {children}
  </LanguageContext.Provider>;
}
export function useI18n() { return useContext(LanguageContext); }
