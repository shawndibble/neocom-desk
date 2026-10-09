import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { useMarketOrderColumns } from './useMarketOrderColumns';
import { useVisibleMarketOrderColumns } from './marketOrderColumns';

const t = ((key: string) => key) as unknown as TFunction;

function columnsFor(hideLocation: boolean) {
  return renderHook(() =>
    useMarketOrderColumns({
      t,
      npcStationMap: new Map(),
      solarSystemMap: new Map(),
      myOrderIds: new Set(),
      jumpRangeFilter: {
        status: 'ready',
        allowed: null,
        jumps: null,
        jumpsStatus: 'no-origin',
      },
      bestSell: null,
      cards: false,
      locationSqueezed: false,
      hideLocation,
    })
  ).result.current;
}

describe('useMarketOrderColumns hideLocation', () => {
  it('keeps Location in both tables for a multi-station book', () => {
    const columns = columnsFor(false);
    expect(columns.baseColumns.map((c) => c.id)).toContain('location');
    expect(columns.buyColumns.map((c) => c.id)).toContain('location');
    expect(columns.orderColumnsById.price.cardCorner).toBe(true);
  });

  it('drops Location from both tables for a single-station book, price taking the card title', () => {
    const columns = columnsFor(true);
    expect(columns.baseColumns.map((c) => c.id)).not.toContain('location');
    expect(columns.buyColumns.map((c) => c.id)).not.toContain('location');
    expect(columns.baseColumns.map((c) => c.id)).toEqual(
      expect.arrayContaining(['price', 'quantity', 'expiry'])
    );
    expect(columns.orderColumnsById.price.cardCorner).toBe(false);
  });

  it('never writes the rule into the stored column choice', () => {
    columnsFor(true);
    expect(useVisibleMarketOrderColumns.getState().value).toContain('location');
  });
});
