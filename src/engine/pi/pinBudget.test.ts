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
  // Temperate and Barren only; the real payload carries all eight, one per
  // planet type, which the snapshot block below asserts.
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

/** A payload claiming a Basic Industry Facility is free — nothing then bounds a fit. */
const FREE_BASIC_INFRASTRUCTURE: PiInfrastructure = {
  ...FIXTURE_INFRASTRUCTURE,
  pins: { ...FIXTURE_INFRASTRUCTURE.pins, basic: { cpu: 0, powergrid: 0, capacity: 0 } },
};

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

/**
 * `chainBlockPins` filters `chain.nodes` by `tier > floorTier` where
 * `chainCost` re-walks the graph against the same floor. The two agree because
 * every schematic input sits at a strictly lower tier than the schematic that
 * consumes it, so nothing above the floor is reachable except through nodes
 * above the floor — but that is an argument, and the shortcut deserves a
 * measurement. The P4s that consume a P1 directly are where the graph stops
 * being neatly layered and so where the shortcut would fail first; they are
 * found by filtering the payload rather than listed, so a recipe change moves
 * the test with it.
 */
describe('chainBlockPins against an independent re-walk', () => {
  const p1FedP4s = Object.keys(pi.schematics)
    .map(Number)
    .filter(
      (typeId) =>
        piTier(typeId, pi) === 4 &&
        pi.schematics[String(typeId)].inputs.some((input) => piTier(input.typeID, pi) === 1)
    );

  /** Walks the recipe graph itself, stopping at the floor. Never calls the function under test. */
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

    // Demand is accumulated across every path before it is ceiled, because two
    // factories each wanting half a unit share one pin, not two.
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

  it('charges every pin in a block for the link it will need', () => {
    // The same omission `spareCapacity` was fixed for, one line up the card:
    // "Build up to" fitted a layout whose pins reach nothing, while "Room for"
    // directly above it charged each new pin a link. Two adjacent numbers on
    // one card must not disagree about whether links exist.
    //
    // The ratio block is five pins — 1 advanced, 2 basic, 2 ECU — drawing
    // 14,100 MW against the 16,300 left once the overhead launchpad is paid.
    // One block fits. Charge each of those five pins a 500 MW link and the
    // block is 16,600 MW, which does not: the charge has to scale with the
    // pins in a block, not be levied once per block.
    const bare = fitColony(options);
    const linked = fitColony({ ...options, newLinkCost: { cpu: 0, powergrid: 500 } });
    expect(bare.blocks).toBe(1);
    expect(linked.blocks).toBe(0);

    // And the links a layout adds are part of what it draws, or `used` would
    // report a layout as fitting inside a budget the fit just refused it.
    const roomy = fitColony({
      ...options,
      block: { launchpad: 1 },
      overhead: { launchpads: 0, storageFacilities: 0 },
      newLinkCost: { cpu: 0, powergrid: 100 },
    });
    // CPU binds at 21,315 / 3,600 = 5 launchpads; each carries a 100 MW link.
    expect(roomy.blocks).toBe(5);
    expect(roomy.used.powergrid).toBe(5 * 700 + 5 * 100);
  });

  it('leaves the fit unchanged when no link cost is supplied', () => {
    // Omitted means unpriced, not free — the same reading `spareCapacity`
    // takes — so an existing caller's answer must not move.
    expect(fitColony({ ...options, newLinkCost: undefined })).toEqual(fitColony(options));
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

  it('rejects a budget that is not a finite, non-negative pair', () => {
    // A NaN axis passes every comparison, so it used to come back as
    // `blocks: NaN` with an empty `limitedBy` — the shape that means "the
    // overhead alone overruns" and nothing else.
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
    // floorBlocks(Infinity) is Infinity, which then scales the pin counts to
    // NaN. "Every pin costs something" is true of the shipped payload and an
    // assumption about a parameter, so it is checked rather than trusted.
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
    // Not `planned`, and carrying no throughput verdict at all: a colony that
    // fits nothing moves nothing, and nothing that moves nothing overflows, so
    // a verdict here could only ever have said `ok` about a colony that cannot
    // exist.
    expect(result.status).toBe('does-not-fit');
    if (result.status !== 'does-not-fit') throw new Error('unreachable');
    expect(result.fit.blocks).toBe(0);
    expect(result.fit.limitedBy).toEqual([]);
    expect('throughput' in result).toBe(false);
  });

  it('reports a dead end for a block that does not fit even once, ceiling named', () => {
    // Level 0 hosts the launchpad but not one High-Tech Production Plant
    // beside it, which is a scaling limit and still not a plan.
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
    // 2481 Temperate Basic Industry Facility, 2552 Ice Launchpad,
    // 3068 Temperate Extractor Control Unit.
    expect(byTypeId['2481']).toBe('basic');
    expect(byTypeId['2552']).toBe('launchpad');
    expect(byTypeId['3068']).toBe('extractorControlUnit');
    // The Command Center supplies the budget and draws nothing from it, so it
    // is deliberately not a pin kind.
    expect(byTypeId['2254']).toBeUndefined();
    expect(new Set(Object.values(byTypeId))).toEqual(new Set(Object.keys(pi.infrastructure.pins)));
    // Not one of the eight Command Centers is a pin kind, and the feature layer
    // now leans on that separation to recognise the one pin every colony has
    // without giving it a cost row.
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

  it('reads a cost-free pin the way fitColony does — as bad cost data, not as no room', () => {
    // The two used to disagree on the same input: fitColony called an
    // unbounded axis unbounded, this one reported 0. Naming the kind is what
    // makes a payload fault diagnosable.
    expect(() =>
      spareCapacity({ cpu: 0, powergrid: 0 }, LEVEL_4, FREE_BASIC_INFRASTRUCTURE)
    ).toThrowError(/basic/);
  });

  it('charges the link a new pin needs, which can be the difference between one and none', () => {
    // A reported colony (Efa V, Command Center level 4): 8,089 tf / 16,552 MW
    // drawn of 21,315 / 17,000, leaving 448 MW. A High-Tech plant is 400 MW,
    // so the headroom line offered one — but nothing on a planet is reachable
    // without a link, and that colony's own twelve links average 54.3 MW. The
    // plant plus its link is 454.3 MW and does not fit, which is exactly what
    // the pilot found when they tried to place it.
    const used = { cpu: 8_089, powergrid: 16_552 };
    const link = { cpu: 74.1, powergrid: 54.3 };

    const free = spareCapacity(used, LEVEL_4, FIXTURE_INFRASTRUCTURE);
    expect(free.highTech).toBe(1);

    const linked = spareCapacity(used, LEVEL_4, FIXTURE_INFRASTRUCTURE, { newLinkCost: link });
    expect(linked.highTech).toBe(0);
  });

  it('charges one link per pin, not one for the batch', () => {
    // Two more factories are two more links. Charging a single link for the
    // whole row would overstate the second one and every one after it.
    const spare = spareCapacity(
      { cpu: 6_620, powergrid: 14_800 },
      LEVEL_4,
      FIXTURE_INFRASTRUCTURE,
      {
        newLinkCost: { cpu: 100, powergrid: 300 },
      }
    );
    // 2,200 MW left, and only the counts that separate all three readings —
    // unlinked, one link for the whole batch, one link per pin — are worth
    // asserting. A Basic factory is not one of them: 2,200/800 = 2 unlinked,
    // 1,900/800 = 2 shared and 2,200/1,100 = 2 per pin all agree, so it is
    // deliberately left out rather than looking like evidence.
    // Advanced 700 MW: 3 unlinked, 2 shared, 2 per pin.
    expect(spare.advanced).toBe(2);
    // High-Tech 400 MW: 5 unlinked, 4 shared, 3 per pin — the one count that
    // tells a per-pin charge from a shared one.
    expect(spare.highTech).toBe(3);
  });

  it('refuses a surcharge that cancels a pin’s own cost out', () => {
    // `axisFit` may not answer "unbounded": `Infinity` repeats scale the pin
    // counts to `NaN`. The payload cannot express a negative link cost, but
    // `newLinkCost` is public API on an exported engine function, and a
    // surcharge of minus one Basic factory zeroes the divisor and reaches
    // exactly that.
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
    // A colony with no links has no distance to price, and a guess here would
    // be the same invented number `linksLoad` refuses to return. Omitting the
    // option must therefore mean "unpriced", not "free by default" — the
    // caller decides which, and says so on screen.
    const used = { cpu: 6_620, powergrid: 14_800 };
    expect(spareCapacity(used, LEVEL_4, FIXTURE_INFRASTRUCTURE, {})).toEqual(
      spareCapacity(used, LEVEL_4, FIXTURE_INFRASTRUCTURE)
    );
  });
});
