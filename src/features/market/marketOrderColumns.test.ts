import { describe, expect, it } from 'vitest';
import type { RegionOrder } from '@/esi/endpoints';
import {
  DEFAULT_VISIBLE_MARKET_ORDER_COLUMNS,
  ORDER_BOOK_LOCATION_CLASS,
  ORDER_BOOK_LOCATION_REM,
  orderBookFigureChars,
  orderBookWidthsRem,
} from './marketOrderColumns';

/** "5.50" at one unit: every figure narrower than its column's header. */
const SHORT = { priceChars: 4, quantityChars: 1, baitFlag: false };

describe('orderBookWidthsRem', () => {
  it('sizes a book of short figures by its headers alone', () => {
    const widths = orderBookWidthsRem(DEFAULT_VISIBLE_MARKET_ORDER_COLUMNS, SHORT);
    expect(widths.cards).toBeCloseTo(43.375);
    expect(widths.roomy).toBeCloseTo(50.375);
  });

  it('widens Price and Quantity only as far as the longest figure on screen', () => {
    const short = orderBookWidthsRem(DEFAULT_VISIBLE_MARKET_ORDER_COLUMNS, SHORT);
    // "1,234,567,891" and "12,345,678".
    const long = orderBookWidthsRem(DEFAULT_VISIBLE_MARKET_ORDER_COLUMNS, {
      priceChars: 13,
      quantityChars: 10,
      baitFlag: false,
    });
    // Price 4.75 -> 7.18rem, Quantity 4.125 -> 6.1rem.
    expect(long.cards - short.cards).toBeCloseTo(4.405);
  });

  it("adds the bait flag's icon beside a price that already fills its column", () => {
    const figures = { priceChars: 13, quantityChars: 1 };
    const plain = orderBookWidthsRem(['price'], { ...figures, baitFlag: false });
    const flagged = orderBookWidthsRem(['price'], { ...figures, baitFlag: true });
    expect(flagged.cards - plain.cards).toBeCloseTo(1.25);
  });

  it('lets a table with fewer columns hold on at a narrower width', () => {
    const all = orderBookWidthsRem(DEFAULT_VISIBLE_MARKET_ORDER_COLUMNS, SHORT);
    const fewer = orderBookWidthsRem(['price', 'quantity', 'location', 'expiry'], SHORT);
    expect(fewer.cards).toBeCloseTo(all.cards - 5.125 - 4 - 5.25);
  });

  it('has nothing to squeeze without a Location column', () => {
    const widths = orderBookWidthsRem(['price', 'quantity', 'expiry'], SHORT);
    expect(widths.roomy).toBe(widths.cards);
  });

  it('budgets Min. Volume once a pilot ticks it', () => {
    expect(orderBookWidthsRem(['price', 'minVolume'], SHORT).cards).toBeCloseTo(
      orderBookWidthsRem(['price'], SHORT).cards + 6.25
    );
  });

  it('leaves Min. Volume off by default', () => {
    expect(DEFAULT_VISIBLE_MARKET_ORDER_COLUMNS).not.toContain('minVolume');
  });

  it("caps Location's cell at the widths the budget assumes", () => {
    for (const size of ['roomy', 'squeezed'] as const) {
      expect(ORDER_BOOK_LOCATION_CLASS[size]).toContain(
        `max-w-[${ORDER_BOOK_LOCATION_REM[size]}rem]`
      );
    }
  });
});

describe('orderBookFigureChars', () => {
  const order = (fields: Partial<RegionOrder>): RegionOrder =>
    ({ price: 5.5, volume_remain: 1, is_buy_order: false, ...fields }) as RegionOrder;

  it('measures the longest Price and Quantity as the table prints them', () => {
    expect(
      orderBookFigureChars(
        [
          order({ price: 8_880_000, volume_remain: 19 }),
          order({ price: 5.5, volume_remain: 12_345 }),
        ],
        null
      )
    ).toEqual({ priceChars: '8,880,000'.length, quantityChars: '12,345'.length, baitFlag: false });
  });

  it('notes a bait-priced sell order, whose flag sits beside its price', () => {
    expect(orderBookFigureChars([order({ price: 100 })], 1).baitFlag).toBe(true);
    // A buy order is never flagged, however far it sits from the best sell.
    expect(orderBookFigureChars([order({ price: 100, is_buy_order: true })], 1).baitFlag).toBe(
      false
    );
  });

  it('has nothing to measure in an empty book', () => {
    expect(orderBookFigureChars([], null)).toEqual({
      priceChars: 0,
      quantityChars: 0,
      baitFlag: false,
    });
  });
});
