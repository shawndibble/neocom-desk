import { describe, expect, it } from 'vitest';
import { DEFAULT_VISIBLE_MARKET_ORDER_COLUMNS, orderBookWidthsRem } from './marketOrderColumns';

describe('orderBookWidthsRem', () => {
  it('keeps every default column, Expires included, as a table down to 47.25rem', () => {
    expect(orderBookWidthsRem(DEFAULT_VISIBLE_MARKET_ORDER_COLUMNS)).toEqual({
      roomy: 54.25,
      cards: 47.25,
    });
  });

  it('lets a table with fewer columns hold on at a narrower width', () => {
    const all = orderBookWidthsRem(DEFAULT_VISIBLE_MARKET_ORDER_COLUMNS);
    const fewer = orderBookWidthsRem(['price', 'quantity', 'location', 'expiry']);
    expect(fewer.cards).toBe(all.cards - 5.25 - 6.25 - 5.25);
  });

  it('has nothing to squeeze without a Location column', () => {
    const widths = orderBookWidthsRem(['price', 'quantity', 'expiry']);
    expect(widths.roomy).toBe(widths.cards);
  });

  it('budgets Min. Volume once a pilot ticks it', () => {
    expect(orderBookWidthsRem(['price', 'minVolume']).cards).toBe(
      orderBookWidthsRem(['price']).cards + 8
    );
  });

  it('leaves Min. Volume off by default', () => {
    expect(DEFAULT_VISIBLE_MARKET_ORDER_COLUMNS).not.toContain('minVolume');
  });
});
