import en from './en.json';
import kk from './kk.json';

export type Language = 'ru' | 'kk' | 'en';
export const locales: Record<Language, string> = { ru: 'ru-KZ', kk: 'kk-KZ', en: 'en-GB' };
export const languages = [
  { code: 'kk', label: 'ҚАЗ', name: 'Қазақша' },
  { code: 'ru', label: 'РУС', name: 'Русский' },
  { code: 'en', label: 'ENG', name: 'English' },
] as const;
export function isLanguage(value: unknown): value is Language { return value === 'ru' || value === 'kk' || value === 'en'; }
const normalize = (text: string) => text.trim().replace(/\s+/g, ' ');
const normalizeCatalog = (catalog: Record<string, string>) => Object.fromEntries(Object.entries(catalog).map(([key, value]) => [normalize(key), value]));
const dictionaries: Record<'en' | 'kk', Record<string, string>> = { en: normalizeCatalog(en), kk: normalizeCatalog(kk) };
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Legacy API messages include interpolated values. Match complete message templates,
// never replace words inside bakery names, descriptions, or other user content.
const patterns = Object.keys(dictionaries.en).filter(key => /\{\d+\}/.test(key)).sort((a, b) => b.length - a.length).map(key => {
  const slots: string[] = [];
  const parts = key.split(/(\{\d+\})/g);
  const source = parts.map(part => /^\{\d+\}$/.test(part) ? (slots.push(part), '(.*?)') : escapeRegex(part)).join('');
  return { key, slots, regex: new RegExp(`^${source}$`, 's') };
});

export function translateText(text: string, language: Language, depth = 0): string {
  if (language === 'ru' || !text) return text;
  const dictionary = dictionaries[language];
  const trimmed = normalize(text);
  let translated = Object.hasOwn(dictionary, trimmed) ? dictionary[trimmed] : undefined;
  if (!translated && !/[\u0400-\u04ff]/.test(trimmed)) return text;
  if (!translated) {
    for (const pattern of patterns) {
      const match = pattern.regex.exec(trimmed);
      if (match) {
        translated = dictionary[pattern.key]?.replace(/\{\d+\}/g, slot => {
          const value = match[pattern.slots.indexOf(slot) + 1] ?? slot;
          return depth < 4 && value !== trimmed ? translateText(value, language, depth + 1) : value;
        });
        if (translated) break;
      }
    }
  }
  if (!translated) return text;
  return text.slice(0, text.length - text.trimStart().length) + translated + text.slice(text.trimEnd().length);
}

export function translate<T>(value: T, language: Language): T {
  if (typeof value === 'string') return translateText(value, language) as T;
  if (Array.isArray(value)) return value.map(item => typeof item === 'string' ? translateText(item, language) : item) as T;
  return value;
}

// Some WebKit installations fall back to numeric M01…M12 labels for Kazakh.
// Explicit month names keep the interface readable on those browsers as well.
const kazakhMonths = ['қаң.', 'ақп.', 'нау.', 'сәу.', 'мам.', 'мау.', 'шіл.', 'там.', 'қыр.', 'қаз.', 'қар.', 'жел.'];
function kazakhDate(value: string, withTime = false): string {
  const date = new Date(value.includes('T') ? value : value + 'T12:00:00');
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Almaty', day: 'numeric', month: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' as const } : {}) }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? '';
  return `${Number(part('day'))} ${kazakhMonths[Number(part('month')) - 1]}${withTime ? `, ${part('hour')}:${part('minute')}` : ''}`;
}

export function formatters(language: Language) {
  const locale = locales[language];
  const numericLocale = language === "kk" ? "ru-KZ" : locale;
  const number = (value: number, digits = 0) => new Intl.NumberFormat(numericLocale, { maximumFractionDigits: digits }).format(value);
  return {
    number,
    money: (value: number) => `${number(value)} ₸`,
    dateLabel: (value: string) => language === 'kk' ? kazakhDate(value) : new Date(value.includes('T') ? value : value + 'T12:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
    pickupTime: (value: string) => language === 'kk' ? kazakhDate(value, true) : new Date(value).toLocaleString(locale, { timeZone: 'Asia/Almaty', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    tiynMoney: (value: number) => new Intl.NumberFormat(numericLocale, { minimumFractionDigits: value % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(value / 100) + ' ₸',
  };
}
