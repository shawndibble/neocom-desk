import { render, renderHook, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import type { RegionOrder } from '@/esi/endpoints';
import { useMarketOrderColumns } from './useMarketOrderColumns';
import { useVisibleMarketOrderColumns } from './marketOrderColumns';

const t = ((key: string) => key) as unknown as TFunction;

function columnsFor(hideLocation: boolean, myOrderIds: ReadonlySet<number> = new Set()) {
  return renderHook(() =>
    useMarketOrderColumns({
      t,
      npcStationMap: new Map(),
      solarSystemMap: new Map(),
      myOrderIds,
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

describe('useMarketOrderColumns own-order mark', () => {
  const order = (id: number) =>
    ({ order_id: id, price: 5.5, is_buy_order: false, volume_remain: 1 }) as RegionOrder;

  it("shows a visible glyph in the price cell of the pilot's own order only", () => {
    const { orderColumnsById } = columnsFor(false, new Set([1]));
    render(<div>{orderColumnsById.price.render(order(1))}</div>);
    const mark = screen.getByRole('img', { name: 'market.myOrder' });
    expect(mark).not.toHaveClass('sr-only');
    expect(screen.getByText('5.50').parentElement).toContainElement(mark);
  });

  it("shows no glyph on another pilot's order", () => {
    const { orderColumnsById } = columnsFor(false, new Set([1]));
    render(<div>{orderColumnsById.price.render(order(2))}</div>);
    expect(screen.queryByRole('img')).toBeNull();
  });
});
