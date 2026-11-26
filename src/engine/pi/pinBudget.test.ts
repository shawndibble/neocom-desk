import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData, PiInfrastructure, PiPinKind } from '@/sde/types';
import { piTier } from './chain';
import {
  EXTRACTOR_HEADS_MAX,
  chainBlockPins,
  checkThroughput,
  fitColony,
  pinsLoad,
  planColony,
  singleFactoryChain,
  singleFactoryRate,
  spareCapacity,
  type CheckThroughputOptions,
} from './pinBudget';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const TEST_CULTURES = 2319;
const BROADCAST_NODE = 2867;

const FIXTURE_INFRASTRUCTURE: PiInfrastructure = {
  pins: {
    extractorControlUnit: { cpu: 400, powergrid: 2_600, capacity: 0 },
    basic: { cpu: 200, powergrid: 800, capacity: 0 },
    advanced: { cpu: 500, powergrid: 700, capacity: 0 },
    highTech: { cpu: 1_100, powergrid: 400, capacity: 0 },
    storage: { cpu: 500, powergrid: 700, capacity: 12_000 },
    launchpad: { cpu: 3_600, powergrid: 700, capacity: 10_000 },
  },
  pinKindByTypeId: {
    3068: 'extractorControlUnit',
    2481: 'basic',
    2480: 'advanced',
    2482: 'highTech',
    2562: 'storage',
    2256: 'launchpad',
  },
  commandCenterTypeIds: [2254, 2524],
  extractorHead: { cpu: 110, powergrid: 550 },
  link: {
    cpu: 15,
    powergrid: 10,
    cpuPerKm: 0.2,
    powergridPerKm: 0.15,
    cpuLevelModifier: 1.4,
    powergridLevelModifier: 1.2,
  },
  commandCenterUpgrades: [
    { level: 0, cpu: 1_675, powergrid: 6_000 },
    { level: 1, cpu: 7_057, powergrid: 9_000 },
    { level: 2, cpu: 12_136, powergrid: 12_000 },
    { level: 3, cpu: 17_215, powergrid: 15_000 },
    { level: 4, cpu: 21_315, powergrid: 17_000 },
    { level: 5, cpu: 25_415, powergrid: 19_000 },
  ],
};

const LEVEL_4 = { cpu: 21_315, powergrid: 17_000 };
const LEVEL_5 = { cpu: 25_415, powergrid: 19_000 };

const FREE_BASIC_INFRASTRUCTURE: PiInfrastructure = {
  ...FIXTURE_INFRASTRUCTURE,
  pins: { ...FIXTURE_INFRASTRUCTURE.pins, basic: { cpu: 0, powergrid: 0, capacity: 0 } },
};

describe('singleFactoryRate', () => {
  it('reads one factory’s hourly output off the schematic, not a tier table', () => {
    expect(singleFactoryRate(TEST_CULTURES, pi)).toBe(5);
    expect(singleFactoryRate(BROADCAST_NODE, pi)).toBe(1);
  });

  it('has no rate for a P0 resource, which no factory makes', () => {
    const microorganisms = pi.raw.find((r) => r.name === 'Microorganisms');
    expect(microorganisms).toBeDefined();
    expect(singleFactoryRate(microorganisms!.typeID, pi)).toBeNull();
  });
});

describe('chainBlockPins', () => {
  const block = singleFactoryChain(TEST_CULTURES, pi);

  it('sizes a ratio block off one target factory, not an arbitrary rate', () => {
    expect(block?.targetPerHour).toBe(5);
    const p1Pins = block!.nodes.filter((n) => n.tier === 1).map((n) => n.factoryPins);
    expect(p1Pins).toEqual([1, 1]);
  });

  it('groups factory pins by the facility the SDE says runs them', () => {
    const result = chainBlockPins(block!, pi, { sourcingFloor: 'P1' });
    expect(result).toEqual({ status: 'sized', pins: { advanced: 1 } });
  });

  it('adds one ECU per P0 type on the P0 floor', () => {
    const result = chainBlockPins(block!, pi, {
      sourcingFloor: 'P0',
      extractionRatePerHour: 6_000,
    });
    expect(result).toEqual({
      status: 'sized',
      pins: { advanced: 1, basic: 2, extractorControlUnit: 2 },
    });
  });

  it('needs two ECUs per P0 type when one program only half covers it', () => {
    const result = chainBlockPins(block!, pi, {
      sourcingFloor: 'P0',
      extractionRatePerHour: 3_000,
    });
    expect(result).toEqual({
      status: 'sized',
      pins: { advanced: 1, basic: 2, extractorControlUnit: 4 },
    });
  });

  it('declines rather than guessing when the P0 floor has no measured rate', () => {
    const result = chainBlockPins(block!, pi, {
      sourcingFloor: 'P0',
      extractionRatePerHour: null,
    });
    expect(result.status).toBe('needs-extraction-rate');
    if (result.status !== 'needs-extraction-rate') throw new Error('unreachable');
    expect(result.p0PerHour.map((line) => line.unitsPerHour)).toEqual([6_000, 6_000]);
  });

  it('puts a P4 target in a High-Tech Production Plant', () => {
    const p4 = singleFactoryChain(BROADCAST_NODE, pi);
    const result = chainBlockPins(p4!, pi, { sourcingFloor: 'P3' });
    expect(result).toEqual({ status: 'sized', pins: { highTech: 1 } });
  });
});

describe('chainBlockPins against an independent re-walk', () => {
  const p1FedP4s = Object.keys(pi.schematics)
    .map(Number)
    .filter(
      (typeId) =>
        piTier(typeId, pi) === 4 &&
        pi.schematics[String(typeId)].inputs.some((input) => piTier(input.typeID, pi) === 1)
    );

  const rewalkPins = (typeId: number, floorTier: number): Partial<Record<PiPinKind, number>> => {
    const demand = new Map<number, number>();
    const walk = (id: number, perHour: number): void => {
      demand.set(id, (demand.get(id) ?? 0) + perHour);
      if (piTier(id, pi) <= floorTier) return;
      const schematic = pi.schematics[String(id)];
      for (const input of schematic.inputs) {
        walk(input.typeID, (perHour * input.quantity) / schematic.quantity);
      }
    };
    walk(typeId, singleFactoryRate(typeId, pi)!);

    const pins: Partial<Record<PiPinKind, number>> = {};
    for (const [id, perHour] of demand) {
      if (piTier(id, pi) <= floorTier) continue;
      const schematic = pi.schematics[String(id)];
      const outputPerHour = (schematic.quantity * 3_600) / schematic.cycleTime;
      const factories = Math.ceil(perHour / outputPerHour - 1e-9);
      pins[schematic.facility] = (pins[schematic.facility] ?? 0) + factories;
    }
    return pins;
  };

  it('finds three P4 schematics taking a P1 input directly, all High-Tech', () => {
    expect(p1FedP4s).toHaveLength(3);
    expect(p1FedP4s.map((id) => pi.schematics[String(id)].facility)).toEqual([
      'highTech',
      'highTech',
      'highTech',
    ]);
  });

  for (const [floor, floorTier] of [
    ['P1', 1],
    ['P2', 2],
    ['P3', 3],
  ] as const) {
    it(`counts the same pins as a re-walk at the ${floor} floor`, () => {
      expect(p1FedP4s.length).toBeGreaterThan(0);
      for (const typeId of p1FedP4s) {
        const result = chainBlockPins(singleFactoryChain(typeId, pi)!, pi, {
          sourcingFloor: floor,
        });
        expect(result.status).toBe('sized');
        if (result.status !== 'sized') throw new Error('unreachable');
        expect({ target: typeId, pins: result.pins }).toEqual({
          target: typeId,
          pins: rewalkPins(typeId, floorTier),
        });
      }
    });
  }
});

describe('pinsLoad', () => {
  it('charges every extractor head on top of its ECU', () => {
    const load = pinsLoad({ extractorControlUnit: 2 }, FIXTURE_INFRASTRUCTURE, {
      extractorHeads: 12,
    });
    expect(load).toEqual({ cpu: 2 * 400 + 12 * 110, powergrid: 2 * 2_600 + 12 * 550 });
  });

  it('takes a total head count, not a per-ECU one, so a real colony’s uneven extractors add up honestly', () => {
    const load = pinsLoad({ extractorControlUnit: 2 }, FIXTURE_INFRASTRUCTURE, {
      extractorHeads: 13,
    });
    expect(load).toEqual({ cpu: 2 * 400 + 13 * 110, powergrid: 2 * 2_600 + 13 * 550 });
  });

  it('charges nothing for heads on a pin set with no extractors', () => {
    const load = pinsLoad({ advanced: 1, basic: 2 }, FIXTURE_INFRASTRUCTURE, {
      extractorHeads: 0,
    });
    expect(load).toEqual({ cpu: 500 + 400, powergrid: 700 + 1_600 });
  });
});

describe('fitColony', () => {
  const block = { advanced: 1, basic: 2, extractorControlUnit: 2 };
  const options = {
    budget: LEVEL_4,
    infrastructure: FIXTURE_INFRASTRUCTURE,
    overhead: { launchpads: 1, storageFacilities: 0 },
    block,
    headsPerExtractor: 6,
  };

  it('fits the blocks the tighter of the two ceilings allows', () => {
    const fit = fitColony(options);
    expect(fit.blocks).toBe(1);
    expect(fit.limitedBy).toEqual(['powergrid']);
    expect(fit.used).toEqual({ cpu: 6_620, powergrid: 14_800 });
    expect(fit.pins).toEqual({ ...block, launchpad: 1 });
    expect(fit.budget).toEqual(LEVEL_4);
  });

  it('charges every pin in a block for the link it will need', () => {
    const bare = fitColony(options);
    const linked = fitColony({ ...options, newLinkCost: { cpu: 0, powergrid: 500 } });
    expect(bare.blocks).toBe(1);
    expect(linked.blocks).toBe(0);

    const roomy = fitColony({
      ...options,
      block: { launchpad: 1 },
      overhead: { launchpads: 0, storageFacilities: 0 },
      newLinkCost: { cpu: 0, powergrid: 100 },
    });
    expect(roomy.blocks).toBe(5);
    expect(roomy.used.powergrid).toBe(5 * 700 + 5 * 100);
  });

  it('leaves the fit unchanged when no link cost is supplied', () => {
    expect(fitColony({ ...options, newLinkCost: undefined })).toEqual(fitColony(options));
  });

  it('is CPU-limited when the block is launchpad-heavy rather than extractor-heavy', () => {
    const fit = fitColony({
      ...options,
      block: { launchpad: 1 },
      overhead: { launchpads: 0, storageFacilities: 0 },
    });
    expect(fit.blocks).toBe(5);
    expect(fit.limitedBy).toEqual(['cpu']);
  });

  it('reports both ceilings when they bind at once', () => {
    const fit = fitColony({
      ...options,
      budget: { cpu: 3_600 + 200, powergrid: 700 + 800 },
      block: { basic: 1 },
      headsPerExtractor: 1,
    });
    expect(fit.blocks).toBe(1);
    expect(fit.limitedBy).toEqual(['cpu', 'powergrid']);
  });

  it('reports a dead end, not a scaling limit, when the overhead alone overruns', () => {
    const fit = fitColony({ ...options, budget: FIXTURE_INFRASTRUCTURE.commandCenterUpgrades[0] });
    expect(fit.blocks).toBe(0);
    expect(fit.limitedBy).toEqual([]);
    expect(fit.pins).toEqual({ launchpad: 1 });
  });

  it('counts a storage facility against the budget when the layout buffers through one', () => {
    const withStorage = fitColony({
      ...options,
      overhead: { launchpads: 1, storageFacilities: 1 },
    });
    expect(withStorage.used.cpu).toBe(6_620 + 500);
    expect(withStorage.used.powergrid).toBe(14_800 + 700);
  });

  it('rejects a head count no ECU can carry', () => {
    expect(() =>
      fitColony({ ...options, headsPerExtractor: EXTRACTOR_HEADS_MAX + 1 })
    ).toThrowError(/heads/i);
  });

  it('rejects an empty block rather than reporting it as a dead end', () => {
    expect(() => fitColony({ ...options, block: {} })).toThrowError(/block/i);
  });

  it('rejects a budget that is not a finite, non-negative pair', () => {
    expect(() =>
      fitColony({ ...options, budget: { cpu: Number.NaN, powergrid: 17_000 } })
    ).toThrowError(/budget/i);
    expect(() =>
      fitColony({ ...options, budget: { cpu: 21_315, powergrid: Number.POSITIVE_INFINITY } })
    ).toThrowError(/budget/i);
    expect(() => fitColony({ ...options, budget: { cpu: -1, powergrid: 17_000 } })).toThrowError(
      /budget/i
    );
  });

  it('rejects overhead costs that are not numbers rather than reporting a dead end', () => {
    const brokenLaunchpad: PiInfrastructure = {
      ...FIXTURE_INFRASTRUCTURE,
      pins: {
        ...FIXTURE_INFRASTRUCTURE.pins,
        launchpad: { cpu: Number.NaN, powergrid: 700, capacity: 0 },
      },
    };
    expect(() => fitColony({ ...options, infrastructure: brokenLaunchpad })).toThrowError(
      /finite/i
    );
  });

  it('rejects a block whose pins cost nothing instead of fitting infinitely many', () => {
    expect(() =>
      fitColony({
        ...options,
        infrastructure: FREE_BASIC_INFRASTRUCTURE,
        block: { basic: 1 },
        headsPerExtractor: 0,
      })
    ).toThrowError(/CPU|Powergrid/);
  });

  it('rejects a pin cost with a non-finite axis, which lands in the same reserved shape', () => {
    const brokenBasic: PiInfrastructure = {
      ...FIXTURE_INFRASTRUCTURE,
      pins: {
        ...FIXTURE_INFRASTRUCTURE.pins,
        basic: { cpu: 200, powergrid: Number.NaN, capacity: 0 },
      },
    };
    expect(() =>
      fitColony({
        ...options,
        infrastructure: brokenBasic,
        block: { basic: 1 },
        headsPerExtractor: 0,
      })
    ).toThrowError(/finite/i);
  });
});

describe('checkThroughput', () => {
  const chain = singleFactoryChain(TEST_CULTURES, pi)!;

  it('passes a colony whose links carry the flow and whose buffer holds a day', () => {
    const check = checkThroughput(chain, pi, {
      blocks: 1,
      pins: { launchpad: 1, storage: 1 },
      infrastructure: FIXTURE_INFRASTRUCTURE,
      sourcingFloor: 'P1',
      linkCapacityPerHour: 40_000,
      bufferHours: 24,
    });
    expect(check.verdict).toBe('ok');
    expect(check.bufferM3).toBe(22_000);
    expect(check.hoursToFull).toBeCloseTo(check.bufferM3 / check.flowPerHourM3, 6);
    expect(check.hoursToFull).toBeGreaterThan(24);
  });

  it('reports hoursToFull in lockstep with the overflow verdict on every case above', () => {
    const cases: CheckThroughputOptions[] = [
      {
        blocks: 1,
        pins: { launchpad: 1, storage: 1 },
        infrastructure: FIXTURE_INFRASTRUCTURE,
        sourcingFloor: 'P1',
        linkCapacityPerHour: 40_000,
        bufferHours: 24,
      },
      {
        blocks: 1,
        pins: { launchpad: 1 },
        infrastructure: FIXTURE_INFRASTRUCTURE,
        sourcingFloor: 'P0',
        linkCapacityPerHour: 40_000,
        bufferHours: 168,
      },
      {
        blocks: 20,
        pins: { launchpad: 1, storage: 1 },
        infrastructure: FIXTURE_INFRASTRUCTURE,
        sourcingFloor: 'P0',
        linkCapacityPerHour: 1_250,
        bufferHours: 1,
      },
    ];
    for (const options of cases) {
      const check = checkThroughput(chain, pi, options);
      expect(check.hoursToFull).not.toBeNull();
      expect(check.verdict === 'buffer-overflow').toBe(check.hoursToFull! < options.bufferHours);
    }
  });

  it('reports null hours to fill for a colony with no flow, not Infinity', () => {
    const zeroVolumePi: PiData = {
      ...pi,
      raw: pi.raw.map((resource) => ({ ...resource, volume: 0 })),
      schematics: Object.fromEntries(
        Object.entries(pi.schematics).map(([id, schematic]) => [id, { ...schematic, volume: 0 }])
      ),
    };
    const check = checkThroughput(chain, zeroVolumePi, {
      blocks: 1,
      pins: { launchpad: 1, storage: 1 },
      infrastructure: FIXTURE_INFRASTRUCTURE,
      sourcingFloor: 'P1',
      linkCapacityPerHour: 40_000,
      bufferHours: 24,
    });
    expect(check.flowPerHourM3).toBe(0);
    expect(check.hoursToFull).toBeNull();
  });

  it('fails the buffer check before the link check, since overflow is what actually stalls a colony', () => {
    const check = checkThroughput(chain, pi, {
      blocks: 1,
      pins: { launchpad: 1 },
      infrastructure: FIXTURE_INFRASTRUCTURE,
      sourcingFloor: 'P0',
      linkCapacityPerHour: 40_000,
      bufferHours: 168,
    });
    expect(check.verdict).toBe('buffer-overflow');
    expect(check.bufferNeedM3).toBeGreaterThan(check.bufferM3);
  });

  it('flags the flow exceeding one link rather than silently passing', () => {
    const check = checkThroughput(chain, pi, {
      blocks: 20,
      pins: { launchpad: 1, storage: 1 },
      infrastructure: FIXTURE_INFRASTRUCTURE,
      sourcingFloor: 'P0',
      linkCapacityPerHour: 1_250,
      bufferHours: 1,
    });
    expect(check.verdict).toBe('link-capacity');
    expect(check.flowPerHourM3).toBeGreaterThan(1_250);
  });

  it('says the link side is unknown rather than assuming an upgrade level', () => {
    const check = checkThroughput(chain, pi, {
      blocks: 1,
      pins: { launchpad: 1, storage: 1 },
      infrastructure: FIXTURE_INFRASTRUCTURE,
      sourcingFloor: 'P1',
      linkCapacityPerHour: null,
      bufferHours: 24,
    });
    expect(check.verdict).toBe('link-capacity-unknown');
    expect(check.linkCapacityPerHour).toBeNull();
  });

  it('scales the flow with the block count', () => {
    const one = checkThroughput(chain, pi, {
      blocks: 1,
      pins: { launchpad: 1 },
      infrastructure: FIXTURE_INFRASTRUCTURE,
      sourcingFloor: 'P1',
      linkCapacityPerHour: null,
      bufferHours: 1,
    });
    const three = checkThroughput(chain, pi, {
      blocks: 3,
      pins: { launchpad: 1 },
      infrastructure: FIXTURE_INFRASTRUCTURE,
      sourcingFloor: 'P1',
      linkCapacityPerHour: null,
      bufferHours: 1,
    });
    expect(three.flowPerHourM3).toBeCloseTo(3 * one.flowPerHourM3, 6);
  });

  it('refuses to verdict a colony that fits no block, whose zero flow would read as ok', () => {
    expect(() =>
      checkThroughput(chain, pi, {
        blocks: 0,
        pins: { launchpad: 1 },
        infrastructure: FIXTURE_INFRASTRUCTURE,
        sourcingFloor: 'P1',
        linkCapacityPerHour: 40_000,
        bufferHours: 24,
      })
    ).toThrowError(/block/i);
  });
});

describe('planColony', () => {
  const base = {
    infrastructure: FIXTURE_INFRASTRUCTURE,
    budget: LEVEL_4,
    overhead: { launchpads: 1, storageFacilities: 0 },
    headsPerExtractor: 6,
    linkCapacityPerHour: 40_000,
    bufferHours: 24,
  };

  it('takes a chain and answers with the fit and the throughput in one call', () => {
    const result = planColony(TEST_CULTURES, pi, { ...base, sourcingFloor: 'P1' });
    expect(result.status).toBe('planned');
    if (result.status !== 'planned') throw new Error('unreachable');
    expect(result.block).toEqual({ advanced: 1 });
    expect(result.fit.blocks).toBe(23);
    expect(result.fit.limitedBy).toEqual(['powergrid']);
    expect(result.throughput.verdict).toBe('buffer-overflow');
  });

  it('clears the same layout once the overhead buffers through storage', () => {
    const result = planColony(TEST_CULTURES, pi, {
      ...base,
      sourcingFloor: 'P1',
      overhead: { launchpads: 1, storageFacilities: 1 },
    });
    expect(result.status).toBe('planned');
    if (result.status !== 'planned') throw new Error('unreachable');
    expect(result.throughput.verdict).toBe('ok');
    expect(result.fit.blocks).toBe(22);
  });

  it('passes the refusal straight through instead of making the caller unwrap it', () => {
    const result = planColony(TEST_CULTURES, pi, {
      ...base,
      sourcingFloor: 'P0',
      extractionRatePerHour: null,
    });
    expect(result.status).toBe('needs-extraction-rate');
    if (result.status !== 'needs-extraction-rate') throw new Error('unreachable');
    expect(result.p0PerHour).toHaveLength(2);
  });

  it('has nothing to plan for a P0 resource, which no factory makes', () => {
    const microorganisms = pi.raw.find((r) => r.name === 'Microorganisms')!;
    const result = planColony(microorganisms.typeID, pi, { ...base, sourcingFloor: 'P1' });
    expect(result.status).toBe('not-a-product');
  });

  it('reports a dead end rather than a plan when the budget cannot host the layout', () => {
    const result = planColony(TEST_CULTURES, pi, {
      ...base,
      budget: FIXTURE_INFRASTRUCTURE.commandCenterUpgrades[0],
      sourcingFloor: 'P1',
    });
    expect(result.status).toBe('does-not-fit');
    if (result.status !== 'does-not-fit') throw new Error('unreachable');
    expect(result.fit.blocks).toBe(0);
    expect(result.fit.limitedBy).toEqual([]);
    expect('throughput' in result).toBe(false);
  });

  it('reports a dead end for a block that does not fit even once, ceiling named', () => {
    const result = planColony(BROADCAST_NODE, pi, {
      ...base,
      budget: { cpu: 3_600 + 1_000, powergrid: 6_000 },
      sourcingFloor: 'P3',
    });
    expect(result.status).toBe('does-not-fit');
    if (result.status !== 'does-not-fit') throw new Error('unreachable');
    expect(result.fit.blocks).toBe(0);
    expect(result.fit.limitedBy).toEqual(['cpu']);
  });
});

describe('the shipped snapshot', () => {
  it('names a kind for every pin typeID a live colony can report', () => {
    const byTypeId = pi.infrastructure.pinKindByTypeId;
    expect(byTypeId['2481']).toBe('basic');
    expect(byTypeId['2552']).toBe('launchpad');
    expect(byTypeId['3068']).toBe('extractorControlUnit');
    expect(byTypeId['2254']).toBeUndefined();
    expect(new Set(Object.values(byTypeId))).toEqual(new Set(Object.keys(pi.infrastructure.pins)));
    for (const typeId of pi.infrastructure.commandCenterTypeIds) {
      expect(byTypeId[String(typeId)]).toBeUndefined();
    }
  });

  it('names a Command Center typeID per planet type, none of them a pin kind', () => {
    const ids = pi.infrastructure.commandCenterTypeIds;
    expect(ids).toHaveLength(8);
    expect(new Set(ids).size).toBe(8);
    expect(ids).toContain(2254);
    expect(ids.some((id) => id in pi.infrastructure.pinKindByTypeId)).toBe(false);
  });

  it('carries the ESI-confirmed pin costs the fixture above asserts', () => {
    expect(pi.infrastructure.pins).toEqual(FIXTURE_INFRASTRUCTURE.pins);
    expect(pi.infrastructure.extractorHead).toEqual(FIXTURE_INFRASTRUCTURE.extractorHead);
  });

  it('carries a Command Center budget for every skill level, rising with each', () => {
    const table = pi.infrastructure.commandCenterUpgrades;
    expect(table.map((row) => row.level)).toEqual([0, 1, 2, 3, 4, 5]);
    for (let i = 1; i < table.length; i++) {
      expect(table[i].cpu).toBeGreaterThan(table[i - 1].cpu);
      expect(table[i].powergrid).toBeGreaterThan(table[i - 1].powergrid);
    }
  });

  it('maps the eight colonisable planet typeIDs to the strings ESI reports', () => {
    const byType = pi.planetTypeByTypeId;
    expect(byType['11']).toBe('temperate');
    expect(byType['2016']).toBe('barren');
    expect(byType['30889']).toBeUndefined();
    expect(new Set(Object.values(byType)).size).toBe(8);
  });

  it('names a facility for every schematic', () => {
    const kinds = new Set(Object.values(pi.schematics).map((s) => s.facility));
    expect(kinds).toEqual(new Set(['basic', 'advanced', 'highTech']));
  });

  it('offers the High-Tech Production Plant on two planet types only', () => {
    const p4 = pi.schematics[String(BROADCAST_NODE)];
    expect(p4.facility).toBe('highTech');
    expect(p4.planetTypes).toEqual(['barren', 'temperate']);
  });
});

describe('spareCapacity', () => {
  it('says how many more of each pin kind the leftover budget holds', () => {
    const spare = spareCapacity({ cpu: 6_620, powergrid: 14_800 }, LEVEL_4, FIXTURE_INFRASTRUCTURE);
    expect(spare).toEqual({
      extractorControlUnit: 0,
      basic: 2,
      advanced: 3,
      highTech: 5,
      storage: 3,
      launchpad: 3,
    });
  });

  it('holds at Command Center level 5 for a launchpad, an ECU and ten heads', () => {
    const spare = spareCapacity({ cpu: 5_100, powergrid: 8_800 }, LEVEL_5, FIXTURE_INFRASTRUCTURE);
    expect(spare).toEqual({
      extractorControlUnit: 3,
      basic: 12,
      advanced: 14,
      highTech: 18,
      storage: 14,
      launchpad: 5,
    });
  });

  it('is zero everywhere once the colony is over budget, never negative', () => {
    const spare = spareCapacity(
      { cpu: 30_000, powergrid: 30_000 },
      LEVEL_4,
      FIXTURE_INFRASTRUCTURE
    );
    expect(Object.values(spare).every((count) => count === 0)).toBe(true);
  });

  it('counts an extractor with the heads it would actually carry', () => {
    const budget = { cpu: 10_000, powergrid: 20_000 };
    const bare = spareCapacity({ cpu: 0, powergrid: 0 }, budget, FIXTURE_INFRASTRUCTURE, {
      headsPerExtractor: 0,
    });
    const loaded = spareCapacity({ cpu: 0, powergrid: 0 }, budget, FIXTURE_INFRASTRUCTURE, {
      headsPerExtractor: 10,
    });
    expect(bare.extractorControlUnit).toBe(7);
    expect(loaded.extractorControlUnit).toBe(2);
  });

  it('reads a cost-free pin the way fitColony does — as bad cost data, not as no room', () => {
    expect(() =>
      spareCapacity({ cpu: 0, powergrid: 0 }, LEVEL_4, FREE_BASIC_INFRASTRUCTURE)
    ).toThrowError(/basic/);
  });

  it('charges the link a new pin needs, which can be the difference between one and none', () => {
    const used = { cpu: 8_089, powergrid: 16_552 };
    const link = { cpu: 74.1, powergrid: 54.3 };

    const free = spareCapacity(used, LEVEL_4, FIXTURE_INFRASTRUCTURE);
    expect(free.highTech).toBe(1);

    const linked = spareCapacity(used, LEVEL_4, FIXTURE_INFRASTRUCTURE, { newLinkCost: link });
    expect(linked.highTech).toBe(0);
  });

  it('charges one link per pin, not one for the batch', () => {
    const spare = spareCapacity(
      { cpu: 6_620, powergrid: 14_800 },
      LEVEL_4,
      FIXTURE_INFRASTRUCTURE,
      {
        newLinkCost: { cpu: 100, powergrid: 300 },
      }
    );
    expect(spare.advanced).toBe(2);
    expect(spare.highTech).toBe(3);
  });

  it('refuses a surcharge that cancels a pin’s own cost out', () => {
    expect(() =>
      spareCapacity({ cpu: 0, powergrid: 0 }, LEVEL_4, FIXTURE_INFRASTRUCTURE, {
        newLinkCost: { cpu: -200, powergrid: -800 },
      })
    ).toThrowError(/surcharge/);
  });

  it('refuses a non-finite surcharge, for the same reason', () => {
    expect(() =>
      spareCapacity({ cpu: 0, powergrid: 0 }, LEVEL_4, FIXTURE_INFRASTRUCTURE, {
        newLinkCost: { cpu: Number.POSITIVE_INFINITY, powergrid: 10 },
      })
    ).toThrowError(/surcharge/);
  });

  it('charges no link when the caller has no measured one to charge', () => {
    const used = { cpu: 6_620, powergrid: 14_800 };
    expect(spareCapacity(used, LEVEL_4, FIXTURE_INFRASTRUCTURE, {})).toEqual(
      spareCapacity(used, LEVEL_4, FIXTURE_INFRASTRUCTURE)
    );
  });
});
