import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { COL_DATETIME, COL_DATETIME_STACKED, COL_ISK } from '@/components/ui/dataTableWidths';
import type { WalletTransactionCommon } from '@/esi/endpoints';
import { walletTransactionBaseColumns } from './walletTransactionColumns';

const txn = (overrides: Partial<WalletTransactionCommon> = {}): WalletTransactionCommon => ({
  transaction_id: 1,
  date: '2026-10-15T13:45:00Z',
  location_id: 60003760,
  type_id: 2048,
  unit_price: 460_800,
  quantity: 3,
  client_id: 999,
  is_buy: false,
  journal_ref_id: 1,
  ...overrides,
});

function build(isPhone = false, widths?: { quantity?: string }) {
  const columns = walletTransactionBaseColumns<WalletTransactionCommon>({
    t: (key) => key,
    timeZone: 'UTC',
    isPhone,
    nameFor: () => 'Damage Control II',
    widths,
  });
  return Object.fromEntries(columns.map((column) => [column.id, column]));
}

const text = (node: ReactNode) => render(<>{node}</>).container.textContent;

describe('walletTransactionBaseColumns', () => {
  it('builds the six shared columns in order', () => {
    const columns = walletTransactionBaseColumns<WalletTransactionCommon>({
      t: (key) => key,
      timeZone: 'UTC',
      isPhone: false,
      nameFor: () => '',
    });
    expect(columns.map((column) => column.id)).toEqual([
      'date',
      'item',
      'side',
      'quantity',
      'unitPrice',
      'total',
    ]);
  });

  it('prints ISK at market precision: whole ISK from 10,000, cents below', () => {
    const columns = build();
    expect(text(columns.unitPrice!.render(txn()))).toBe('460,800');
    expect(text(columns.total!.render(txn()))).toBe('1,382,400');
    expect(text(columns.unitPrice!.render(txn({ unit_price: 12.5 })))).toBe('12.50');
  });

  it('signs and tones a buy total as money out', () => {
    const columns = build();
    const buy = txn({ is_buy: true });
    expect(text(columns.total!.render(buy))).toContain('1,382,400');
    expect(columns.total!.sortValue!(buy)).toBe(-1_382_400);
    expect(columns.total!.cellClassName!(buy)).toBe('text-isk-neg');
  });

  it('stacks the date over the time on a phone and wraps the item name to two lines', () => {
    const phone = build(true);
    expect(phone.date!.width).toBe(COL_DATETIME_STACKED);
    expect(build(false).date!.width).toBe(COL_DATETIME);
    const { container } = render(<>{phone.date!.render(txn())}</>);
    expect(container.querySelectorAll('.max-sm\\:block')).toHaveLength(2);
    expect(phone.item!.className).toBe('sm:truncate');
    expect(phone.item!.minWidth).toBe('18ch');
  });

  it('takes fitted number widths, falling back to the shared worst case', () => {
    const columns = build(false, { quantity: '5ch' });
    expect(columns.quantity!.width).toBe('5ch');
    expect(columns.unitPrice!.width).toBe(COL_ISK);
  });
});
