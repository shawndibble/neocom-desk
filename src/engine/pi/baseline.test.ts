import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import { baselineTotal, colonyBaseline } from './baseline';
import type { PlannerColony, PlannerPolicy, PriceBooks } from './goalTypes';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const BASE_METALS = 2267;
const NOBLE_METALS = 2270;
const REACTIVE_METALS = 2398;
const PRECIOUS_METALS = 2399;

const POLICY: PlannerPolicy = {
  maxEcusPerColony: 2,
  maxP0TypesPerColony: 2,
  extraEcuFactor: 0.8,
  buyTiers: [],
};
const ONE_ECU: PlannerPolicy = { ...POLICY, maxEcusPerColony: 1, maxP0TypesPerColony: 1 };

function colony(opts: {
  planetId?: number;
  cc?: number;
  taxRate?: number;
  rates?: Record<number, number>;
}): PlannerColony {
  const row = pi.infrastructure.commandCenterUpgrades[opts.cc ?? 5];
  const rates = opts.rates ?? { [BASE_METALS]: 6000, [NOBLE_METALS]: 6000 };
  return {
    planetId: opts.planetId ?? 1,
    planetType: 'barren',
    budget: { cpu: row.cpu, powergrid: row.powergrid },
    newLinkCost: { cpu: 15, powergrid: 10 },
    headsPerExtractor: 10,
    taxRate: opts.taxRate ?? 0.1,
    ratePerEcu: new Map(
      Object.entries(rates).map(([id, unitsPerHour]) => [
        Number(id),
        { unitsPerHour, source: 'assumed' as const },
      ])
    ),
    current: { p0TypeIds: [], productTypeIds: [] },
  };
}

function books(bid: Record<number, number>, ask: Record<number, number> = bid): PriceBooks {
  return { bid, ask, salesTaxPct: 0 };
}

describe('colonyBaseline', () => {
  it('picks the highest-value P1, not the highest-volume one', () => {
    const c = colony({ rates: { [BASE_METALS]: 6000, [NOBLE_METALS]: 3000 } });
    const result = colonyBaseline(
      c,
      pi,
      ONE_ECU,
      books({ [REACTIVE_METALS]: 500, [PRECIOUS_METALS]: 2000 })
    );
    expect(result).toMatchObject({ status: 'ok', slots: [{ p1TypeId: PRECIOUS_METALS }] });
    // 20 P1/h × (2000 − 0.1 × 400 customs).
    if (result.status !== 'ok') throw new Error(result.status);
    expect(result.iskPerHour).toBeCloseTo(20 * 1960);
  });

  it('prices at the bid after sales tax, not the ask', () => {
    const result = colonyBaseline(colony({ taxRate: 0 }), pi, ONE_ECU, {
      bid: { [REACTIVE_METALS]: 1000, [PRECIOUS_METALS]: 900 },
      ask: { [REACTIVE_METALS]: 1000, [PRECIOUS_METALS]: 5000 },
      salesTaxPct: 10,
    });
    expect(result).toMatchObject({
      status: 'ok',
      slots: [{ p1TypeId: REACTIVE_METALS }],
      iskPerHour: 40 * 900,
    });
  });

  it('breaks a tie on the lower typeId', () => {
    const result = colonyBaseline(
      colony({}),
      pi,
      ONE_ECU,
      books({ [REACTIVE_METALS]: 1000, [PRECIOUS_METALS]: 1000 })
    );
    expect(result).toMatchObject({ slots: [{ p1TypeId: REACTIVE_METALS }] });
  });

  it('takes two P0s at one ECU each over two ECUs on one, when that earns more', () => {
    // At CC5 both fit; 40 + 40 P1/h beats the 72 two ECUs on one P0 make.
    const result = colonyBaseline(
      colony({ cc: 5 }),
      pi,
      POLICY,
      books({ [REACTIVE_METALS]: 1000, [PRECIOUS_METALS]: 1000 })
    );
    if (result.status !== 'ok') throw new Error(result.status);
    expect(result.slots.map((s) => [s.p0TypeId, s.ecus])).toEqual([
      [BASE_METALS, 1],
      [NOBLE_METALS, 1],
    ]);
  });

  it('asks for a price rather than valuing an unpriced P1 at zero', () => {
    expect(colonyBaseline(colony({}), pi, POLICY, books({ [REACTIVE_METALS]: 1000 }))).toEqual({
      status: 'needs-price',
      missing: [PRECIOUS_METALS],
    });
  });

  it('floors at zero: a colony whose best P1 nets below its customs sells nothing', () => {
    // At 100% customs every P1 here costs 400 ISK a unit to export and fetches 100.
    const result = colonyBaseline(
      colony({ taxRate: 1 }),
      pi,
      POLICY,
      books({ [REACTIVE_METALS]: 100, [PRECIOUS_METALS]: 100 })
    );
    expect(result).toEqual({ status: 'ok', slots: [], iskPerHour: 0 });
  });

  it('says when nothing fits', () => {
    // CC0's 6000 MW cannot carry one 10-head ECU (8100 MW).
    expect(
      colonyBaseline(
        colony({ cc: 0 }),
        pi,
        POLICY,
        books({ [REACTIVE_METALS]: 1, [PRECIOUS_METALS]: 1 })
      )
    ).toEqual({ status: 'nothing-fits' });
  });
});

describe('baselineTotal', () => {
  it('taxes each colony at its own customs rate and sums them', () => {
    const prices = books({ [REACTIVE_METALS]: 1000, [PRECIOUS_METALS]: 1000 });
    const untaxed = colony({ planetId: 1, taxRate: 0, rates: { [BASE_METALS]: 6000 } });
    const taxed = colony({ planetId: 2, taxRate: 0.5, rates: { [BASE_METALS]: 6000 } });
    const total = baselineTotal([untaxed, taxed], pi, ONE_ECU, prices);
    expect(total.perColony.get(1)).toMatchObject({ iskPerHour: 40 * 1000 });
    expect(total.perColony.get(2)).toMatchObject({ iskPerHour: 40 * (1000 - 0.5 * 400) });
    expect(total.iskPerHour).toBeCloseTo(40 * 1000 + 40 * 800);
    expect(total.missing).toEqual([]);
  });

  it('collects every missing price across colonies', () => {
    const total = baselineTotal(
      [
        colony({ planetId: 1, rates: { [BASE_METALS]: 6000 } }),
        colony({ planetId: 2, rates: { [NOBLE_METALS]: 6000 } }),
      ],
      pi,
      ONE_ECU,
      books({})
    );
    expect(total.missing).toEqual([REACTIVE_METALS, PRECIOUS_METALS]);
    expect(total.iskPerHour).toBe(0);
  });
});
