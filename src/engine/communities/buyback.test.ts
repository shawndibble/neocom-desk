import { describe, expect, it } from 'vitest';
import {
  BUYBACK_GROUPS,
  MAX_QUOTE_LINES,
  QUOTE_HOLD_MS,
  buybackLineCovers,
  MAX_BUY_LINES,
  buildQuote,
  isValidRate,
  parseRate,
  readQuote,
  unitPriceOf,
  RATE_BASES,
  BUYBACK_HUB_IDS,
  priceQuote,
  quoteExpiry,
  quoteIsHeld,
  quoteIsCurrent,
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

describe('parseRate', () => {
  it('reads a plain, decimal-comma or percent-signed rate', () => {
    expect(parseRate('90')).toBe(90);
    expect(parseRate('92,5')).toBe(92.5);
    expect(parseRate(' 92.5 % ')).toBe(92.5);
  });
  it('refuses what is not a plain rate: thousands separators, exponents, hex, hundredths', () => {
    for (const text of ['', '1,000', '9e1', '0x5A', '90.55', '0', '201', 'abc', '-5']) {
      expect(parseRate(text)).toBeNull();
    }
  });
});

describe('priceQuote float safety', () => {
  it('does not lose an ISK to float error', () => {
    // 100 * 4.35 is 434.99999999999994 in floating point.
    const quote = priceQuote([{ typeId: 1, name: 'A', quantity: 100, unitPrice: 4.35 }], 100);
    expect(quote.total).toBe(435);
  });
});

describe('shared lists', () => {
  it('names the two bases, five hubs and the 50-line cap the callable mirrors', () => {
    expect([...RATE_BASES]).toEqual(['buy', 'sell']);
    expect([...BUYBACK_HUB_IDS]).toEqual(['jita', 'amarr', 'dodixie', 'rens', 'hek']);
    expect(MAX_BUY_LINES).toBe(50);
  });
});

describe('unitPriceOf', () => {
  const agg = { sellMin: 12, buyMax: 9 };
  it('reads the side the Request is a percent of', () => {
    expect(unitPriceOf(agg, 'buy')).toBe(9);
    expect(unitPriceOf(agg, 'sell')).toBe(12);
  });
  it('is null when the hub has no order on that side', () => {
    expect(unitPriceOf({ sellMin: null, buyMax: 9 }, 'sell')).toBeNull();
    expect(unitPriceOf({ sellMin: 12, buyMax: null }, 'buy')).toBeNull();
  });
});

describe('buildQuote', () => {
  const standing = {
    rate: 90,
    rateBasis: 'buy' as const,
    hubId: 'jita' as const,
    buyerCharacterId: null,
    buyLines: [
      { kind: 'group' as const, group: 'ore' as const },
      { kind: 'type' as const, typeId: 34, name: 'Tritanium' },
    ],
  };
  const veldspar = { typeId: 1230, name: 'Veldspar', groupId: 462, categoryId: 25, quantity: 1000 };
  const trit = { typeId: 34, name: 'Tritanium', groupId: 18, categoryId: 4, quantity: 500 };
  const ship = { typeId: 587, name: 'Rifter', groupId: 25, categoryId: 6, quantity: 1 };
  const prices = new Map([
    [1230, { sellMin: 12, buyMax: 10 }],
    [34, { sellMin: 5, buyMax: 4 }],
    [587, { sellMin: 400000, buyMax: 350000 }],
  ]);
  const now = 1_000_000;

  it('records the rate, basis and hub the quote was priced at', () => {
    const { quote } = buildQuote([veldspar], standing, prices, now);
    expect([quote.rate, quote.rateBasis, quote.hubId]).toEqual([90, 'buy', 'jita']);
  });

  it('prices what the Request buys at the rate and holds it 14 days', () => {
    const { quote } = buildQuote([veldspar, trit], standing, prices, now);
    expect(quote.total).toBe(9000 + 1800);
    expect(quote.quotedAt).toBe(now);
    expect(quote.expiresAt).toBe(now + QUOTE_HOLD_MS);
    expect(quote.lines.map((l) => l.typeId)).toEqual([1230, 34]);
  });

  it('leaves out what no buy line covers, and says which', () => {
    const result = buildQuote([veldspar, ship], standing, prices, now);
    expect(result.quote.total).toBe(9000);
    expect(result.notBought).toEqual([{ typeId: 587, name: 'Rifter' }]);
  });

  it('reports a covered item the hub has no price for', () => {
    const result = buildQuote([veldspar], standing, new Map(), now);
    expect(result.quote.total).toBe(0);
    expect(result.unpriced).toEqual([{ typeId: 1230, name: 'Veldspar' }]);
  });

  it('uses the sell side when the Request is a percent of sell', () => {
    const { quote } = buildQuote([veldspar], { ...standing, rateBasis: 'sell' }, prices, now);
    expect(quote.lines[0].unitPrice).toBe(12);
    expect(quote.total).toBe(10800);
  });

  it('adds up a type pasted twice', () => {
    const { quote } = buildQuote([veldspar, { ...veldspar, quantity: 500 }], standing, prices, now);
    expect(quote.lines).toHaveLength(1);
    expect(quote.lines[0].quantity).toBe(1500);
  });

  it('keeps at most the line cap and counts what it dropped', () => {
    const many = Array.from({ length: MAX_QUOTE_LINES + 3 }, (_, i) => ({
      typeId: 5000 + i,
      name: `Ore ${i}`,
      groupId: 462,
      categoryId: 25,
      quantity: 1,
    }));
    const manyPrices = new Map(many.map((m) => [m.typeId, { sellMin: 2, buyMax: 2 }]));
    const result = buildQuote(many, standing, manyPrices, now);
    expect(result.quote.lines).toHaveLength(MAX_QUOTE_LINES);
    expect(result.dropped).toBe(3);
  });
});

describe('readQuote', () => {
  const stored = {
    lines: [{ typeId: 1230, name: 'Veldspar', quantity: 1000, unitPrice: 10, total: 9000 }],
    total: 9000,
    quotedAt: 5,
    expiresAt: 5 + QUOTE_HOLD_MS,
  };
  it('reads a stored quote', () => {
    expect(readQuote(stored)).toEqual(stored);
  });
  it('keeps the rate, basis and hub it was priced at', () => {
    const priced = { ...stored, rate: 90, rateBasis: 'buy', hubId: 'jita' };
    expect(readQuote(priced)).toEqual(priced);
  });
  it('drops a rate, basis or hub that does not read, and keeps the quote', () => {
    expect(readQuote({ ...stored, rate: 'x', rateBasis: 'mid', hubId: 'nowhere' })).toEqual(stored);
  });
  it('keeps linked contracts, and drops a link that does not read', () => {
    const links = [
      { contractId: 7, status: 'finished' },
      { contractId: 8, status: 'weird' },
      { contractId: -1, status: 'outstanding' },
      'x',
    ];
    expect(readQuote({ ...stored, links })?.links).toEqual([{ contractId: 7, status: 'finished' }]);
    expect(readQuote({ ...stored, links: [] })).toEqual(stored);
  });
  it('refuses negative figures and a date that is not a date', () => {
    expect(readQuote({ ...stored, total: -1 })).toBeUndefined();
    expect(readQuote({ ...stored, lines: [{ ...stored.lines[0], quantity: 0 }] })).toBeUndefined();
    expect(
      readQuote({ ...stored, lines: [{ ...stored.lines[0], unitPrice: -2 }] })
    ).toBeUndefined();
    expect(readQuote({ ...stored, expiresAt: 1e20 })).toBeUndefined();
  });
  it('is undefined for anything that does not read as one', () => {
    expect(readQuote(undefined)).toBeUndefined();
    expect(readQuote({ ...stored, total: 'x' })).toBeUndefined();
    expect(readQuote({ ...stored, lines: [] })).toBeUndefined();
    expect(readQuote({ ...stored, lines: [{ typeId: 1 }] })).toBeUndefined();
  });
});

describe('quoteIsCurrent', () => {
  const standing = { rate: 90, rateBasis: 'buy' as const, hubId: 'jita' as const };
  it('is current while the Request still pays what the quote was priced at', () => {
    expect(quoteIsCurrent({ rate: 90, rateBasis: 'buy', hubId: 'jita' }, standing)).toBe(true);
  });
  it('is stale once the rate, basis or hub changed', () => {
    expect(quoteIsCurrent({ rate: 85, rateBasis: 'buy', hubId: 'jita' }, standing)).toBe(false);
    expect(quoteIsCurrent({ rate: 90, rateBasis: 'sell', hubId: 'jita' }, standing)).toBe(false);
    expect(quoteIsCurrent({ rate: 90, rateBasis: 'buy', hubId: 'amarr' }, standing)).toBe(false);
  });
  it('trusts a quote from before the terms were recorded', () => {
    expect(quoteIsCurrent({}, standing)).toBe(true);
  });
});
