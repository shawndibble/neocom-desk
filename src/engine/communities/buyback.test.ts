import { describe, expect, it } from 'vitest';
import {
  BUYBACK_GROUPS,
  QUOTE_HOLD_MS,
  buybackLineCovers,
  isValidRate,
  priceQuote,
  quoteExpiry,
  quoteIsHeld,
} from './buyback';

describe('isValidRate', () => {
  it('takes 1 to 200 percent in tenths', () => {
    expect(isValidRate(90)).toBe(true);
    expect(isValidRate(92.5)).toBe(true);
    expect(isValidRate(1)).toBe(true);
    expect(isValidRate(200)).toBe(true);
  });
  it('refuses zero, over 200, hundredths and non-numbers', () => {
    expect(isValidRate(0)).toBe(false);
    expect(isValidRate(200.1)).toBe(false);
    expect(isValidRate(90.05)).toBe(false);
    expect(isValidRate(Number.NaN)).toBe(false);
    expect(isValidRate('90')).toBe(false);
  });
});

describe('buybackLineCovers', () => {
  it('matches a type line by type id only', () => {
    const line = { kind: 'type' as const, typeId: 1230, name: 'Veldspar' };
    expect(buybackLineCovers(line, { typeId: 1230, groupId: 462, categoryId: 25 })).toBe(true);
    expect(buybackLineCovers(line, { typeId: 1228, groupId: 462, categoryId: 25 })).toBe(false);
  });
  it('matches a group line by its group or category table', () => {
    const ore = { kind: 'group' as const, group: 'ore' as const };
    expect(buybackLineCovers(ore, { typeId: 1230, groupId: 462, categoryId: 25 })).toBe(true);
    expect(buybackLineCovers(ore, { typeId: 34, groupId: 18, categoryId: 4 })).toBe(false);
  });
  it('does not put ice in ore', () => {
    const ore = { kind: 'group' as const, group: 'ore' as const };
    const ice = { kind: 'group' as const, group: 'ice' as const };
    const blueIce = { typeId: 16264, groupId: 465, categoryId: 25 };
    expect(buybackLineCovers(ice, blueIce)).toBe(true);
    expect(buybackLineCovers(ore, blueIce)).toBe(false);
  });
  it('knows an item with no group data is covered by no group', () => {
    const ore = { kind: 'group' as const, group: 'ore' as const };
    expect(buybackLineCovers(ore, { typeId: 1, groupId: null, categoryId: null })).toBe(false);
  });
  it('lists every group it can name', () => {
    expect(Object.keys(BUYBACK_GROUPS).sort()).toEqual(
      ['gas', 'ice', 'minerals', 'ore', 'pi', 'salvage'].sort()
    );
  });
});

describe('priceQuote', () => {
  it('prices each line at the rate of its hub price and sums them', () => {
    const quote = priceQuote(
      [
        { typeId: 1230, name: 'Veldspar', quantity: 1000, unitPrice: 10 },
        { typeId: 34, name: 'Tritanium', quantity: 500, unitPrice: 4 },
      ],
      90
    );
    expect(quote.lines).toEqual([
      { typeId: 1230, name: 'Veldspar', quantity: 1000, unitPrice: 10, total: 9000 },
      { typeId: 34, name: 'Tritanium', quantity: 500, unitPrice: 4, total: 1800 },
    ]);
    expect(quote.total).toBe(10800);
  });
  it('rounds each line down to a whole ISK so the lines add to the total', () => {
    const quote = priceQuote([{ typeId: 1, name: 'A', quantity: 3, unitPrice: 1.11 }], 90);
    expect(quote.lines[0].total).toBe(2);
    expect(quote.total).toBe(2);
  });
  it('leaves an unpriced line out of the total and reports it', () => {
    const quote = priceQuote(
      [
        { typeId: 1, name: 'A', quantity: 10, unitPrice: 5 },
        { typeId: 2, name: 'B', quantity: 10, unitPrice: null },
      ],
      100
    );
    expect(quote.total).toBe(50);
    expect(quote.unpriced).toEqual([2]);
  });
  it('quotes zero for an empty pile', () => {
    expect(priceQuote([], 90)).toEqual({ lines: [], total: 0, unpriced: [] });
  });
});

describe('the 14-day hold', () => {
  it('is fourteen days', () => {
    expect(QUOTE_HOLD_MS).toBe(14 * 24 * 60 * 60 * 1000);
  });
  it('expires 14 days after it was quoted', () => {
    expect(quoteExpiry(1_000)).toBe(1_000 + QUOTE_HOLD_MS);
  });
  it('is held until the moment it expires', () => {
    const quote = { quotedAt: 0, expiresAt: QUOTE_HOLD_MS };
    expect(quoteIsHeld(quote, QUOTE_HOLD_MS - 1)).toBe(true);
    expect(quoteIsHeld(quote, QUOTE_HOLD_MS)).toBe(false);
  });
});
