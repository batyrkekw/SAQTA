import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { api, ApiError, query, useApi } from '../src/lib/api';

afterEach(() => vi.unstubAllGlobals());
describe('API failure handling and changing filters', () => {
  it('retains structured CSV row errors for correction', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: { message: 'Импорт отменён', errors: [{ row: 3, message: 'Недостаточно запаса' }] } }), { status: 422 })));
    try { await api('/import'); throw new Error('Expected validation failure'); }
    catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).rows).toEqual([{ row: 3, message: 'Недостаточно запаса' }]);
      expect((error as Error).message).toContain('Импорт отменён');
    }
  });
  it('shows safe network errors rather than fabricated metrics', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private internal error')));
    await expect(api('/dashboard')).rejects.toThrow('Нет связи с сервером SAQTA');
  });
  it('ignores an old response when a location filter changes', async () => {
    let resolveOld!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { resolveOld = resolve; })).mockResolvedValueOnce(new Response(JSON.stringify({ sold: 12 }))));
    const { result, rerender } = renderHook(({ path }) => useApi<{sold: number}>(path), { initialProps: { path: '/dashboard?location_id=1' } });
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    rerender({ path: '/dashboard?location_id=2' });
    await waitFor(() => expect(result.current.data?.sold).toBe(12));
    await act(async () => { resolveOld(new Response(JSON.stringify({ sold: 999 }))); });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.sold).toBe(12);
    expect(query({ location_id: 2, search: 'хлеб & булочка', empty: '' })).toBe('?location_id=2&search=%D1%85%D0%BB%D0%B5%D0%B1+%26+%D0%B1%D1%83%D0%BB%D0%BE%D1%87%D0%BA%D0%B0');
  });
});
