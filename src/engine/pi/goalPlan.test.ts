import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import { piTier } from './chain';
import { planGoals, rawOf, schematicOf } from './goalPlan';
import type {
  Goal,
  GoalPlan,
  PlannerColony,
  PlannerPolicy,
  PlanetType,
  PriceBooks,
} from './goalTypes';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const BASE_METALS = 2267;
const AQUEOUS_LIQUIDS = 2268;
const IONIC_SOLUTIONS = 2309;
const REACTIVE_METALS = 2398;
const PRECIOUS_METALS = 2399;
const WATER = 3645;
const COOLANT = 9832;
const WATER_COOLED_CPU = 2328;
const WETWARE_MAINFRAME = 2876;
const ROBOTICS = 9848;

const POLICY: PlannerPolicy = {
  maxEcusPerColony: 2,
  maxP0TypesPerColony: 2,
  extraEcuFactor: 0.8,
  buyTiers: [],
};
const BOOKS: PriceBooks = { ask: {}, bid: {}, salesTaxPct: 0 };

function pricedBooks(overrides: Record<number, number> = {}): PriceBooks {
  const bid: Record<number, number> = {};
  for (const [id, s] of Object.entries(pi.schematics))
    if (s.inputs.length === 1) bid[Number(id)] = 1000;
  Object.assign(bid, overrides);
  return { ask: bid, bid, salesTaxPct: 0 };
}

function colony(planetId: number, planetType: PlanetType, cc = 5, rate = 6000): PlannerColony {
  const row = pi.infrastructure.commandCenterUpgrades[cc];
  return {
    planetId,
    planetType,
    budget: { cpu: row.cpu, powergrid: row.powergrid },
    newLinkCost: { cpu: 15, powergrid: 10 },
    headsPerExtractor: 10,
    taxRate: 0.1,
    ratePerEcu: new Map(
      pi.raw
        .filter((r) => r.planetTypes.includes(planetType))
        .map((r) => [r.typeID, { unitsPerHour: rate, source: 'assumed' as const }])
    ),
    current: { p0TypeIds: [], productTypeIds: [] },
  };
}

function plan(
  goals: Goal[],
  colonies: PlannerColony[],
  policy: PlannerPolicy = POLICY,
  books: PriceBooks = BOOKS
) {
  return planGoals({ goals, colonies, policy, books }, pi);
}

const goal = (typeId: number, perHour: number): Goal => ({ typeId, unitsPerDay: perHour * 24 });

describe('planGoals — demand', () => {
  it('sums a shared input into one line and re-ceils its factories on the total', () => {
    const result = plan(
      [goal(COOLANT, 2.5), goal(WATER_COOLED_CPU, 2.5)],
      [colony(1, 'barren'), colony(2, 'storm'), colony(3, 'gas')]
    );
    const water = result.demand.filter((line) => line.typeId === WATER);
    expect(water).toEqual([expect.objectContaining({ tier: 1, unitsPerHour: 40, factories: 1 })]);
  });

  it('plans nothing for no goals: every colony idle', () => {
    const result = plan([], [colony(2, 'barren'), colony(1, 'lava')]);
    expect(result.demand).toEqual([]);
    expect(result.flows).toEqual([]);
    expect(result.factoryHost).toBeNull();
    expect(result.assignments.map((a) => [a.planetId, a.role])).toEqual([
      [1, 'idle'],
      [2, 'idle'],
    ]);
  });
});

describe('planGoals — factory host', () => {
  it('needs no host for a P1 goal, and ships it straight to the hub', () => {
    const result = plan([goal(REACTIVE_METALS, 40)], [colony(1, 'barren')]);
    expect(result.factoryHost).toBeNull();
    expect(result.assignments[0]).toMatchObject({
      role: 'extract',
      slots: [{ p0TypeId: BASE_METALS, ecus: 1 }],
    });
    expect(result.flows).toEqual([
      { from: 1, to: 'hub', typeId: REACTIVE_METALS, tier: 1, unitsPerHour: 40 },
    ]);
    expect(result.hauling.m3PerWeek).toBeCloseTo(40 * 0.19 * 168);
  });

  it('reports a P4 with no Barren or Temperate colony as a missing High-Tech host', () => {
    const result = plan([goal(WETWARE_MAINFRAME, 1)], [colony(1, 'lava'), colony(2, 'gas')]);
    expect(result.factoryHost).toBeNull();
    expect(result.shortfalls).toContainEqual({ kind: 'no-factory-host', facility: 'highTech' });
    expect(result.demand.find((l) => l.typeId === WETWARE_MAINFRAME)).toMatchObject({
      source: 'blocked',
      madeFraction: 0,
    });
  });

  it('hosts on the colony whose extraction is least needed, not the lowest id', () => {
    const result = plan(
      [goal(COOLANT, 5)],
      [colony(1, 'gas'), colony(2, 'storm'), colony(3, 'temperate')]
    );
    expect(result.factoryHost).toEqual({ planetId: 3, reason: 'least-needed-extraction' });
    expect(result.assignments.find((a) => a.planetId === 3)).toMatchObject({
      role: 'factory',
      slots: [{ p0TypeId: AQUEOUS_LIQUIDS, ecus: 1 }],
      factories: { advanced: 1 },
    });
    expect(result.flows).toContainEqual({
      from: 3,
      to: 3,
      typeId: WATER,
      tier: 1,
      unitsPerHour: 40,
    });
    expect(result.flows).toContainEqual({
      from: 1,
      to: 3,
      typeId: 2390,
      tier: 1,
      unitsPerHour: 40,
    });
    expect(result.flows).toContainEqual({
      from: 3,
      to: 'hub',
      typeId: COOLANT,
      tier: 2,
      unitsPerHour: 5,
    });
  });

  it('breaks a scarcity tie on the smaller Baseline the host gives up', () => {
    const result = plan(
      [goal(COOLANT, 5)],
      [colony(1, 'gas'), colony(4, 'temperate'), colony(5, 'temperate', 5, 3000)],
      POLICY,
      pricedBooks()
    );
    expect(result.factoryHost?.planetId).toBe(5);
  });

  it('breaks an exact host tie on the lower planet id', () => {
    const result = plan(
      [goal(COOLANT, 5)],
      [colony(9, 'gas'), colony(5, 'temperate'), colony(4, 'temperate')]
    );
    expect(result.factoryHost?.planetId).toBe(4);
  });

  it('flags a host whose factories overrun its Command Center', () => {
    const result = plan(
      [goal(COOLANT, 5)],
      [colony(1, 'gas'), colony(2, 'storm'), colony(3, 'temperate', 0)]
    );
    expect(result.shortfalls).toContainEqual(
      expect.objectContaining({ kind: 'host-over-budget', planetId: 3 })
    );
    expect(result.factoryHost).toBeNull();
    expect(result.assignments.every((a) => a.role !== 'extract' && a.role !== 'factory')).toBe(
      true
    );
    expect(result.achieved).toEqual([{ typeId: COOLANT, unitsPerHour: 0, fraction: 0 }]);
    expect(result.flows.filter((f) => f.from === 3 || f.to === 3)).toEqual([]);
    expect(result.demand.find((l) => l.typeId === COOLANT)?.source).toBe('short');
  });
});

describe('planGoals — extraction and shortfalls', () => {
  it('names the planet types that would close a type gap', () => {
    const result = plan([goal(REACTIVE_METALS, 40)], [colony(1, 'temperate')]);
    expect(result.shortfalls).toEqual([
      {
        kind: 'type-gap',
        p0TypeId: BASE_METALS,
        p1TypeId: REACTIVE_METALS,
        unitsPerHour: 6000,
        p1UnitsPerHour: 40,
        fixPlanetTypes: ['barren', 'gas', 'lava', 'plasma', 'storm'],
      },
    ]);
    expect(result.assignments[0].role).toBe('idle');
  });

  it('calls a budget gap when the colonies that could yield it are full', () => {
    const result = plan([goal(REACTIVE_METALS, 120)], [colony(1, 'barren')]);
    expect(result.assignments[0].slots).toMatchObject([{ p0TypeId: BASE_METALS, ecus: 2 }]);
    expect(result.shortfalls).toEqual([
      {
        kind: 'budget-gap',
        p0TypeId: BASE_METALS,
        p1TypeId: REACTIVE_METALS,
        unitsPerHour: expect.closeTo(48 * 150, 6),
        p1UnitsPerHour: expect.closeTo(48, 6),
        retargetCandidates: [],
      },
    ]);
    expect(result.buys).toEqual([]);
  });

  it('buys the short P1 instead when the pilot allows buying P1', () => {
    const result = plan([goal(REACTIVE_METALS, 120)], [colony(1, 'barren')], {
      ...POLICY,
      buyTiers: [1],
    });
    expect(result.shortfalls).toEqual([]);
    expect(result.buys).toEqual([
      { typeId: REACTIVE_METALS, tier: 1, unitsPerHour: expect.closeTo(48, 6) },
    ]);
    expect(result.demand.find((l) => l.typeId === REACTIVE_METALS)?.source).toBe('bought');
  });

  it('gives a colony a second, different P0 before calling anything a budget gap', () => {
    const result = plan(
      [goal(REACTIVE_METALS, 40), goal(PRECIOUS_METALS, 40)],
      [colony(1, 'barren')]
    );
    expect(result.shortfalls).toEqual([]);
    expect(result.assignments[0].slots.map((s) => s.p1TypeId)).toEqual([
      REACTIVE_METALS,
      PRECIOUS_METALS,
    ]);
  });

  it('assigns the scarcest P0 first', () => {
    const result = plan(
      [goal(REACTIVE_METALS, 72), goal(2390, 72)],
      [colony(1, 'gas'), colony(2, 'lava')]
    );
    expect(result.shortfalls).toEqual([]);
    expect(result.assignments.map((a) => a.slots.map((s) => s.p0TypeId))).toEqual([
      [IONIC_SOLUTIONS],
      [BASE_METALS],
    ]);
  });

  it('ships only what the scarcest input allows, and releases extraction nothing consumes', () => {
    const result = plan(
      [goal(COOLANT, 10)],
      [colony(1, 'storm'), colony(2, 'temperate'), colony(3, 'temperate'), colony(4, 'temperate')]
    );
    expect(result.factoryHost?.planetId).toBe(2);
    expect(result.achieved).toEqual([
      { typeId: COOLANT, unitsPerHour: expect.closeTo(9, 6), fraction: expect.closeTo(0.9, 6) },
    ]);
    expect(result.flows).toContainEqual({
      from: 2,
      to: 'hub',
      typeId: COOLANT,
      tier: 2,
      unitsPerHour: expect.closeTo(9, 6),
    });
    const waterToHost = result.flows
      .filter((f) => f.typeId === WATER && f.to === 2)
      .reduce((sum, f) => sum + f.unitsPerHour, 0);
    expect(waterToHost).toBeCloseTo(72);
    expect(result.surplusP1).toEqual([{ typeId: WATER, unitsPerHour: expect.closeTo(8, 6) }]);
    expect(result.assignments.find((a) => a.planetId === 4)?.role).toBe('idle');
    expect(result.shortfalls).toEqual([
      expect.objectContaining({ kind: 'budget-gap', p0TypeId: IONIC_SOLUTIONS }),
    ]);
  });

  it('retargets nothing for a goal that reaches zero: every colony keeps its Baseline', () => {
    const books = pricedBooks();
    const result = plan(
      [goal(COOLANT, 5)],
      [colony(1, 'temperate'), colony(2, 'temperate')],
      POLICY,
      books
    );
    expect(result.achieved).toEqual([{ typeId: COOLANT, unitsPerHour: 0, fraction: 0 }]);
    expect(result.shortfalls).toEqual([expect.objectContaining({ kind: 'type-gap' })]);
    expect(result.factoryHost).toBeNull();
    expect(result.assignments.map((a) => a.role)).toEqual(['baseline', 'baseline']);
  });

  it('keeps a colony the plan does not need on its Baseline, selling it', () => {
    const result = plan([], [colony(1, 'barren')], POLICY, pricedBooks({ 2399: 5000 }));
    expect(result.assignments[0]).toMatchObject({
      role: 'baseline',
      slots: [{ p1TypeId: PRECIOUS_METALS, ecus: 2 }],
    });
    expect(result.flows).toEqual([
      { from: 1, to: 'hub', typeId: PRECIOUS_METALS, tier: 1, unitsPerHour: 72 },
    ]);
  });

  it('fills a used colony’s spare slot with its best-selling P1', () => {
    const result = plan(
      [goal(REACTIVE_METALS, 40)],
      [colony(1, 'barren')],
      POLICY,
      pricedBooks({ 2399: 5000 })
    );
    expect(result.assignments[0].slots.map((s) => [s.p1TypeId, s.ecus])).toEqual([
      [REACTIVE_METALS, 1],
      [PRECIOUS_METALS, 1],
    ]);
    expect(result.flows).toContainEqual({
      from: 1,
      to: 'hub',
      typeId: PRECIOUS_METALS,
      tier: 1,
      unitsPerHour: 40,
    });
  });

  it('sells whole-ECU overshoot as surplus P1', () => {
    const result = plan([goal(REACTIVE_METALS, 30)], [colony(1, 'barren')]);
    expect(result.surplusP1).toEqual([{ typeId: REACTIVE_METALS, unitsPerHour: 10 }]);
  });
});

function fixtureColonies(): PlannerColony[] {
  const OWN_MEAN = 12_033;
  const make = (
    planetId: number,
    planetType: PlanetType,
    cc: number,
    link: { cpu: number; powergrid: number },
    heads: number,
    taxRate: number,
    measured: Record<number, number>,
    ecus: Record<number, number>
  ): PlannerColony => {
    const row = pi.infrastructure.commandCenterUpgrades[cc];
    return {
      planetId,
      planetType,
      budget: { cpu: row.cpu, powergrid: row.powergrid },
      newLinkCost: link,
      headsPerExtractor: heads,
      taxRate,
      ratePerEcu: new Map(
        pi.raw
          .filter((r) => r.planetTypes.includes(planetType))
          .map((r) => [
            r.typeID,
            measured[r.typeID] !== undefined
              ? { unitsPerHour: measured[r.typeID], source: 'measured' as const }
              : { unitsPerHour: OWN_MEAN, source: 'own-mean' as const },
          ])
      ),
      current: {
        p0TypeIds: Object.keys(ecus).map(Number),
        productTypeIds: [],
        ecusByP0: new Map(Object.entries(ecus).map(([k, v]) => [Number(k), v])),
      },
    };
  };
  return [
    make(
      40009077,
      'barren',
      4,
      { cpu: 73.7, powergrid: 54.0 },
      8,
      0.06,
      { [BASE_METALS]: 12_133 },
      { [BASE_METALS]: 2 }
    ),
    make(
      40009080,
      'temperate',
      4,
      { cpu: 152.1, powergrid: 112.8 },
      9,
      0.06,
      { [AQUEOUS_LIQUIDS]: 11_637 },
      { [AQUEOUS_LIQUIDS]: 1 }
    ),
    make(
      40009082,
      'gas',
      5,
      { cpu: 553.4, powergrid: 413.8 },
      7,
      0.06,
      { [IONIC_SOLUTIONS]: 11_637, 2310: 12_629 },
      { [IONIC_SOLUTIONS]: 1, 2310: 1 }
    ),
    make(40000005, 'oceanic', 3, { cpu: 131.6, powergrid: 97.5 }, 8, 0, {}, {}),
  ];
}

function fixtureBooks(): PriceBooks {
  const unit = [5, 760, 14_000, 100_000, 1_900_000];
  const ask: Record<number, number> = {};
  const bid: Record<number, number> = {};
  for (const id of [...Object.keys(pi.schematics).map(Number), ...pi.raw.map((r) => r.typeID)]) {
    ask[id] = unit[piTier(id, pi)];
    bid[id] = ask[id] * 0.95;
  }
  return { ask, bid, salesTaxPct: 3.6 };
}

describe('planGoals — the plan describes itself consistently', () => {
  it('reports no budget gap for a goal a type gap already blocks (e2e fixture, Coolant + Robotics)', () => {
    const result = plan(
      [
        { typeId: COOLANT, unitsPerDay: 200 },
        { typeId: ROBOTICS, unitsPerDay: 30 },
      ],
      fixtureColonies(),
      POLICY,
      fixtureBooks()
    );
    expect(result.shortfalls.map((s) => [s.kind, 'p0TypeId' in s ? s.p0TypeId : null])).toEqual([
      ['type-gap', 2272],
      ['type-gap', 2306],
    ]);
    expect(result.achieved).toEqual([
      {
        typeId: COOLANT,
        unitsPerHour: expect.closeTo(200 / 24, 6),
        fraction: expect.closeTo(1, 6),
      },
      { typeId: ROBOTICS, unitsPerHour: 0, fraction: 0 },
    ]);
    const blocked = result.demand.filter((l) => l.source === 'blocked');
    expect(blocked.map((l) => l.typeId)).toEqual(
      expect.arrayContaining([ROBOTICS, 9836, 3689, 2398, 2399, 2400, 2401, BASE_METALS])
    );
    expect(blocked.every((l) => l.madeFraction === 0)).toBe(true);
    expect(blocked.find((l) => l.typeId === ROBOTICS)).toMatchObject({
      tier: 3,
      unitsPerHour: expect.closeTo(30 / 24, 6),
    });
    expect(result.demand.filter((l) => l.typeId === COOLANT)).toEqual([
      expect.objectContaining({ source: 'made', madeFraction: expect.closeTo(1, 6) }),
    ]);
    const extracted = result.assignments
      .filter((a) => a.role === 'extract' || a.role === 'factory')
      .flatMap((a) => a.slots.map((s) => s.p0TypeId));
    expect(extracted).not.toContain(BASE_METALS);
  });

  it('never calls a rationed input a budget gap while a colony could yield more of it', () => {
    const result = plan(
      [goal(COOLANT, 10)],
      [colony(1, 'storm'), colony(2, 'temperate'), colony(3, 'temperate'), colony(4, 'temperate')]
    );
    expect(result.shortfalls).toEqual([
      {
        kind: 'budget-gap',
        p0TypeId: IONIC_SOLUTIONS,
        p1TypeId: 2390,
        unitsPerHour: expect.closeTo(8 * 150, 6),
        p1UnitsPerHour: expect.closeTo(8, 6),
        retargetCandidates: [],
      },
    ]);
    const line = (id: number) => result.demand.find((l) => l.typeId === id)!;
    expect(line(2390)).toMatchObject({ source: 'short', madeFraction: expect.closeTo(0.9, 6) });
    expect(line(WATER)).toMatchObject({ source: 'made', madeFraction: expect.closeTo(0.9, 6) });
    expect(line(COOLANT)).toMatchObject({ source: 'short', madeFraction: expect.closeTo(0.9, 6) });
  });

  it('labels the P0 under a bought P1 as not extracted, and a part-bought line by its made share', () => {
    const allBought = plan([goal(REACTIVE_METALS, 40)], [colony(1, 'temperate')], {
      ...POLICY,
      buyTiers: [1],
    });
    const line = (r: GoalPlan, id: number) => r.demand.find((l) => l.typeId === id)!;
    expect(line(allBought, BASE_METALS)).toMatchObject({
      source: 'not-extracted',
      madeFraction: 0,
    });
    expect(line(allBought, REACTIVE_METALS)).toMatchObject({ source: 'bought', madeFraction: 0 });

    const partBought = plan([goal(REACTIVE_METALS, 120)], [colony(1, 'barren')], {
      ...POLICY,
      buyTiers: [1],
    });
    expect(line(partBought, REACTIVE_METALS)).toMatchObject({
      source: 'bought',
      madeFraction: expect.closeTo(0.6, 6),
    });
    expect(line(partBought, BASE_METALS)).toMatchObject({
      source: 'extracted',
      madeFraction: expect.closeTo(0.6, 6),
    });
  });
});

describe('planGoals — the layout a colony runs today', () => {
  it("marks an assignment on today's extraction as runningToday, even where the model puts it over budget", () => {
    const jita: PlannerColony = {
      ...colony(1, 'barren', 4, 12_133),
      headsPerExtractor: 8,
      newLinkCost: { cpu: 74, powergrid: 54 },
      current: {
        p0TypeIds: [BASE_METALS],
        productTypeIds: [],
        ecusByP0: new Map([[BASE_METALS, 2]]),
      },
    };
    const result = plan([goal(REACTIVE_METALS, 140)], [jita]);
    const [assignment] = result.assignments;
    expect(assignment).toMatchObject({ role: 'extract', runningToday: true });
    expect(assignment.used.powergrid).toBeGreaterThan(assignment.budget.powergrid);
  });

  it('leaves runningToday off a layout the colony does not run', () => {
    const result = plan([goal(REACTIVE_METALS, 40)], [colony(1, 'barren')]);
    expect(result.assignments[0].runningToday).toBeUndefined();
  });
});

describe('planGoals — stability against what colonies run today', () => {
  it('keeps Water on the colony that extracts it today rather than starting it elsewhere', () => {
    const result = plan([goal(WATER, 40)], fixtureColonies(), POLICY, fixtureBooks());
    const role = (id: number) => result.assignments.find((a) => a.planetId === id)!;
    expect(role(40009080)).toMatchObject({
      role: 'extract',
      slots: [expect.objectContaining({ p0TypeId: AQUEOUS_LIQUIDS, rateSource: 'measured' })],
    });
    expect(role(40000005).role).not.toBe('extract');
  });

  it('prefers a measured rate over an estimate when neither colony runs the P0', () => {
    const base = colony(1, 'barren');
    const measured: PlannerColony = {
      ...base,
      ratePerEcu: new Map([
        ...base.ratePerEcu,
        [BASE_METALS, { unitsPerHour: 5_000, source: 'measured' as const }],
      ]),
    };
    const estimated = colony(2, 'barren');
    const result = plan([goal(REACTIVE_METALS, 30)], [estimated, measured].reverse());
    expect(result.assignments.find((a) => a.role === 'extract')?.planetId).toBe(1);
  });
});

describe('planGoals — what a gap can be fixed with', () => {
  it('names the colonies a budget gap could retarget, leaving out ones already maxed on that P0', () => {
    const result = plan(
      [goal(PRECIOUS_METALS, 72), goal(REACTIVE_METALS, 144)],
      [colony(1, 'barren'), colony(2, 'gas')]
    );
    expect(result.shortfalls).toEqual([
      expect.objectContaining({
        kind: 'budget-gap',
        p0TypeId: BASE_METALS,
        retargetCandidates: [1],
      }),
    ]);
  });

  it('ties each blocked line to the type gaps that block its goal', () => {
    const result = plan(
      [
        { typeId: COOLANT, unitsPerDay: 200 },
        { typeId: ROBOTICS, unitsPerDay: 30 },
      ],
      fixtureColonies(),
      POLICY,
      fixtureBooks()
    );
    const blocked = result.demand.filter((l) => l.source === 'blocked');
    expect(blocked.length).toBeGreaterThan(0);
    for (const line of blocked) expect(line.blockedBy).toEqual([2272, 2306]);
    expect(result.demand.filter((l) => l.source !== 'blocked').every((l) => !l.blockedBy)).toBe(
      true
    );
  });
});

describe('SDE lookups', () => {
  it('name the type id when the data has no entry for it', () => {
    expect(schematicOf(COOLANT, pi).name).toBe('Coolant');
    expect(rawOf(BASE_METALS, pi).typeID).toBe(BASE_METALS);
    expect(() => schematicOf(34, pi)).toThrow('pi.json has no planetary schematic for type 34');
    expect(() => rawOf(34, pi)).toThrow('pi.json has no P0 resource for type 34');
  });
});
