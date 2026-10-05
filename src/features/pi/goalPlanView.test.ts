import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import type {
  ColonyAssignment,
  ExtractionSlot,
  GoalPlan,
  PlannerColony,
} from '@/engine/pi/goalTypes';
import type { ColonyChange } from '@/engine/pi/planDiff';
import type { PlannerColonyRow } from './goalPlannerModel';
import { changeSteps, goalAttainment, planCaveats, shortfallHint } from './goalPlanView';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const BASE_METALS = 2267;
const REACTIVE_METALS = 2398;
const AQUEOUS = 2268;
const WATER = 3645;
const IONIC = 2309;
const NOBLE_GAS = 2310;
const ELECTROLYTES = 2390;
const COOLANT = 9832;
const ROBOTICS = 9848;

function slot(
  p0: number,
  p1: number,
  source: ExtractionSlot['rateSource'] = 'measured'
): ExtractionSlot {
  return {
    p0TypeId: p0,
    p1TypeId: p1,
    ecus: 1,
    p0PerHour: 6000,
    p1PerHour: 40,
    basicFactories: 1,
    rateSource: source,
  };
}

function assignment(
  planetId: number,
  role: ColonyAssignment['role'],
  slots: ExtractionSlot[] = []
): ColonyAssignment {
  return {
    planetId,
    role,
    slots,
    factories: role === 'factory' ? { advanced: 2 } : {},
    pins: {},
    used: { cpu: 0, powergrid: 0 },
    budget: { cpu: 1, powergrid: 1 },
    limitedBy: [],
  };
}

function row(
  planetId: number,
  planetType: PlannerColonyRow['planetType'],
  overrides: Partial<PlannerColonyRow> = {},
  p0s: number[] = []
): PlannerColonyRow {
  const colony: PlannerColony = {
    planetId,
    planetType,
    budget: { cpu: 1, powergrid: 1 },
    newLinkCost: { cpu: 0, powergrid: 0 },
    headsPerExtractor: 8,
    taxRate: 0.1,
    ratePerEcu: new Map(
      pi.raw
        .filter((r) => r.planetTypes.includes(planetType))
        .map((r) => [r.typeID, { unitsPerHour: 6000, source: 'measured' as const }])
    ),
    current: { p0TypeIds: p0s, productTypeIds: [] },
  };
  return {
    planetId,
    systemId: 1,
    upgradeLevel: 4,
    planetType,
    enabled: true,
    colony,
    excluded: null,
    advice: null,
    taxRate: 0.1,
    taxSource: { kind: 'highsec-skill', level: 0 },
    taxOverridden: false,
    rateUnknown: false,
    taxAssumed: false,
    headsAssumed: false,
    linkCostBorrowed: false,
    ...overrides,
  };
}

describe('goalAttainment', () => {
  it('counts goals met and names the unmet ones with their fraction', () => {
    expect(
      goalAttainment([
        { typeId: COOLANT, unitsPerHour: 8, fraction: 1 },
        { typeId: ROBOTICS, unitsPerHour: 0, fraction: 0 },
      ])
    ).toEqual({ met: 1, total: 2, unmet: [{ typeId: ROBOTICS, fraction: 0 }] });
  });

  it('treats float dust under one as met', () => {
    expect(goalAttainment([{ typeId: COOLANT, unitsPerHour: 8, fraction: 0.99999 }]).unmet).toEqual(
      []
    );
  });
});

describe('planCaveats', () => {
  it('names colonies whose planned rate is an estimate, and enabled colonies on an assumed customs rate', () => {
    const rows = [
      row(1, 'barren'),
      row(2, 'gas', { rateUnknown: true, taxAssumed: true }),
      row(3, 'temperate', { enabled: false, rateUnknown: true, taxAssumed: true }),
    ];
    const caveats = planCaveats(
      [
        assignment(1, 'extract', [slot(BASE_METALS, REACTIVE_METALS, 'own-mean')]),
        assignment(2, 'extract', [slot(IONIC, ELECTROLYTES)]),
      ],
      rows
    );
    expect(caveats).toEqual({ estimatedRates: [1], assumedCustoms: [2] });
  });
});

describe('changeSteps', () => {
  const plan = {
    assignments: [
      assignment(1, 'extract', [slot(IONIC, ELECTROLYTES)]),
      assignment(2, 'factory', [slot(AQUEOUS, WATER)]),
      assignment(3, 'baseline', [slot(BASE_METALS, REACTIVE_METALS)]),
    ],
    demand: [
      { typeId: COOLANT, tier: 2, unitsPerHour: 8, factories: 2, source: 'made' },
      { typeId: ELECTROLYTES, tier: 1, unitsPerHour: 40, factories: 1, source: 'made' },
    ],
    flows: [
      { from: 1, to: 2, typeId: ELECTROLYTES, tier: 1, unitsPerHour: 40 },
      { from: 2, to: 2, typeId: WATER, tier: 1, unitsPerHour: 40 },
      { from: 2, to: 'hub', typeId: COOLANT, tier: 2, unitsPerHour: 8 },
      { from: 3, to: 'hub', typeId: REACTIVE_METALS, tier: 1, unitsPerHour: 40 },
    ],
    factoryHost: { planetId: 2, reason: 'best-net' },
  } as unknown as GoalPlan;

  it('says what each colony sets up and where its output ships', () => {
    const changes: ColonyChange[] = [
      { verb: 'retarget', planetId: 1, from: [IONIC, NOBLE_GAS], to: [IONIC] },
      { verb: 'convert-to-factory', planetId: 2, from: [], factories: { advanced: 2 } },
      { verb: 'keep', planetId: 3, p0TypeIds: [BASE_METALS], notNeeded: true },
    ];
    const rows = [
      row(1, 'gas', {}, [IONIC, NOBLE_GAS]),
      row(2, 'oceanic'),
      row(3, 'barren', {}, [BASE_METALS]),
    ];
    const steps = changeSteps(plan, changes, rows);

    expect(steps[0]).toMatchObject({
      planetId: 1,
      kind: 'stop',
      stop: [NOBLE_GAS],
      extract: [{ p0TypeId: IONIC, p1TypeId: ELECTROLYTES, ecus: 1, basicFactories: 1 }],
      ships: [{ typeId: ELECTROLYTES, to: 2 }],
    });
    expect(steps[1]).toMatchObject({
      planetId: 2,
      kind: 'host',
      factories: [{ typeId: COOLANT, count: 2 }],
      extract: [{ p0TypeId: AQUEOUS }],
      ships: [{ typeId: COOLANT, to: 'hub' }],
    });
    // Already running what its Baseline sells: as is.
    expect(steps[2]).toMatchObject({ planetId: 3, kind: 'as-is', switchTo: [] });
  });

  it('starts a colony that extracts nothing today, and adds beside what it keeps', () => {
    const steps = changeSteps(
      plan,
      [
        { verb: 'retarget', planetId: 1, from: [], to: [IONIC] },
        { verb: 'add-extractor', planetId: 3, keep: [BASE_METALS], add: [AQUEOUS] },
      ],
      [row(1, 'gas'), row(3, 'barren', {}, [BASE_METALS])]
    );
    expect(steps.map((s) => s.kind)).toEqual(['start', 'add']);
  });

  it('tells a not-needed colony to switch when its best P1 is not what it runs today', () => {
    const steps = changeSteps(
      plan,
      [{ verb: 'keep', planetId: 3, p0TypeIds: [AQUEOUS], notNeeded: true }],
      [row(3, 'barren', {}, [AQUEOUS])]
    );
    expect(steps[0]).toMatchObject({ kind: 'as-is', switchTo: [REACTIVE_METALS] });
  });
});

describe('shortfallHint', () => {
  it('points at a switched-off colony that would cover a type gap', () => {
    const rows = [row(1, 'barren'), row(5, 'lava', { enabled: false })];
    expect(
      shortfallHint(
        {
          kind: 'type-gap',
          p0TypeId: 2306,
          p1TypeId: 2401,
          unitsPerHour: 1,
          p1UnitsPerHour: 1 / 150,
          fixPlanetTypes: ['lava', 'plasma'],
        },
        rows,
        false
      )
    ).toEqual({ kind: 'switched-off', planetIds: [5] });
  });

  it('with buying off, suggests re-targeting a named colony that can yield the P0', () => {
    const rows = [row(1, 'barren'), row(2, 'gas'), row(3, 'temperate')];
    expect(
      shortfallHint(
        {
          kind: 'budget-gap',
          p0TypeId: BASE_METALS,
          p1TypeId: REACTIVE_METALS,
          unitsPerHour: 5000,
          p1UnitsPerHour: 5000 / 150,
          retargetCandidates: [1, 2],
        },
        rows,
        false
      )
    ).toEqual({ kind: 'retarget', planetIds: [1, 2] });
    expect(
      shortfallHint(
        {
          kind: 'budget-gap',
          p0TypeId: BASE_METALS,
          p1TypeId: REACTIVE_METALS,
          unitsPerHour: 5000,
          p1UnitsPerHour: 5000 / 150,
          retargetCandidates: [1, 2],
        },
        rows,
        true
      )
    ).toEqual({ kind: 'buy' });
  });
});
