import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData, PiInfrastructure } from '@/sde/types';
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
} from './pinBudget';

// The real snapshot, same reasoning as chain.test.ts: the pin counts below are
// claims about the shipped recipe graph and the shipped CPU/Powergrid table,
// so a hand-made stub would pin nothing.
const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

/** Test Cultures — a P2 whose two P1 inputs each come off one planet's own P0. */
const TEST_CULTURES = 2319;
/** Broadcast Node — the P4 chain.test.ts uses. */
const BROADCAST_NODE = 2867;

/**
 * The ESI-confirmed numbers, inline rather than read off the snapshot: these
 * are what the payload is *supposed* to carry
 * (docs/research/pi-cpu-power-mechanics.md §1-3), so asserting the engine
 * against them independently is the point. The `shipped snapshot` block at
 * the bottom then checks the payload the build emits agrees with them.
 */
const FIXTURE_INFRASTRUCTURE: PiInfrastructure = {
  pins: {
    extractorControlUnit: { cpu: 400, powergrid: 2_600, capacity: 0 },
    basic: { cpu: 200, powergrid: 800, capacity: 0 },
    advanced: { cpu: 500, powergrid: 700, capacity: 0 },
    highTech: { cpu: 1_100, powergrid: 400, capacity: 0 },
    storage: { cpu: 500, powergrid: 700, capacity: 12_000 },
    launchpad: { cpu: 3_600, powergrid: 700, capacity: 10_000 },
  },
  // Only the Temperate variants; the snapshot check at the bottom asserts the
  // shipped map covers every kind.
  pinKindByTypeId: {
    3068: 'extractorControlUnit',
    2481: 'basic',
    2480: 'advanced',
    2482: 'highTech',
    2562: 'storage',
    2256: 'launchpad',
  },
  extractorHead: { cpu: 110, powergrid: 550 },
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

describe('singleFactoryRate', () => {
  it('reads one factory’s hourly output off the schematic, not a tier table', () => {
    // 5 units per 3600s cycle at P2, 20 per 1800s at P1.
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
    // One P2 factory eats 40 Bacteria and 40 Water an hour, and one P1
    // factory makes exactly 40 an hour, so the block is 1 advanced + 2 basic.
    expect(block?.targetPerHour).toBe(5);
    const p1Pins = block!.nodes.filter((n) => n.tier === 1).map((n) => n.factoryPins);
    expect(p1Pins).toEqual([1, 1]);
  });

  it('groups factory pins by the facility the SDE says runs them', () => {
    const result = chainBlockPins(block!, pi, { sourcingFloor: 'P1' });
    expect(result).toEqual({ status: 'sized', pins: { advanced: 1 } });
  });

  it('adds one ECU per P0 type on the P0 floor', () => {
    // Each P1 factory pulls 6,000 P0 an hour; at 6,000/hr one ECU covers one.
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

describe('pinsLoad', () => {
  it('charges every extractor head on top of its ECU', () => {
    const load = pinsLoad({ extractorControlUnit: 2 }, FIXTURE_INFRASTRUCTURE, {
      extractorHeads: 12,
    });
    // 2 ECUs at 400/2,600, plus 12 heads at 110/550.
    expect(load).toEqual({ cpu: 2 * 400 + 12 * 110, powergrid: 2 * 2_600 + 12 * 550 });
  });

  it('takes a total head count, not a per-ECU one, so a real colony’s uneven extractors add up honestly', () => {
    // Two live ECUs, one with 10 heads and one with 3. No per-extractor
    // average describes that; the total does.
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
    // CPU would allow 5 blocks (17,715 left / 3,020 a block); Powergrid
    // allows 1 (16,300 left / 14,100 a block). Powergrid wins, as it does on
    // essentially every real colony.
    expect(fit.blocks).toBe(1);
    expect(fit.limitedBy).toEqual(['powergrid']);
    expect(fit.used).toEqual({ cpu: 6_620, powergrid: 14_800 });
    expect(fit.pins).toEqual({ ...block, launchpad: 1 });
    expect(fit.budget).toEqual(LEVEL_4);
  });

  it('is CPU-limited when the block is launchpad-heavy rather than extractor-heavy', () => {
    const fit = fitColony({
      ...options,
      block: { launchpad: 1 },
      overhead: { launchpads: 0, storageFacilities: 0 },
    });
    // 21,315 / 3,600 = 5 launchpads on CPU; 17,000 / 700 = 24 on Powergrid.
    expect(fit.blocks).toBe(5);
    expect(fit.limitedBy).toEqual(['cpu']);
  });

  it('reports both ceilings when they bind at once', () => {
    // One launchpad of overhead (3,600 tf / 700 MW), then a budget leaving
    // room for exactly one Basic Industry Facility (200 tf / 800 MW) on each
    // axis at the same time.
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
    // Level 0 gives 1,675 tf; the mandatory launchpad alone wants 3,600.
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
    // Zero blocks with nothing limiting them is what "the overhead alone
    // overruns" means, so a block that draws nothing must not reach that
    // branch and read as the same answer.
    expect(() => fitColony({ ...options, block: {} })).toThrowError(/block/i);
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
  });

  it('fails the buffer check before the link check, since overflow is what actually stalls a colony', () => {
    const check = checkThroughput(chain, pi, {
      blocks: 1,
      pins: { launchpad: 1 },
      infrastructure: FIXTURE_INFRASTRUCTURE,
      sourcingFloor: 'P0',
      // A week unattended. The P0 floor moves ~79 m3 an hour at one block,
      // which a day fits in a 10,000 m3 launchpad and a week does not — the
      // buffer is a policy question, which is why the hours are a parameter.
      linkCapacityPerHour: 40_000,
      bufferHours: 168,
    });
    expect(check.verdict).toBe('buffer-overflow');
    expect(check.bufferNeedM3).toBeGreaterThan(check.bufferM3);
  });

  it('flags the flow exceeding one link rather than silently passing', () => {
    const check = checkThroughput(chain, pi, {
      // Twenty blocks moves ~1,579 m3 an hour, past what an un-upgraded
      // 1,250 m3/hr link carries, while still buffering an hour comfortably.
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
    // One Advanced Industry Facility a block: CPU allows 35, Powergrid 23.
    expect(result.block).toEqual({ advanced: 1 });
    expect(result.fit.blocks).toBe(23);
    expect(result.fit.limitedBy).toEqual(['powergrid']);
    // And this is why throughput is checked at all: the CPU/Powergrid fit is
    // happy at 23 factories, and a day of their output does not fit in the
    // one launchpad the overhead gave them. A layout can clear the budget and
    // still stall.
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
    // The storage facility costs a factory's worth of budget to buy that
    // buffer, which is the trade the caller is being asked to make.
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
    expect(result.status).toBe('planned');
    if (result.status !== 'planned') throw new Error('unreachable');
    expect(result.fit.blocks).toBe(0);
    expect(result.fit.limitedBy).toEqual([]);
  });
});

describe('the shipped snapshot', () => {
  it('names a kind for every pin typeID a live colony can report', () => {
    const byTypeId = pi.infrastructure.pinKindByTypeId;
    // 2481 Temperate Basic Industry Facility, 2552 Ice Launchpad,
    // 3068 Temperate Extractor Control Unit.
    expect(byTypeId['2481']).toBe('basic');
    expect(byTypeId['2552']).toBe('launchpad');
    expect(byTypeId['3068']).toBe('extractorControlUnit');
    // The Command Center supplies the budget and draws nothing from it, so it
    // is deliberately not a pin kind.
    expect(byTypeId['2254']).toBeUndefined();
    expect(new Set(Object.values(byTypeId))).toEqual(new Set(Object.keys(pi.infrastructure.pins)));
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
    // Shattered planets carry no colony, so they are absent rather than
    // mapped to something plausible.
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
    // 14,695 tf and 2,200 MW left. Powergrid is what runs out: 2 basic
    // (800 MW each), 3 advanced or storage (700), 3 launchpads (700), and no
    // extractor at all — an ECU alone wants 2,600 MW.
    expect(spare).toEqual({
      extractorControlUnit: 0,
      basic: 2,
      advanced: 3,
      highTech: 5,
      storage: 3,
      launchpad: 3,
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
    // 20,000 MW / 2,600 bare, against 20,000 / (2,600 + 10 x 550).
    expect(bare.extractorControlUnit).toBe(7);
    expect(loaded.extractorControlUnit).toBe(2);
  });
});
