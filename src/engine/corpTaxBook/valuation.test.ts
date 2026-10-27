import { describe, it, expect } from 'vitest';
import { moonOwnerUnitPrice, priceObservedDay, valueObservedEntry } from './valuation';
import type { ObservedMiningEntry } from './types';

const RAW_A = 45490;
const RAW_B = 45491;
const COMP_A = 62516;
const compressedByRaw = { [String(RAW_A)]: COMP_A };

const entry: ObservedMiningEntry = {
  characterId: 90000001,
  recordedCorporationId: 98000001,
  structureId: 1001,
  date: '2026-07-12',
  oreLines: [
    { typeId: RAW_A, quantity: 100 },
    { typeId: RAW_B, quantity: 50 },
  ],
};

describe('priceObservedDay', () => {
  it('prices each raw type as its Compressed Ore Form when the book uses Compressed', () => {
    const day = priceObservedDay([RAW_A, RAW_B], {
      ore: { compressedByRaw, compressed: true },
      saved: [
        {
          [COMP_A]: { buy: 30, sell: 40 },
          [RAW_A]: { buy: 3, sell: 4 },
          [RAW_B]: { buy: 5, sell: 6 },
        },
      ],
    });
    expect(day.prices.get(RAW_A)).toBe(30);
    // No compressed counterpart: stays raw.
    expect(day.prices.get(RAW_B)).toBe(5);
    expect(day.sources.get(RAW_A)).toBe('saved');
  });

  it('prices the raw type when the book uses Raw', () => {
    const day = priceObservedDay([RAW_A], {
      ore: { compressedByRaw, compressed: false },
      saved: [{ [COMP_A]: { buy: 30, sell: 40 }, [RAW_A]: { buy: 3, sell: 4 } }],
    });
    expect(day.prices.get(RAW_A)).toBe(3);
  });

  it('merges saved snapshot layers with the later layer winning per type, like the personal tab (server over Dexie)', () => {
    const day = priceObservedDay([RAW_A, RAW_B], {
      ore: { compressedByRaw, compressed: false },
      saved: [
        { [RAW_A]: { buy: 1, sell: 2 }, [RAW_B]: { buy: 7, sell: 8 } },
        { [RAW_A]: { buy: 3, sell: 4 } },
      ],
    });
    expect(day.prices.get(RAW_A)).toBe(3);
    expect(day.prices.get(RAW_B)).toBe(7);
  });

  it('falls back saved → historical → live buy → live sell, flagging the sell fallback and the unpriced', () => {
    const RAW_C = 45492;
    const RAW_D = 45493;
    const day = priceObservedDay([RAW_A, RAW_B, RAW_C, RAW_D], {
      ore: { compressedByRaw: {}, compressed: true },
      saved: [],
      historical: { [RAW_A]: { buy: 11, sell: null } },
      live: {
        [RAW_A]: { buy: 99, sell: 100 },
        [RAW_B]: { buy: 12, sell: 13 },
        [RAW_C]: { buy: null, sell: 14 },
      },
    });
    expect([...day.prices]).toEqual([
      [RAW_A, 11],
      [RAW_B, 12],
      [RAW_C, 14],
      [RAW_D, 0],
    ]);
    expect(day.sources.get(RAW_A)).toBe('historical');
    expect(day.sellFallback).toEqual(new Set([RAW_C]));
    expect(day.unpriced).toEqual(new Set([RAW_D]));
  });
});

describe('valueObservedEntry', () => {
  it('values an entry the personal tab’s way: Σ quantity × price, tax = value × pct / 100', () => {
    const prices = new Map([
      [RAW_A, 30],
      [RAW_B, 5],
    ]);
    // 100*30 + 50*5 = 3250; 10% = 325
    expect(valueObservedEntry(entry, prices, 10)).toEqual({ estimatedValue: 3250, taxOwed: 325 });
  });

  it('values an unpriced type at zero rather than throwing', () => {
    expect(valueObservedEntry(entry, new Map([[RAW_A, 30]]), 10)).toEqual({
      estimatedValue: 3000,
      taxOwed: 300,
    });
  });
});

describe('moonOwnerUnitPrice (#4621)', () => {
  it("values a moon owner's ore at the hub's saved open buy, else its open sell, else 0", () => {
    expect(moonOwnerUnitPrice({ buy: 120, sell: 150 })).toBe(120);
    expect(moonOwnerUnitPrice({ buy: null, sell: 150 })).toBe(150);
    expect(moonOwnerUnitPrice({ buy: 0, sell: 150 })).toBe(150);
    expect(moonOwnerUnitPrice({ buy: null, sell: null })).toBe(0);
    expect(moonOwnerUnitPrice(undefined)).toBe(0);
  });
});
