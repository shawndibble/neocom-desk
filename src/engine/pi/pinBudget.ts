/**
 * How much of a production chain fits on one planet.
 *
 * ## CPU and Powergrid are the pin cap; there is no pin-count cap
 *
 * The question this module answers is the one a planner actually faces: six
 * pins of P1, or fewer pins pushed up to P2? The game does not settle it with
 * a pin limit — it settles it with a **budget**. A Command Center supplies a
 * fixed CPU and Powergrid allowance (scaled by the pilot's Command Center
 * Upgrades skill), every pin draws a fixed amount of both, and the colony
 * holds whatever fits. So the answer is an arithmetic fit against two
 * independent ceilings, not a lookup, and the interesting output is *which
 * ceiling binds*: Powergrid almost always does, because an Extractor Control
 * Unit and its heads are Powergrid-hungry and CPU-cheap while a Launchpad is
 * the reverse.
 *
 * Every number is supplied, none is written here. `PiData.infrastructure`
 * carries the per-pin costs and the Command Center table, all of it derived
 * from the SDE dump at build time (`scripts/build-sde.mjs`) except the
 * Command Center Upgrades rows above level 0, which the dump does not hold;
 * that one table is hand-maintained there with its sourcing recorded, and the
 * build asserts its level-0 row against the dump. This module reads what it
 * is given.
 *
 * ## The overhead / block split
 *
 * Some pins exist once whatever the scale — a Launchpad, because nothing
 * leaves the planet without one, plus a Storage Facility if the layout
 * buffers through one. The rest repeat: a **ratio block** is the smallest
 * whole-pin set that runs the chain once, e.g. one Advanced Industry Facility
 * making a P2 fed by exactly two Basic Industry Facilities, because one P1
 * factory's 40/hr is exactly what one P2 factory eats. Fitting a colony is
 * then: subtract the overhead, divide what is left by one block, take the
 * floor of the tighter axis.
 *
 * Whether the layout wants a Storage Facility is the caller's call, not a
 * rule invented here. It is a real trade — 500 tf and 700 MW against 12,000
 * m3 of buffer — and which way it goes depends on how long the user leaves
 * the colony alone, which is not in any payload.
 *
 * ## Throughput is a second, separate budget
 *
 * `checkThroughput` covers an axis that is easy to miss and has nothing to do
 * with CPU or Powergrid: material has to physically move and physically fit.
 * EVE University's worked "one extractor feeds three Basic Facilities" ratio
 * is driven by exactly this — keeping factory throughput ahead of the
 * Launchpad filling with unprocessed ore — not by a CPU optimisation. A
 * layout can clear the CPU/Powergrid fit and still stall.
 *
 * Pure: budget, pin costs, extraction rate, link capacity and buffer policy
 * are all parameters. No fetch, no clock, no skill lookups, no payload
 * imports.
 */

import type { PiData, PiInfrastructure, PiPinKind } from '@/sde/types';
import { SOURCING_FLOOR_TIER, expandChain } from './chain';
import type {
  ColonyFit,
  FitColonyOptions,
  PinCounts,
  PinLoad,
  PiChain,
  SourcingFloor,
  ThroughputCheck,
  ThroughputOptions,
} from './types';

export type {
  ColonyFit,
  FitColonyOptions,
  PinCounts,
  PinLoad,
  PinOverhead,
  ThroughputCheck,
  ThroughputOptions,
  ThroughputVerdict,
} from './types';

/**
 * Extractor heads one Extractor Control Unit can carry.
 *
 * Not in the SDE: the ECU's own dogma attributes cover its cost, its cycle,
 * its depletion range and its per-head cost, but not how many heads it takes.
 * Source: EVE University wiki, "Planetary Industry"
 * (https://wiki.eveuniversity.org/Planetary_Industry), read 2026-09-04. Used
 * only to reject an impossible head count, never to assume one — a real
 * colony's head count is read off the pin's own `extractor_details.heads`.
 */
export const EXTRACTOR_HEADS_MAX = 10;

const SECONDS_PER_HOUR = 3_600;

/** Absorbs float drift so 3.0000000001 blocks does not floor to 3 when it should be 3. */
const FLOOR_EPSILON = 1e-9;

function floorBlocks(value: number): number {
  return Math.max(0, Math.floor(value + FLOOR_EPSILON));
}

/**
 * Units an hour one factory of this schematic makes, read off its own cycle —
 * 40/5/3/1 at P1..P4, which is a check on the derivation rather than its
 * source. Null for a P0 resource, which comes out of an extractor and has no
 * schematic at all.
 */
export function singleFactoryRate(typeId: number, pi: PiData): number | null {
  const schematic = pi.schematics[String(typeId)];
  if (!schematic) return null;
  return (schematic.quantity * SECONDS_PER_HOUR) / schematic.cycleTime;
}

/**
 * The chain that one factory of `typeId` sustains — the ratio block's shape.
 * Expanding at exactly one factory's output is what makes the pin counts
 * beneath it whole ratios rather than a rounded-up approximation of an
 * arbitrary rate.
 */
export function singleFactoryChain(typeId: number, pi: PiData): PiChain | null {
  const rate = singleFactoryRate(typeId, pi);
  if (rate === null) return null;
  return expandChain(typeId, pi, { unitsPerHour: rate });
}

/** One ratio block sized, or a refusal to guess the extraction side. */
export type ChainBlockResult =
  | { status: 'sized'; pins: PinCounts }
  | {
      status: 'needs-extraction-rate';
      /** What an assumption would have to cover, so a caller can ask for it precisely. */
      p0PerHour: readonly { typeId: number; name: string; unitsPerHour: number }[];
    };

export interface ChainBlockOptions {
  /** Buy at or below this tier, make above it — the same floor `chainCost` costs against. */
  sourcingFloor: SourcingFloor;
  /**
   * Sustained units an hour one extractor program yields. Required on the P0
   * floor, which is the only one that supplies itself off the planet;
   * ignored otherwise. `null` is a first-class answer, not an error state —
   * an unbuilt planet has no measured rate — and returns
   * `needs-extraction-rate` rather than a plausible-looking pin count.
   *
   * Derive it through `engine/pi/extraction.ts`, never from raw
   * `qty_per_cycle`: output decays across a program.
   */
  extractionRatePerHour?: number | null;
}

/**
 * The pins one ratio block of `chain` places, by kind.
 *
 * Which factory runs a schematic comes from `PiData` — the SDE's own
 * schematic-to-pin map — so no tier-to-facility table is assumed here even
 * though the current recipe set happens to be uniform about it.
 */
export function chainBlockPins(
  chain: PiChain,
  pi: PiData,
  opts: ChainBlockOptions
): ChainBlockResult {
  const { sourcingFloor, extractionRatePerHour = null } = opts;
  const floorTier = SOURCING_FLOOR_TIER[sourcingFloor];

  const p0Nodes = chain.nodes.filter((node) => node.tier === 0);
  const rate =
    extractionRatePerHour != null &&
    Number.isFinite(extractionRatePerHour) &&
    extractionRatePerHour > 0
      ? extractionRatePerHour
      : null;
  if (sourcingFloor === 'P0' && rate === null) {
    return {
      status: 'needs-extraction-rate',
      p0PerHour: p0Nodes.map((node) => ({
        typeId: node.typeId,
        name: node.name,
        unitsPerHour: node.unitsPerHour,
      })),
    };
  }

  const pins: Partial<Record<PiPinKind, number>> = {};
  const add = (kind: PiPinKind, count: number) => {
    if (count > 0) pins[kind] = (pins[kind] ?? 0) + count;
  };

  for (const node of chain.nodes) {
    if (node.tier <= floorTier || node.factoryPins === null) continue;
    const schematic = pi.schematics[String(node.typeId)];
    if (!schematic) throw new Error(`${node.typeId} is made by no schematic in this payload`);
    add(schematic.facility, node.factoryPins);
  }

  // One ECU per P0 type per whole program's worth of demand. Ceiling per type,
  // not on the sum: two resources cannot share one extractor.
  if (sourcingFloor === 'P0' && rate !== null) {
    for (const node of p0Nodes) {
      add('extractorControlUnit', Math.ceil(node.unitsPerHour / rate - FLOOR_EPSILON));
    }
  }

  return { status: 'sized', pins };
}

/**
 * What a set of pins draws. Extractor heads are charged on top of their ECUs
 * — a head has its own CPU and Powergrid cost, so a ten-head extractor costs
 * over three times a one-head extractor and a layout that ignores heads
 * under-reports every extraction planet.
 */
export function pinsLoad(
  counts: PinCounts,
  infrastructure: PiInfrastructure,
  opts: { headsPerExtractor: number }
): PinLoad {
  const { headsPerExtractor } = opts;
  let cpu = 0;
  let powergrid = 0;
  for (const [kind, count] of Object.entries(counts) as [PiPinKind, number][]) {
    if (!count) continue;
    const spec = infrastructure.pins[kind];
    if (!spec) throw new Error(`no cost data for pin kind ${kind}`);
    cpu += spec.cpu * count;
    powergrid += spec.powergrid * count;
    if (kind === 'extractorControlUnit') {
      const heads = count * headsPerExtractor;
      cpu += infrastructure.extractorHead.cpu * heads;
      powergrid += infrastructure.extractorHead.powergrid * heads;
    }
  }
  return { cpu, powergrid };
}

function scale(counts: PinCounts, factor: number): PinCounts {
  const out: Partial<Record<PiPinKind, number>> = {};
  for (const [kind, count] of Object.entries(counts) as [PiPinKind, number][]) {
    if (count) out[kind] = count * factor;
  }
  return out;
}

function merge(...sets: PinCounts[]): PinCounts {
  const out: Partial<Record<PiPinKind, number>> = {};
  for (const set of sets) {
    for (const [kind, count] of Object.entries(set) as [PiPinKind, number][]) {
      if (count) out[kind] = (out[kind] ?? 0) + count;
    }
  }
  return out;
}

/**
 * How many ratio blocks fit beside the fixed overhead, and which of the two
 * ceilings stopped it there.
 *
 * `limitedBy` being empty is a distinct answer from either ceiling binding: it
 * means the overhead alone already overruns the budget, which is a dead end
 * rather than a scaling limit — the planet cannot host this layout at all,
 * and the fix is a Command Center Upgrades level, not fewer factories.
 */
export function fitColony(opts: FitColonyOptions): ColonyFit {
  const { budget, infrastructure, overhead, block, headsPerExtractor } = opts;
  if (
    !Number.isInteger(headsPerExtractor) ||
    headsPerExtractor < 0 ||
    headsPerExtractor > EXTRACTOR_HEADS_MAX
  ) {
    throw new Error(
      `an Extractor Control Unit carries 0-${EXTRACTOR_HEADS_MAX} heads, got ${headsPerExtractor}`
    );
  }

  const overheadPins: PinCounts = {
    launchpad: overhead.launchpads,
    storage: overhead.storageFacilities,
  };
  const overheadLoad = pinsLoad(overheadPins, infrastructure, { headsPerExtractor });
  const cpuLeft = budget.cpu - overheadLoad.cpu;
  const powergridLeft = budget.powergrid - overheadLoad.powergrid;
  if (cpuLeft < 0 || powergridLeft < 0) {
    return {
      blocks: 0,
      pins: merge(overheadPins),
      used: overheadLoad,
      budget,
      limitedBy: [],
    };
  }

  const blockLoad = pinsLoad(block, infrastructure, { headsPerExtractor });
  // A block that draws nothing on an axis is not limited by it; treating
  // "divide by zero" as unbounded is the honest reading.
  const cpuBlocks = blockLoad.cpu > 0 ? cpuLeft / blockLoad.cpu : Infinity;
  const powergridBlocks = blockLoad.powergrid > 0 ? powergridLeft / blockLoad.powergrid : Infinity;
  const blocks = Number.isFinite(Math.min(cpuBlocks, powergridBlocks))
    ? floorBlocks(Math.min(cpuBlocks, powergridBlocks))
    : 0;

  const limitedBy: ('cpu' | 'powergrid')[] = [];
  if (blocks > 0) {
    if (floorBlocks(cpuBlocks) === blocks) limitedBy.push('cpu');
    if (floorBlocks(powergridBlocks) === blocks) limitedBy.push('powergrid');
  }

  const pins = merge(overheadPins, scale(block, blocks));
  return {
    blocks,
    pins,
    used: pinsLoad(pins, infrastructure, { headsPerExtractor }),
    budget,
    limitedBy,
  };
}

export interface CheckThroughputOptions {
  /** Ratio blocks the colony runs — the scale `fitColony` arrived at. */
  blocks: number;
  /** The colony's whole pin set, whose launchpad and storage supply the buffer. */
  pins: PinCounts;
  infrastructure: PiInfrastructure;
  /** The floor the block was sized against; a bought tier crosses no local link. */
  sourcingFloor: SourcingFloor;
  linkCapacityPerHour: ThroughputOptions['linkCapacityPerHour'];
  bufferHours: ThroughputOptions['bufferHours'];
}

/**
 * The throughput axis: does the material fit through the links, and does a
 * buffer cycle fit in the launchpad and storage?
 *
 * `flowPerHourM3` sums every unit that moves — extracted P0 plus each made
 * tier's own output — because all of it crosses a link on the way to the next
 * pin. Comparing that whole flow against a *single* link's capacity is
 * deliberately conservative: a real colony spreads it over many links, but
 * which pin sits where is a placement the app never sees, so this
 * over-reports pressure rather than under-reporting it. It flags a layout to
 * look at, and never quietly passes one that cannot move its own output.
 */
export function checkThroughput(
  chain: PiChain,
  pi: PiData,
  opts: CheckThroughputOptions
): ThroughputCheck {
  const { blocks, pins, infrastructure, sourcingFloor, linkCapacityPerHour, bufferHours } = opts;
  const floorTier = SOURCING_FLOOR_TIER[sourcingFloor];
  const rawVolume = new Map(pi.raw.map((resource) => [resource.typeID, resource.volume]));

  let flowPerHourM3 = 0;
  for (const node of chain.nodes) {
    // Below the floor nothing is extracted and nothing is made, so nothing
    // moves on the planet: those units arrive by launchpad already.
    if (node.tier < floorTier) continue;
    const volume =
      node.tier === 0
        ? (rawVolume.get(node.typeId) ?? 0)
        : (pi.schematics[String(node.typeId)]?.volume ?? 0);
    flowPerHourM3 += node.unitsPerHour * volume;
  }
  flowPerHourM3 *= blocks;

  let bufferM3 = 0;
  for (const [kind, count] of Object.entries(pins) as [PiPinKind, number][]) {
    bufferM3 += (infrastructure.pins[kind]?.capacity ?? 0) * (count ?? 0);
  }
  const bufferNeedM3 = flowPerHourM3 * bufferHours;

  // Overflow is checked first because it is what actually stalls a colony:
  // a full launchpad stops extraction dead, where a saturated link only
  // slows the flow down.
  const verdict =
    bufferNeedM3 > bufferM3
      ? 'buffer-overflow'
      : linkCapacityPerHour === null
        ? 'link-capacity-unknown'
        : flowPerHourM3 > linkCapacityPerHour
          ? 'link-capacity'
          : 'ok';

  return { verdict, flowPerHourM3, bufferM3, bufferNeedM3, linkCapacityPerHour };
}
