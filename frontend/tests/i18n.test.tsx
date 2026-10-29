import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { renderToString } from 'react-dom/server';
vi.mock('next/navigation', () => ({ usePathname: () => '/forecast' }));
import { LANGUAGE_STORAGE_KEY, LanguageProvider, useI18n } from '../src/components/language-provider';
import { LanguageSwitcher } from '../src/components/language-switcher';
import { formatters, translateText } from '../src/lib/i18n/translate';
import en from '../src/lib/i18n/en.json';
import kk from '../src/lib/i18n/kk.json';

function Draft() {
  const [value, setValue] = useState('');
  const { t, number } = useI18n();
  return <><h1>{t('Прогноз')}</h1><label>Draft<input value={value} onChange={event => setValue(event.target.value)} /></label><span>{number(12345.5, 1)}</span><LanguageSwitcher /></>;
}
function resetStorage() {
  localStorage.clear();
  window.dispatchEvent(new StorageEvent('storage', { key: LANGUAGE_STORAGE_KEY }));
}
beforeEach(resetStorage);
afterEach(() => { vi.restoreAllMocks(); act(resetStorage); });

describe('three-language interface', () => {
  it('switches RU → EN → KK → RU without losing a draft and persists the choice', () => {
    render(<LanguageProvider><Draft /></LanguageProvider>);
    fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'Менің наубайханам' } });
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('heading')).toHaveTextContent('Forecast');
    expect(document.documentElement.lang).toBe('en');
    expect(screen.getByText('12,345.5')).toBeInTheDocument();
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('en');
    fireEvent.click(screen.getByRole('button', { name: 'Қазақша' }));
    expect(screen.getByRole('heading')).toHaveTextContent('Болжам');
    expect(document.documentElement.lang).toBe('kk');
    expect(screen.getByLabelText('Draft')).toHaveValue('Менің наубайханам');
    fireEvent.click(screen.getByRole('button', { name: 'Русский' }));
    expect(screen.getByRole('heading')).toHaveTextContent('Прогноз');
    expect(screen.getByRole('button', { name: 'Русский' })).toHaveAttribute('aria-pressed', 'true');
  });
  it('restores a saved language and responds to another tab changing it', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'kk');
    const { unmount } = render(<LanguageProvider><Draft /></LanguageProvider>);
    expect(screen.getByRole('heading')).toHaveTextContent('Болжам');
    act(() => { localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en'); window.dispatchEvent(new StorageEvent('storage', { key: LANGUAGE_STORAGE_KEY })); });
    expect(screen.getByRole('heading')).toHaveTextContent('Forecast');
    unmount();
    render(<LanguageProvider><Draft /></LanguageProvider>);
    expect(screen.getByRole('heading')).toHaveTextContent('Forecast');
  });
  it('falls back safely for invalid preferences and works when storage is blocked', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'not-a-language');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    render(<LanguageProvider><Draft /></LanguageProvider>);
    expect(screen.getByRole('heading')).toHaveTextContent('Прогноз');
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('heading')).toHaveTextContent('Forecast');
  });
  it('uses a stable Russian server snapshot before hydrating the saved locale', () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'kk');
    expect(renderToString(<LanguageProvider><Draft /></LanguageProvider>)).toContain('Прогноз');
  });
});

describe('translation catalogs and formats', () => {
  it('has matching catalogs and preserves every interpolation slot', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(kk).sort());
    for (const catalog of [en, kk]) for (const [key, value] of Object.entries(catalog)) {
      expect(value.trim(), key).not.toBe('');
      expect(value.match(/\{\d+\}/g)?.sort() ?? [], key).toEqual(key.match(/\{\d+\}/g)?.sort() ?? []);
    }
  });
  it('translates dynamic notices, keeps whitespace, and leaves user content untouched', () => {
    expect(translateText('До 10 точек', 'en')).toBe('Up to 10 locations');
    expect(translateText(' Сохранить ', 'kk')).toBe(' Сақтау ');
    expect(translateText('Моя пекарня «Алтын нан»', 'en')).toBe('Моя пекарня «Алтын нан»');
    expect(translateText('constructor', 'en')).toBe('constructor');
  });
  it('handles empty optional text and translated fragments inside API messages', () => {
    expect(translateText('Свободный запас: 16 шт.', 'en')).toBe('Free stock: 16 pcs.');
    expect(translateText('Свободный запас: 16 шт. · в предложении: 3', 'en')).toBe('Free stock: 16 pcs. · listed: 3');
    const formula = '0.6 × 40.00 + 0.4 × 65.00 = 50.00; округление до целых = 50 шт.';
    expect(translateText(formula, 'en')).toBe('0.6 × 40.00 + 0.4 × 65.00 = 50.00; rounded to whole units = 50 pcs');
    expect(translateText(formula, 'kk')).toContain('бүтін санға дөңгелектеу');
    expect(translateText('MAE SAQTA ниже ошибки простого прогноза на 12% на этой выборке.', 'en')).not.toMatch(/[А-Яа-яЁё]/);
  });
  it('formats dates and tenge without changing their numeric values', () => {
    expect(formatters('en').dateLabel('2026-10-29')).toBe('29 Oct');
    expect(formatters('kk').dateLabel('2026-10-29')).toBe('29 қаз.');
    expect(formatters('kk').pickupTime('2026-10-29T09:00:00Z')).toBe('29 қаз., 14:00');
    expect(formatters('en').money(15000)).toBe('15,000 ₸');
    expect(formatters('ru').tiynMoney(10000)).toBe('100 ₸');
    expect(formatters('en').tiynMoney(10050)).toBe('100.50 ₸');
  });
});
