import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import { piTier } from '@/engine/pi/chain';
import type { PlannerColony, PlanetType } from '@/engine/pi/goalTypes';
import { colonyBudget } from './colonyBudget';
import type { ChainBasis, ChainEstimateView } from './chainEstimateModel';
import {
  biggerChainCandidates,
  biggerChainsView,
  estimateOnColonies,
  estimateOnNewPlanets,
  type ColonyChainEstimate,
} from './biggerChainsModel';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

// Raws.
const AQUEOUS = 2268;
const IONIC = 2309;
const NOBLE_GAS = 2310;
const REACTIVE_GAS = 2311;
const BASE_METALS = 2267;
const FELSIC = 2307;
const HEAVY_METALS = 2272;
const NON_CS = 2306;
const PLASMA = 2308;
// Products.
const CONDENSATES = 2344; // P3: Ionic, Aqueous, Reactive Gas, Noble Gas — all on Gas.
const ROBOTICS = 9848; // P3: Non-CS Crystals, Heavy, Noble and Base Metals — none on Gas.

const GAS_RAWS = [AQUEOUS, IONIC, NOBLE_GAS, REACTIVE_GAS];
const LAVA_RAWS = [BASE_METALS, FELSIC, HEAVY_METALS, NON_CS, PLASMA];

function books(): ChainBasis['books'] {
  const book: Record<number, number> = {};
  const byTier: Record<number, number> = { 0: 5, 1: 400, 2: 8_000, 3: 60_000, 4: 1_000_000 };
  for (const raw of pi.raw) book[raw.typeID] = 5;
  for (const key of Object.keys(pi.schematics)) book[Number(key)] = byTier[piTier(Number(key), pi)];
  return { prices: book, revenuePrices: book, salesTaxPct: 4 };
}

function basis(overrides: Partial<ChainBasis> = {}): ChainBasis {
  const cc = colonyBudget(5, pi);
  return {
    ccLevel: cc.level,
    ccAssumed: false,
    budget: cc.budget,
    newLinkCost: { cpu: 25, powergrid: 18 },
    linkCost: 'borrowed',
    headsPerExtractor: 10,
    ratePerHour: 6_000,
    rateSource: 'measured',
    taxRate: 0.1,
    books: books(),
    haulDays: 7,
    ...overrides,
  };
}

function colony(planetId: number, planetType: PlanetType, raws: number[]): PlannerColony {
  const cc = colonyBudget(5, pi);
  return {
    planetId,
    planetType,
    budget: cc.budget,
    newLinkCost: { cpu: 25, powergrid: 18 },
    headsPerExtractor: 10,
    taxRate: 0.1,
    ratePerEcu: new Map(
      raws.map((id) => [id, { unitsPerHour: 6000, source: 'measured' as const }])
    ),
    current: { p0TypeIds: [], productTypeIds: [] },
  };
}

const TWO_GAS = [colony(1, 'gas', GAS_RAWS), colony(2, 'gas', GAS_RAWS)];

describe('biggerChainCandidates', () => {
  it('offers a P3 or P4 only when the pilot’s own planet types yield every raw and host the factories', () => {
    const candidates = biggerChainCandidates(TWO_GAS, pi);
    expect(candidates).toContain(CONDENSATES);
    // Robotics needs metals a Gas planet never yields.
    expect(candidates).not.toContain(ROBOTICS);
    // Every candidate is P3 or P4.
    expect(candidates.every((id) => piTier(id, pi) >= 3)).toBe(true);
  });

  it('offers nothing to a pilot with no colonies', () => {
    expect(biggerChainCandidates([], pi)).toEqual([]);
  });
});

describe('estimateOnColonies', () => {
  const colonies = [...TWO_GAS, colony(3, 'lava', LAVA_RAWS)];

  it('runs the chain on the pilot’s colonies, naming the planets it uses and the factory planet', () => {
    const jumps = (from: number, to: number | 'hub') => (to === 'hub' ? 9 : from === to ? 0 : 2);
    const result = estimateOnColonies(CONDENSATES, colonies, basis(), jumps, pi);
    if (!result) throw new Error('expected an estimate');
    // Both Gas colonies extract; the factories go wherever the solver hosts them best.
    expect(result.planetIds).toEqual(expect.arrayContaining([1, 2]));
    expect(result.planetIds).toContain(result.hostId);
    expect(result.iskPerDay).toBeGreaterThan(0);
    expect(result.m3PerWeek).toBeGreaterThan(0);
    // Every leg between two of the chain's planets, with its distance.
    expect(result.legs.length).toBeGreaterThan(0);
    for (const leg of result.legs) {
      expect(leg.to).toBe(result.hostId);
      expect(leg.jumps).toBe(2);
    }
  });

  it('says a distance is unknown without a jumps function, never zero', () => {
    const result = estimateOnColonies(CONDENSATES, colonies, basis(), undefined, pi)!;
    expect(result.legs.every((leg) => leg.jumps === null)).toBe(true);
  });

  it('gives no figure when the sell market has no price for the product', () => {
    const b = basis();
    const revenuePrices = { ...b.books.revenuePrices };
    delete revenuePrices[CONDENSATES];
    expect(
      estimateOnColonies(
        CONDENSATES,
        colonies,
        basis({ books: { ...b.books, revenuePrices } }),
        undefined,
        pi
      )
    ).toBeNull();
  });
});

describe('estimateOnNewPlanets', () => {
  it('lays the chain on new planets of the pilot’s own types, within their free slots', () => {
    const view = estimateOnNewPlanets(CONDENSATES, ['gas'], 3, basis(), pi);
    if (!view) throw new Error('expected an estimate');
    expect(view.planets.every((type) => type === 'gas')).toBe(true);
    expect(view.planets.length).toBeLessThanOrEqual(3);
  });

  it('gives none when the chain needs more planets than the pilot has free', () => {
    expect(estimateOnNewPlanets(CONDENSATES, ['gas'], 1, basis(), pi)).toBeNull();
  });

  it('gives none when the pilot’s types cannot yield every raw', () => {
    expect(estimateOnNewPlanets(ROBOTICS, ['gas'], 6, basis(), pi)).toBeNull();
  });
});

// --- The verdict ---------------------------------------------------------------

function onColonies(overrides: Partial<ColonyChainEstimate> = {}): ColonyChainEstimate {
  return {
    typeId: CONDENSATES,
    iskPerDay: 3_000_000,
    unitsPerDay: 40,
    planetIds: [1, 2],
    hostId: 1,
    m3PerWeek: 700,
    legs: [{ from: 2, to: 1, jumps: 2 }],
    ...overrides,
  };
}

function onNew(overrides: Partial<ChainEstimateView> = {}): ChainEstimateView {
  return {
    typeId: CONDENSATES,
    iskPerDay: 2_000_000,
    unitsPerDay: 30,
    planets: ['gas', 'gas'],
    hostType: 'gas',
    m3PerWeek: 1_400,
    m3PerHaul: 1_400,
    haulDays: 7,
    ccLevel: 5,
    ccAssumed: false,
    rateSource: 'measured',
    headsPerExtractor: 10,
    ratePerHour: 6_000,
    ...overrides,
  };
}

const SLOTS = { free: 0, gainPerPlanetPerDay: 800_000 };

describe('biggerChainsView', () => {
  it('recommends a chain on the pilot’s colonies that beats what those planets earn on their best one-planet picks', () => {
    const view = biggerChainsView({
      estimates: new Map([[CONDENSATES, { colonies: onColonies(), newPlanets: null }]]),
      afterRebuildPerDay: new Map([
        [1, 1_000_000],
        [2, 1_200_000],
        [3, 5_000_000],
      ]),
      slots: SLOTS,
      haulDays: 3,
    });
    expect(view.others).toEqual([]);
    expect(view.recommended).toHaveLength(1);
    const card = view.recommended[0];
    // Compared with planets 1 and 2 only: the chain leaves planet 3 as it is.
    expect(card.versusPerDay).toBe(2_200_000);
    expect(card.gainPerDay).toBe(800_000);
    expect(card.verdict).toBe('beats');
    // Per trip at the pilot's own haul cadence.
    expect(card.m3PerWeek).toBe(700);
    expect(card.m3PerHaul).toBe(300);
  });

  it('lists a chain that does not beat the one-planet picks apart, never as a recommendation', () => {
    const view = biggerChainsView({
      estimates: new Map([[CONDENSATES, { colonies: onColonies(), newPlanets: null }]]),
      afterRebuildPerDay: new Map([
        [1, 2_000_000],
        [2, 2_000_000],
      ]),
      slots: SLOTS,
      haulDays: 7,
    });
    expect(view.recommended).toEqual([]);
    expect(view.others[0].verdict).toBe('short');
    expect(view.others[0].gainPerDay).toBe(-1_000_000);
  });

  it('never claims a chain beats planets it has no figure for', () => {
    const view = biggerChainsView({
      estimates: new Map([[CONDENSATES, { colonies: onColonies(), newPlanets: null }]]),
      afterRebuildPerDay: new Map([
        [1, 100],
        [2, null],
      ]),
      slots: SLOTS,
      haulDays: 7,
    });
    expect(view.recommended).toEqual([]);
    expect(view.others[0]).toMatchObject({
      verdict: 'unknown',
      versusPerDay: null,
      gainPerDay: null,
    });
  });

  it('recommends a chain on new planets when it beats the best one-planet pick on as many free slots', () => {
    const view = biggerChainsView({
      estimates: new Map([[CONDENSATES, { colonies: null, newPlanets: onNew() }]]),
      afterRebuildPerDay: new Map(),
      slots: { free: 3, gainPerPlanetPerDay: 800_000 },
      haulDays: 7,
    });
    const card = view.recommended[0];
    expect(card.kind).toBe('new-planets');
    // Two new planets, each against the one-planet pick a free slot would otherwise take.
    expect(card.versusPerDay).toBe(1_600_000);
    expect(card.gainPerDay).toBe(400_000);
  });

  it('shows one card a product: the variant that gains the most', () => {
    const view = biggerChainsView({
      estimates: new Map([
        [CONDENSATES, { colonies: onColonies({ iskPerDay: 2_100_000 }), newPlanets: onNew() }],
      ]),
      afterRebuildPerDay: new Map([
        [1, 1_000_000],
        [2, 1_000_000],
      ]),
      slots: { free: 2, gainPerPlanetPerDay: 800_000 },
      haulDays: 7,
    });
    expect(view.recommended).toHaveLength(1);
    expect(view.recommended[0].kind).toBe('new-planets');
  });

  it('orders recommendations by what they gain, most first', () => {
    const other = 2345; // Camera Drones
    const view = biggerChainsView({
      estimates: new Map([
        [CONDENSATES, { colonies: onColonies({ iskPerDay: 2_500_000 }), newPlanets: null }],
        [
          other,
          { colonies: onColonies({ typeId: other, iskPerDay: 4_000_000 }), newPlanets: null },
        ],
      ]),
      afterRebuildPerDay: new Map([
        [1, 1_000_000],
        [2, 1_000_000],
      ]),
      slots: SLOTS,
      haulDays: 7,
    });
    expect(view.recommended.map((card) => card.typeId)).toEqual([other, CONDENSATES]);
  });

  it('drops a product with no figure on either side', () => {
    const view = biggerChainsView({
      estimates: new Map([[CONDENSATES, { colonies: null, newPlanets: null }]]),
      afterRebuildPerDay: new Map(),
      slots: SLOTS,
      haulDays: 7,
    });
    expect(view).toEqual({ recommended: [], others: [] });
  });
});
