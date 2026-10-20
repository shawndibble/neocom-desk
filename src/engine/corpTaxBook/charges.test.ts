import { describe, it, expect } from 'vitest';
import { buildDayCharges, minerIdFor, type Miner } from './charges';
import type { ObservedMiningEntry } from './types';
import type { TaxRate } from './rates';

const CORP_ID = 98000001;
const ORE = 45490;

function entry(overrides: Partial<ObservedMiningEntry> = {}): ObservedMiningEntry {
  return {
    characterId: 90000001,
    recordedCorporationId: CORP_ID,
    structureId: 1001,
    date: '2026-07-12',
    oreLines: [{ typeId: ORE, quantity: 100 }],
    ...overrides,
  };
}

const miners: Miner[] = [
  { id: 'm1', characterIds: [90000001, 90000002], mainCharacterId: 90000001 },
];
const rates: TaxRate[] = [
  { scope: 'corp', pct: 10, effectiveFrom: '2026-01-01' },
  { scope: 'guest', pct: 20, effectiveFrom: '2026-01-01' },
  { scope: 'moon', moonId: 40000001, pct: 5, effectiveFrom: '2026-01-01' },
];

const book = {
  corporationId: CORP_ID,
  startDate: '2026-07-01',
  miners,
  rates,
  pricesOn: () => ({
    prices: new Map([[ORE, 30]]),
    sources: new Map([[ORE, 'saved' as const]]),
  }),
  placeOf: (structureId: number) =>
    structureId === 2002 ? { moonId: 40000001, extractionId: 'x1' } : {},
};

describe('minerIdFor', () => {
  it('finds the Miner a character is grouped into', () => {
    expect(minerIdFor(90000002, miners)).toBe('m1');
  });

  it('defaults to one Miner per character', () => {
    expect(minerIdFor(90000009, miners)).toBe('solo:90000009');
  });
});

describe('buildDayCharges', () => {
  it('turns each Observed Mining Entry into a day charge for its Miner, valued at its date and rate', () => {
    const { charges } = buildDayCharges([entry({ characterId: 90000002 })], book);
    expect(charges).toEqual([
      {
        key: '90000002:1001:2026-07-12',
        minerId: 'm1',
        characterId: 90000002,
        structureId: 1001,
        date: '2026-07-12',
        isGuest: false,
        oreLines: [{ typeId: ORE, quantity: 100 }],
        unitPrices: { [ORE]: 30 },
        priceSources: { [ORE]: 'saved' },
        taxPct: 10,
        rateScope: 'corp',
        rateEffectiveFrom: '2026-01-01',
        estimatedValue: 3000,
        taxOwed: 300,
      },
    ]);
  });

  it('bills a guest at the Guest default', () => {
    const { charges } = buildDayCharges([entry({ recordedCorporationId: 1 })], book);
    expect(charges[0]).toMatchObject({ isGuest: true, taxPct: 20, taxOwed: 600 });
  });

  it('carries the refinery’s moon and Extraction, and the moon rate', () => {
    const { charges } = buildDayCharges([entry({ structureId: 2002 })], book);
    expect(charges[0]).toMatchObject({ moonId: 40000001, extractionId: 'x1', taxPct: 5 });
  });

  it('keeps mining before the book’s start date as history that owes nothing', () => {
    const early = entry({ date: '2026-06-30' });
    const { charges, beforeBook } = buildDayCharges([early, entry()], book);
    expect(charges.map((c) => c.date)).toEqual(['2026-07-12']);
    expect(beforeBook).toEqual([early]);
  });

  it('lists an entry with no rate in effect as unrated instead of billing it at zero', () => {
    const { charges, unrated } = buildDayCharges([entry()], { ...book, rates: [] });
    expect(charges).toEqual([]);
    expect(unrated).toHaveLength(1);
  });
});

describe('buildDayCharges per-feeder tier', () => {
  it('prices each refinery at its own feeder rate on one day', () => {
    const feederRates: TaxRate[] = [
      ...rates,
      { scope: 'feeder', feederId: 98000077, pct: 7, effectiveFrom: '2026-01-01' },
    ];
    const { charges } = buildDayCharges(
      [entry({ structureId: 1001 }), entry({ structureId: 1002, sourceCorporationId: 98000077 })],
      { ...book, rates: feederRates }
    );
    expect(charges.map((c) => [c.structureId, c.taxPct, c.rateScope])).toEqual([
      [1001, 10, 'corp'],
      [1002, 7, 'feeder'],
    ]);
  });
});
