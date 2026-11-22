import { act, fireEvent, render, screen } from '@testing-library/react';
import { LanguageProvider } from '../src/components/language-provider';
import { WakeBanner } from '../src/components/wake-banner';

vi.mock('next/navigation', () => ({ usePathname: () => '/' }));
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, WAKE_EVENT, api, configureWakeRetry } from '../src/lib/api';
import { planFor } from '../src/components/forecast-playground';
import { AllergenPicker, AllergenSummary } from '../src/features/save/allergens';
import { pickupPreset } from '../src/features/save/marketplace';

describe('forecast playground', () => {
  it('replays a plan against the same four days', () => {
    const result = planFor([10, 12, 8, 10], 0);
    expect(result.plan).toBe(10);
    expect(result.leftovers).toBe(2);
    expect(result.shortDays).toBe(1);
    expect(result.missed).toBe(2);
  });
  it('a larger buffer trades shortages for leftovers', () => {
    const lean = planFor([52, 55, 49, 54], 0), safe = planFor([52, 55, 49, 54], 20);
    expect(safe.plan).toBeGreaterThan(lean.plan);
    expect(safe.shortDays).toBe(0);
    expect(safe.leftovers).toBeGreaterThan(lean.leftovers);
  });
});

describe('pickup presets', () => {
  it('tonight runs until 21:00 when at least an hour remains', () => {
    const now = new Date(2026, 10, 18, 17, 7);
    const preset = pickupPreset('tonight', now);
    expect(preset.start.getHours()).toBe(17);
    expect(preset.start.getMinutes()).toBe(15);
    expect(preset.end.getHours()).toBe(21);
    expect(preset.expiry.getTime()).toBeGreaterThan(preset.end.getTime());
  });
  it('late evening falls back to a two-hour window and keeps expiry after pickup', () => {
    const now = new Date(2026, 10, 18, 22, 40);
    const preset = pickupPreset('tonight', now);
    expect(preset.end.getTime() - preset.start.getTime()).toBe(2 * 3600_000);
    expect(preset.expiry.getTime()).toBeGreaterThanOrEqual(preset.end.getTime());
  });
  it('tomorrow morning is 08:00–11:00', () => {
    const preset = pickupPreset('morning', new Date(2026, 10, 18, 12, 0));
    expect([preset.start.getDate(), preset.start.getHours(), preset.end.getHours()]).toEqual([19, 8, 11]);
  });
});

function Picker() {
  const [value, setValue] = useState<string[] | null>(null);
  return <><AllergenPicker value={value} onChange={setValue} /><output>{JSON.stringify(value)}</output></>;
}

describe('sleeping API host', () => {
  afterEach(() => { configureWakeRetry(0); vi.unstubAllGlobals(); vi.useRealTimers(); });
  it('retries a GET through the host loading page and announces waking', async () => {
    vi.useFakeTimers();
    configureWakeRetry(60_000);
    const loading = () => new Response('<html>Service waking up</html>', { status: 503, headers: { 'content-type': 'text/html' } });
    const fetchMock = vi.fn().mockResolvedValueOnce(loading()).mockRejectedValueOnce(new TypeError('CORS'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const events: boolean[] = [];
    window.addEventListener(WAKE_EVENT, event => events.push((event as CustomEvent<boolean>).detail));
    const result = api<{ ok: boolean }>('/health');
    await vi.runAllTimersAsync();
    await expect(result).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(events).toEqual([true, false]);
  });
  it('announces waking while a request hangs on a cold host, then clears it', async () => {
    vi.useFakeTimers();
    configureWakeRetry(60_000);
    let finish: (value: Response) => void = () => {};
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>(resolve => { finish = resolve; })));
    const events: boolean[] = [];
    const listener = (event: Event) => events.push((event as CustomEvent<boolean>).detail);
    window.addEventListener(WAKE_EVENT, listener);
    const result = api<{ ok: boolean }>('/analysis/state');
    await vi.advanceTimersByTimeAsync(2_000);
    expect(events).toEqual([]);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(events).toEqual([true]);
    finish(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await expect(result).resolves.toEqual({ ok: true });
    expect(events).toEqual([true, false]);
    window.removeEventListener(WAKE_EVENT, listener);
  });
  it('shows elapsed time and progress while the host wakes', async () => {
    vi.useFakeTimers();
    render(<LanguageProvider><WakeBanner /></LanguageProvider>);
    act(() => { window.dispatchEvent(new CustomEvent(WAKE_EVENT, { detail: true })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
    expect(screen.getByRole('status')).toHaveTextContent('Прошло 5 с · пробуем снова автоматически');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '5');
    act(() => { window.dispatchEvent(new CustomEvent(WAKE_EVENT, { detail: false })); });
    expect(screen.queryByRole('status')).toBeNull();
  });
  it('never retries a POST and passes JSON 503 errors through', async () => {
    configureWakeRetry(60_000);
    const fetchMock = vi.fn().mockResolvedValue(new Response('<html></html>', { status: 503, headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api('/market/orders', { method: 'POST', body: '{}' })).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'Нет данных' }), { status: 503, headers: { 'content-type': 'application/json' } }));
    await expect(api('/health')).rejects.toThrow('Нет данных');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('allergens', () => {
  it('distinguishes undeclared, declared-none and selected allergens', () => {
    render(<Picker />);
    const output = () => document.querySelector('output')!.textContent;
    expect(output()).toBe('null');
    fireEvent.click(screen.getByRole('button', { name: 'Молоко' }));
    expect(output()).toBe('["milk"]');
    expect(screen.getByRole('button', { name: 'Молоко' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Молоко' }));
    expect(output()).toBe('null');
    fireEvent.click(screen.getByRole('checkbox'));
    expect(output()).toBe('[]');
  });
  it('tells buyers when allergens were not declared', () => {
    render(<AllergenSummary allergens={null} />);
    expect(screen.getByText(/не указаны продавцом/)).toBeInTheDocument();
  });
});
