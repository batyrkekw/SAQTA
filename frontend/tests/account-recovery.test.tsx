import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AccountButton, AccountProvider } from '../src/features/account/account';
import { LanguageProvider } from '../src/components/language-provider';
import { api } from '../src/lib/api';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it('bounds a stalled authentication response body and aborts its request', async () => {
  vi.useFakeTimers();
  let signal: AbortSignal | undefined;
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    signal = init.signal;
    return { ok: true, json: () => new Promise(() => {}) };
  }));
  const result = api('/auth/register', { method: 'POST' });
  const checked = expect(result).rejects.toThrow('Если аккаунт уже создан');
  await vi.advanceTimersByTimeAsync(20_000);
  await checked;
  expect(signal?.aborted).toBe(true);
});

it('releases a stalled login form and allows retry with the same entered credentials', async () => {
  let loginCalls = 0;
  const fetcher = vi.fn(async (url: string) => {
    if (url.endsWith('/auth/me')) return new Response(JSON.stringify({ detail: 'Войдите' }), { status: 401 });
    loginCalls++;
    if (loginCalls === 1) return new Promise<Response>(() => {});
    return new Response(JSON.stringify({ detail: 'Неверный email или пароль' }), { status: 401 });
  });
  vi.stubGlobal('fetch', fetcher);
  render(<LanguageProvider><AccountProvider><AccountButton /></AccountProvider></LanguageProvider>);
  await userEvent.click(screen.getByRole('button', { name: 'Войти' }));
  const dialog = within(screen.getByRole('dialog'));
  fireEvent.change(dialog.getByLabelText('Email'), { target: { value: 'buyer@example.test' } });
  fireEvent.change(dialog.getByLabelText(/Пароль/), { target: { value: 'test-safe-password' } });
  vi.useFakeTimers();
  fireEvent.click(dialog.getByRole('button', { name: 'Войти' }));
  expect(dialog.getByRole('button', { name: 'Сохраняем…' })).toBeDisabled();
  expect(dialog.getByRole('button', { name: 'Создать аккаунт' })).toBeDisabled();
  await act(() => vi.advanceTimersByTimeAsync(20_000));
  expect(dialog.getByRole('alert')).toHaveTextContent('Сервер не ответил вовремя');
  expect(dialog.getByLabelText('Email')).toHaveValue('buyer@example.test');
  expect(dialog.getByLabelText(/Пароль/)).toHaveValue('test-safe-password');
  vi.useRealTimers();
  await userEvent.click(dialog.getByRole('button', { name: 'Войти' }));
  await waitFor(() => expect(dialog.getByRole('alert')).toHaveTextContent('Неверный email или пароль'));
  expect(loginCalls).toBe(2);
});

it('keeps credentials when switching forms and can reveal the password without submitting', async () => {
  const fetcher = vi.fn(async () => new Response('{}', { status: 401 }));
  vi.stubGlobal('fetch', fetcher);
  render(<LanguageProvider><AccountProvider><AccountButton /></AccountProvider></LanguageProvider>);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Войти' }));
  let dialog = within(screen.getByRole('dialog'));
  await user.type(dialog.getByLabelText('Email'), 'buyer@example.test');
  await user.type(dialog.getByLabelText(/Пароль/), 'test-safe-password');
  await user.click(dialog.getByRole('button', { name: 'Показать пароль' }));
  expect(dialog.getByLabelText(/Пароль/)).toHaveAttribute('type', 'text');
  await user.click(dialog.getByRole('button', { name: 'Создать аккаунт' }));
  dialog = within(screen.getByRole('dialog'));
  expect(dialog.getByLabelText('Email')).toHaveValue('buyer@example.test');
  expect(dialog.getByLabelText(/Пароль/)).toHaveAttribute('type', 'password');
  expect(dialog.getByRole('checkbox')).not.toBeChecked();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
