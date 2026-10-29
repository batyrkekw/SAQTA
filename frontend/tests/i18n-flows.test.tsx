import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LANGUAGE_STORAGE_KEY, LanguageProvider } from '../src/components/language-provider';
import { LanguageSwitcher } from '../src/components/language-switcher';
import SavingsCalculator from '../src/features/forecast/savings-calculator';
import { ForecastAccessProvider } from '../src/features/forecast/access-panel';
import { translateText, type Language } from '../src/lib/i18n/translate';
vi.mock('next/navigation', () => ({ usePathname: () => '/forecast' }));

function choose(language: Language) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  window.dispatchEvent(new StorageEvent('storage', { key: LANGUAGE_STORAGE_KEY }));
}
beforeEach(() => { localStorage.clear(); window.sessionStorage.clear(); choose('ru'); });
afterEach(() => { vi.unstubAllGlobals(); act(() => choose('ru')); });

describe.each<Language>(['ru', 'kk', 'en'])('%s form and response messages', language => {
  const t = (text: string) => translateText(text, language);
  it('translates numeric validation and keeps it reactive when the language changes', () => {
    choose(language);
    render(<LanguageProvider><LanguageSwitcher /><SavingsCalculator /></LanguageProvider>);
    fireEvent.change(screen.getByLabelText(t('Произведено, ед.')), { target: { value: '' } });
    expect(screen.getByText(t('Введите корректное число'))).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByText('Enter a valid number')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Produced, units/)).toHaveValue(null);
  });
  it('translates required fields and server errors without locking sign-in', async () => {
    choose(language);
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/health')) return new Response(JSON.stringify({ workspace_mode: 'real', demo_data: false }));
      if (url.endsWith('/subscription')) return new Response(JSON.stringify({ detail: 'Войдите в организацию' }), { status: 401 });
      return new Response(JSON.stringify({ detail: 'Нет связи с сервером SAQTA. Проверьте подключение и повторите запрос.' }), { status: 503 });
    });
    vi.stubGlobal('fetch', fetcher);
    render(<LanguageProvider><ForecastAccessProvider><div /></ForecastAccessProvider></LanguageProvider>);
    const submit = await screen.findByRole('button', { name: t('Войти') });
    fireEvent.click(submit);
    expect(screen.getByText(t('Заполните все обязательные поля'))).toBeInTheDocument();
    expect(submit).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'baker@example.test' } });
    fireEvent.change(screen.getByLabelText(new RegExp(t('Пароль'))), { target: { value: 'test-password-123' } });
    fireEvent.click(submit);
    expect(await screen.findByText(t('Нет связи с сервером SAQTA. Проверьте подключение и повторите запрос.'))).toBeInTheDocument();
  });
});
