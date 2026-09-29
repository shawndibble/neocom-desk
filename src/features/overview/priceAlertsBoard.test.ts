import { describe, expect, it } from 'vitest';
import type { QuickbarItem } from '@/db';
import type { PriceAlertSnapshot } from '@/engine/notificationDiffs';
import { buildPriceAlertRows } from './priceAlertsBoard';

const item = (
  typeId: number,
  targetPrice?: number,
  direction?: 'above' | 'below'
): QuickbarItem => ({
  typeId,
  name: `Type ${typeId}`,
  targetPrice,
  targetDirection: direction,
});

const snapshot = (
  entries: {
    typeId: number;
    targetPrice: number;
    direction: 'above' | 'below';
    price: number | null;
  }[]
): PriceAlertSnapshot => ({
  nowMs: 0,
  entries: entries.map((entry) => ({ ...entry, name: `Type ${entry.typeId}` })),
});

describe('buildPriceAlertRows', () => {
  it('lists only Quickbar items carrying a target', () => {
    const rows = buildPriceAlertRows([item(1), item(2, 100, 'above')], null);
    expect(rows.map((row) => row.typeId)).toEqual([2]);
  });

  it('marks an alert crossed when the last polled price is past its target', () => {
    const rows = buildPriceAlertRows(
      [item(1, 100, 'above'), item(2, 50, 'below')],
      snapshot([
        { typeId: 1, targetPrice: 100, direction: 'above', price: 120 },
        { typeId: 2, targetPrice: 50, direction: 'below', price: 60 },
      ])
    );
    expect(rows.map((row) => [row.typeId, row.price, row.crossed])).toEqual([
      [1, 120, true],
      [2, 60, false],
    ]);
  });

  /*
   * The poller priced the *old* target. Judging a new target against that
   * reading would say "crossed" or "not" about a question nobody has checked
   * yet, so the price is withheld until the next poll.
   */
  it('withholds a price polled against a target the pilot has since changed', () => {
    const rows = buildPriceAlertRows(
      [item(1, 200, 'above')],
      snapshot([{ typeId: 1, targetPrice: 100, direction: 'above', price: 150 }])
    );
    expect(rows[0]).toMatchObject({ price: null, crossed: false });
  });

  it('puts crossed alerts first, keeping Quickbar order otherwise', () => {
    const rows = buildPriceAlertRows(
      [item(1, 100, 'above'), item(2, 100, 'above'), item(3, 100, 'above')],
      snapshot([
        { typeId: 1, targetPrice: 100, direction: 'above', price: 10 },
        { typeId: 3, targetPrice: 100, direction: 'above', price: 500 },
      ])
    );
    expect(rows.map((row) => row.typeId)).toEqual([3, 1, 2]);
  });
});
