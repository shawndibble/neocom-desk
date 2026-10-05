import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import {
  bestSingleSlotFit,
  colonyExtraction,
  extractionOptions,
  fitPlannedPins,
  p1ForP0,
} from './colonyCapacity';
import type { PlannerColony, PlannerPolicy, PlanetType } from './goalTypes';
import { pinsLoad } from './pinBudget';

// The real snapshot, as pinBudget.test.ts reads it: the fits below are claims
// about the shipped pin costs and Command Center table.
const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const MICROORGANISMS = 2073;
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

function ccLevel(level: number) {
  const row = pi.infrastructure.commandCenterUpgrades[level];
  return { cpu: row.cpu, powergrid: row.powergrid };
}

function colony(opts: {
  planetType?: PlanetType;
  cc?: number;
  heads?: number;
  rates?: Record<number, number>;
  link?: { cpu: number; powergrid: number };
}): PlannerColony {
  const rates = opts.rates ?? { [BASE_METALS]: 6000, [NOBLE_METALS]: 6000 };
  return {
    planetId: 1,
    planetType: opts.planetType ?? 'barren',
    budget: ccLevel(opts.cc ?? 5),
    newLinkCost: opts.link ?? { cpu: 15, powergrid: 10 },
    headsPerExtractor: opts.heads ?? 10,
    taxRate: 0.1,
    ratePerEcu: new Map(
      Object.entries(rates).map(([id, unitsPerHour]) => [
        Number(id),
        { unitsPerHour, source: 'assumed' as const },
      ])
    ),
    current: { p0TypeIds: [], productTypeIds: [] },
  };
}

describe('p1ForP0', () => {
  it('finds the basic schematic whose single input is the P0', () => {
    expect(p1ForP0(BASE_METALS, pi)).toBe(REACTIVE_METALS);
    expect(p1ForP0(NOBLE_METALS, pi)).toBe(PRECIOUS_METALS);
  });
});

describe('colonyExtraction', () => {
  it('fits two 10-head ECUs at CC5 but only one at CC4', () => {
    const want = [{ p0TypeId: BASE_METALS, ecus: 2 }];
    const high = colonyExtraction(colony({ cc: 5 }), want, pi, POLICY);
    expect(high.status).toBe('fits');

    const low = colonyExtraction(colony({ cc: 4 }), want, pi, POLICY);
    expect(low).toMatchObject({ status: 'does-not-fit', limitedBy: ['powergrid'] });

    expect(bestSingleSlotFit(colony({ cc: 4 }), BASE_METALS, pi, POLICY)?.slots).toMatchObject([
      { p0TypeId: BASE_METALS, ecus: 1 },
    ]);
    expect(bestSingleSlotFit(colony({ cc: 5 }), BASE_METALS, pi, POLICY)?.slots).toMatchObject([
      { p0TypeId: BASE_METALS, ecus: 2 },
    ]);
  });

  it('credits a second ECU on the same P0 at the extra-ECU factor, sizing basics off the schematic', () => {
    const one = colonyExtraction(colony({}), [{ p0TypeId: BASE_METALS, ecus: 1 }], pi, POLICY);
    if (one.status !== 'fits') throw new Error(one.status);
    // 3000 P0 per 1800 s cycle is exactly 6000/h, so one ECU at 6000/h is one basic.
    expect(one.slots).toEqual([
      {
        p0TypeId: BASE_METALS,
        p1TypeId: REACTIVE_METALS,
        ecus: 1,
        p0PerHour: 6000,
        p1PerHour: 40,
        basicFactories: 1,
        rateSource: 'assumed',
      },
    ]);

    const two = colonyExtraction(colony({}), [{ p0TypeId: BASE_METALS, ecus: 2 }], pi, POLICY);
    if (two.status !== 'fits') throw new Error(two.status);
    expect(two.slots[0]).toMatchObject({ p0PerHour: 10_800, p1PerHour: 72, basicFactories: 2 });
    expect(two.pins).toEqual({ extractorControlUnit: 2, basic: 2, launchpad: 1 });
  });

  it('fits two different P0s together on one colony', () => {
    const result = colonyExtraction(
      colony({ cc: 4, heads: 4 }),
      [
        { p0TypeId: NOBLE_METALS, ecus: 1 },
        { p0TypeId: BASE_METALS, ecus: 1 },
      ],
      pi,
      POLICY
    );
    if (result.status !== 'fits') throw new Error(result.status);
    // Sorted by P0 so the answer does not depend on the caller's order.
    expect(result.slots.map((s) => s.p1TypeId)).toEqual([REACTIVE_METALS, PRECIOUS_METALS]);
    expect(result.pins).toEqual({ extractorControlUnit: 2, basic: 2, launchpad: 1 });
  });

  it('charges one link per planned pin except the launchpad', () => {
    const pins = { extractorControlUnit: 1, basic: 1, launchpad: 1 };
    const bare = pinsLoad(pins, pi.infrastructure, { extractorHeads: 10 });
    const want = [{ p0TypeId: BASE_METALS, ecus: 1 }];

    const exact = { ...colony({ link: { cpu: 0, powergrid: 0 } }), budget: bare };
    expect(colonyExtraction(exact, want, pi, POLICY).status).toBe('fits');

    const linked = { ...colony({ link: { cpu: 1, powergrid: 1 } }), budget: bare };
    const refused = colonyExtraction(linked, want, pi, POLICY);
    expect(refused).toMatchObject({
      status: 'does-not-fit',
      used: { cpu: bare.cpu + 2, powergrid: bare.powergrid + 2 },
    });
  });

  it('fits extraction beside fixed factory pins on the same Command Center', () => {
    const want = [{ p0TypeId: BASE_METALS, ecus: 1 }];
    const withFactory = colonyExtraction(colony({ cc: 4 }), want, pi, POLICY, { advanced: 2 });
    if (withFactory.status !== 'fits') throw new Error(withFactory.status);
    expect(withFactory.pins).toEqual({
      advanced: 2,
      extractorControlUnit: 1,
      basic: 1,
      launchpad: 1,
    });

    // Exactly the extraction alone; two factories more no longer fit.
    const bare = colonyExtraction(
      colony({ cc: 4, link: { cpu: 0, powergrid: 0 } }),
      want,
      pi,
      POLICY
    );
    if (bare.status !== 'fits') throw new Error(bare.status);
    const tight = { ...colony({ cc: 4, link: { cpu: 0, powergrid: 0 } }), budget: bare.used };
    expect(colonyExtraction(tight, want, pi, POLICY, { advanced: 2 }).status).toBe('does-not-fit');

    // No extraction at all still fits the factories against the budget.
    expect(colonyExtraction(colony({ cc: 4 }), [], pi, POLICY, { advanced: 2 })).toMatchObject({
      status: 'fits',
      slots: [],
      pins: { advanced: 2, launchpad: 1 },
    });
  });

  it('accepts the extraction a colony runs today even where the model would not fit it', () => {
    // The e2e fixture's Jita I: CC4, two 8-head ECUs on Base Metals at ~12,000/h
    // each. Refined on the spot that is four basics, and the model puts it at
    // ~18,200 MW against 17,000 — yet the colony runs those two ECUs today.
    const jita = {
      ...colony({
        cc: 4,
        heads: 8,
        rates: { [BASE_METALS]: 12_133 },
        link: { cpu: 74, powergrid: 54 },
      }),
    };
    const want = [{ p0TypeId: BASE_METALS, ecus: 2 }];
    expect(colonyExtraction(jita, want, pi, POLICY).status).toBe('does-not-fit');

    const running = {
      ...jita,
      current: {
        p0TypeIds: [BASE_METALS],
        productTypeIds: [],
        ecusByP0: new Map([[BASE_METALS, 2]]),
      },
    };
    expect(colonyExtraction(running, want, pi, POLICY)).toMatchObject({
      status: 'fits',
      runningToday: true,
    });
    // A subset of today's layout is accepted too; anything beyond it is fitted as usual.
    expect(colonyExtraction(running, [{ p0TypeId: BASE_METALS, ecus: 1 }], pi, POLICY).status).toBe(
      'fits'
    );
    // Factory pins on top of today's layout are new load, so the model decides.
    expect(colonyExtraction(running, want, pi, POLICY, { advanced: 1 }).status).toBe(
      'does-not-fit'
    );
  });

  it('refuses a P0 the planet cannot yield', () => {
    const result = colonyExtraction(
      colony({ planetType: 'lava' }),
      [
        { p0TypeId: MICROORGANISMS, ecus: 1 },
        { p0TypeId: BASE_METALS, ecus: 1 },
      ],
      pi,
      POLICY
    );
    expect(result).toEqual({ status: 'not-extractable', p0TypeIds: [MICROORGANISMS] });
  });

  it('refuses more ECUs or P0 types than the policy allows', () => {
    expect(
      colonyExtraction(colony({}), [{ p0TypeId: BASE_METALS, ecus: 3 }], pi, POLICY).status
    ).toBe('over-policy');
    expect(
      colonyExtraction(
        colony({ heads: 2 }),
        [
          { p0TypeId: BASE_METALS, ecus: 1 },
          { p0TypeId: NOBLE_METALS, ecus: 1 },
        ],
        pi,
        { ...POLICY, maxP0TypesPerColony: 1 }
      ).status
    ).toBe('over-policy');
  });
});

describe('extractionOptions', () => {
  it('lists every fitting single- and two-P0 option', () => {
    const options = extractionOptions(colony({ cc: 5 }), pi, POLICY);
    const keys = options.map((o) => o.slots.map((s) => `${s.p0TypeId}x${s.ecus}`).join('+'));
    expect(keys).toEqual([
      `${BASE_METALS}x1`,
      `${BASE_METALS}x2`,
      `${NOBLE_METALS}x1`,
      `${NOBLE_METALS}x2`,
      `${BASE_METALS}x1+${NOBLE_METALS}x1`,
    ]);
    expect(extractionOptions(colony({ cc: 4 }), pi, POLICY)).toHaveLength(2);
  });
});

describe('fitPlannedPins', () => {
  it('adds the launchpad and links to production pins and names the binding axis', () => {
    const fit = fitPlannedPins(colony({ cc: 0 }), { highTech: 1, advanced: 4 }, 0, pi);
    expect(fit.pins).toEqual({ highTech: 1, advanced: 4, launchpad: 1 });
    expect(fit.fits).toBe(false);
    expect(fit.limitedBy).toEqual(['cpu']);
  });
});
