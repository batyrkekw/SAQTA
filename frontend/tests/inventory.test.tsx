import React, { type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InventoryPage from '../src/app/inventory/page';
import type { RecordKind, StockRecord } from '../src/types/api';

vi.mock('../src/components/app-shell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }));

afterEach(() => vi.unstubAllGlobals());
const labels: Record<RecordKind, string> = { production: 'Производство', sales: 'Продажи', waste: 'Списания' };
const products = [{ id: 1, name: 'Круассан', category: 'Выпечка', unit: 'шт.', price_kzt: 750, cost_kzt: 290, weight_grams: 80, is_active: true }];
const locations = [{ id: 1, bakery_id: 1, name: 'Есиль', address: 'Демо-адрес', city: 'Астана' }];
const recordFor = (kind: RecordKind): StockRecord => ({ id: 420, kind, product_id: 1, product_name: 'Круассан', location_id: 1, location_name: 'Есиль', date: '2026-10-24', quantity: 2, ...(kind === 'waste' ? { reason: 'Истёк срок хранения' } : {}), ...(kind === 'sales' ? { unit_price_kzt: 750 } : {}), created_at: '2026-10-24T08:00:00Z' });

function mockInventoryApi() {
  const writes: { method: string; path: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
    const parsed = new URL(url);
    if (init?.method === 'PATCH' || init?.method === 'POST') {
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      writes.push({ method: init.method, path: parsed.pathname, body });
      // Mirror the API constraint that originally broke unchanged production and sales edits.
      if (body.reason === '') return new Response(JSON.stringify({ detail: 'Причина должна содержать хотя бы один символ' }), { status: 422 });
      return new Response(JSON.stringify({ ...recordFor((body.kind || parsed.pathname.split('/')[3]) as RecordKind), ...body }));
    }
    if (parsed.pathname === '/api/products') return new Response(JSON.stringify(products));
    if (parsed.pathname === '/api/locations') return new Response(JSON.stringify(locations));
    if (parsed.pathname === '/api/inventory') return new Response(JSON.stringify([]));
    if (parsed.pathname === '/api/records') return new Response(JSON.stringify({ items: [recordFor((parsed.searchParams.get('kind') || 'production') as RecordKind)], total: 1, page: 1, page_size: 15 }));
    return new Response(JSON.stringify({ detail: 'Unexpected test endpoint' }), { status: 404 });
  }));
  return writes;
}

describe('inventory record forms use the API fields for the selected record kind', () => {
  it.each<RecordKind>(['production', 'sales', 'waste'])('saves an unchanged %s record with disabled product and location selectors', async kind => {
    const writes = mockInventoryApi();
    const user = userEvent.setup();
    render(<InventoryPage />);
    await user.click(screen.getByRole('tab', { name: 'Журнал' }));
    if (kind !== 'production') await user.click(screen.getByRole('button', { name: labels[kind] }));
    await user.click(await screen.findByRole('button', { name: 'Редактировать запись 420' }));
    expect(within(screen.getByRole('dialog')).getByLabelText('Продукт')).toBeDisabled();
    expect(within(screen.getByRole('dialog')).getByLabelText('Филиал')).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(writes).toEqual([{ method: 'PATCH', path: `/api/records/${kind}/420`, body: { quantity: 2, date: '2026-10-24', ...(kind === 'waste' ? { reason: 'Истёк срок хранения' } : {}), ...(kind === 'sales' ? { unit_price_kzt: 750 } : {}) } }]);
  });

  it.each<RecordKind>(['production', 'sales'])('creates a %s record without unrelated empty fields', async kind => {
    const writes = mockInventoryApi();
    const user = userEvent.setup();
    render(<InventoryPage />);
    const add = screen.getByRole('button', { name: 'Добавить запись' });
    await waitFor(() => expect(add).toBeEnabled());
    await user.click(add);
    await user.selectOptions(screen.getByLabelText('Тип записи'), kind);
    await user.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ method: 'POST', path: '/api/records', body: { kind, product_id: 1, location_id: 1, quantity: 1 } });
    expect(writes[0].body).not.toHaveProperty('reason');
    if (kind === 'sales') expect(writes[0].body).toHaveProperty('unit_price_kzt', 750);
    else expect(writes[0].body).not.toHaveProperty('unit_price_kzt');
  });
});
