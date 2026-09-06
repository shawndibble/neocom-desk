/**
 * How much of a production chain fits on one planet.
 *
 * ## CPU and Powergrid are the pin cap; there is no pin-count cap
 *
 * The question this module answers is the one a planner actually faces: six
 * pins of P1, or fewer pins pushed up to P2? The game does not settle it with
 * a pin limit — it settles it with a **budget**. A Command Center supplies a
 * fixed CPU and Powergrid allowance (scaled by the colony's own Command Center
 * Upgrades level, which the pilot's skill only caps — `scripts/build-sde.mjs`
 * records why conflating the two overstates every colony), every pin draws a
 * fixed amount of both, and the colony
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
 * is given. The one number written here is `EXTRACTOR_HEADS_MAX`, which no
 * payload carries and which is banner-flagged below as hand-maintained.
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

import type { PiData, PiInfrastructure, PiPinKind, PiPinSpec } from '@/sde/types';
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
 * UNLIKE EVERY OTHER PI NUMBER THIS ENGINE TOUCHES THIS ONE IS NOT DERIVED
 * FROM THE SDE DUMP, and no payload carries it — it is hand-maintained here
 * and can drift out from under a `latest` dump without any download or build
 * check noticing. The ECU's own dogma attributes cover its CPU, its Powergrid,
 * its cycle, its depletion range and its per-head cost, but nothing in the
 * dump says how many heads it takes.
 *
 * Source: EVE University wiki, "Planetary Industry"
 * (https://wiki.eveuniversity.org/Planetary_Industry), read 2026-09-04.
 * Secondary-source only; there is no primary to assert it against, which is
 * the second reason it is used only as an upper bound.
 *
 * It answers "is this head count impossible", never "how many heads are
 * there": a real colony's count is read off the pin's own
 * `extractor_details.heads`, so a stale value here rejects a legitimate layout
 * at worst and never invents one. The sibling hand-maintained tables carry the
 * same banner in `scripts/build-sde.mjs` (`CC_UPGRADE_LEVELS`,
 * `P0_PLANET_TYPES`); this one stays in the engine because it constrains a
 * parameter rather than shaping a payload.
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
 *
 * `extractorHeads` is the **total** across the whole pin set, not a per-ECU
 * figure. A real colony's extractors are not uniform — each ECU's heads were
 * placed by hand, and ESI reports each one's own `heads` array — so a per-ECU
 * average would be a number no colony actually has. A hypothetical layout
 * multiplies its own uniform count up before calling.
 */
export function pinsLoad(
  counts: PinCounts,
  infrastructure: PiInfrastructure,
  opts: { extractorHeads: number }
): PinLoad {
  let cpu = infrastructure.extractorHead.cpu * opts.extractorHeads;
  let powergrid = infrastructure.extractorHead.powergrid * opts.extractorHeads;
  for (const [kind, count] of Object.entries(counts) as [PiPinKind, number][]) {
    if (!count) continue;
    const spec = infrastructure.pins[kind];
    if (!spec) throw new Error(`no cost data for pin kind ${kind}`);
    cpu += spec.cpu * count;
    powergrid += spec.powergrid * count;
  }
  return { cpu, powergrid };
}

/**
 * Whole repeats of one cost that fit in what is left of each axis, and which
 * axis stopped it there.
 *
 * Shared by `fitColony` (repeats of a ratio block) and `spareCapacity`
 * (repeats of one pin) so the two cannot read an unbounded axis two different
 * ways — they used to disagree on the same input, one calling it unbounded and
 * the other reporting no room. One reading, in one place:
 *
 * - Zero on one axis is genuinely unbounded there, and the other axis decides.
 * - Zero on *both* is not a colony that fits infinitely many; it is cost data
 *   claiming a pin is free. `Infinity` repeats would scale the pin counts to
 *   `NaN` and a silent `0` would read as "no room", so neither is answered.
 * - A non-finite anywhere is caller error for the same reason: `NaN` slips
 *   past every comparison below and would surface as `blocks: NaN` with
 *   nothing in `limitedBy`, which is the shape reserved for "the overhead
 *   alone overruns".
 *
 * `what` names the offending cost, because on a bad payload the only useful
 * part of the failure is which pin kind carries it.
 *
 * `plus` is charged on top of every repeat but is deliberately *not* part of
 * the "draws nothing" check above: the thing that must carry a real cost is
 * the pin or block itself, and a zero `plus` is an ordinary, correct answer
 * (a caller with no link to charge). Folding the two together would let a
 * payload that prices a factory at nothing slip through on any colony whose
 * links happen to cost something, which is the one fault this check exists
 * to catch.
 */
function axisFit(
  left: PinLoad,
  cost: PinLoad,
  what: string,
  plus: PinLoad = { cpu: 0, powergrid: 0 }
): { blocks: number; limitedBy: ('cpu' | 'powergrid')[] } {
  if (!Number.isFinite(left.cpu) || !Number.isFinite(left.powergrid)) {
    throw new Error(
      `fitting ${what} needs a finite CPU and Powergrid remainder, got ${left.cpu} tf / ${left.powergrid} MW`
    );
  }
  if (!Number.isFinite(cost.cpu) || !Number.isFinite(cost.powergrid)) {
    throw new Error(
      `${what} draws a non-finite ${!Number.isFinite(cost.cpu) ? 'CPU' : 'Powergrid'}; its cost data is wrong`
    );
  }
  if (cost.cpu <= 0 && cost.powergrid <= 0) {
    throw new Error(`${what} draws no CPU and no Powergrid, so nothing bounds how many fit`);
  }
  if (!Number.isFinite(plus.cpu) || !Number.isFinite(plus.powergrid)) {
    throw new Error(
      `the surcharge on ${what} must be a finite CPU and Powergrid figure, got ${plus.cpu} tf / ${plus.powergrid} MW`
    );
  }

  const each = { cpu: cost.cpu + plus.cpu, powergrid: cost.powergrid + plus.powergrid };
  const byCpu = each.cpu > 0 ? left.cpu / each.cpu : Infinity;
  const byPowergrid = each.powergrid > 0 ? left.powergrid / each.powergrid : Infinity;
  const blocks = floorBlocks(Math.min(byCpu, byPowergrid));
  const limitedBy: ('cpu' | 'powergrid')[] = [];
  if (floorBlocks(byCpu) === blocks) limitedBy.push('cpu');
  if (floorBlocks(byPowergrid) === blocks) limitedBy.push('powergrid');
  return { blocks, limitedBy };
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

  // A budget axis that is not a finite, non-negative number is caller error,
  // not a fit: there is no honest block count to return for it, and `NaN`
  // would come back as `blocks: NaN` with an empty `limitedBy` — the shape
  // that means "the overhead alone overruns" and must mean nothing else. So
  // this joins the impossible head count and the empty block as a refusal
  // rather than becoming a fourth reading of the same result shape.
  if (
    !Number.isFinite(budget.cpu) ||
    !Number.isFinite(budget.powergrid) ||
    budget.cpu < 0 ||
    budget.powergrid < 0
  ) {
    throw new Error(
      `fitColony needs a finite, non-negative budget, got ${budget.cpu} tf / ${budget.powergrid} MW`
    );
  }

  // An empty block has no scale to solve for, and letting one through would
  // return zero blocks with nothing limiting them — which is exactly the
  // signal reserved for "the overhead alone overruns". Two different answers
  // must not share one shape.
  const blockPinCount = Object.values(block).reduce((sum, count) => sum + (count ?? 0), 0);
  if (blockPinCount <= 0) throw new Error('fitColony needs a block with at least one pin in it');

  const overheadPins: PinCounts = {
    launchpad: overhead.launchpads,
    storage: overhead.storageFacilities,
  };
  const overheadLoad = pinsLoad(overheadPins, infrastructure, { extractorHeads: 0 });
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

  const blockLoad = pinsLoad(block, infrastructure, {
    extractorHeads: (block.extractorControlUnit ?? 0) * headsPerExtractor,
  });
  // `axisFit` owns what an unbounded or unusable axis means, so a block priced
  // at nothing and a pin kind priced at nothing get the same answer here and
  // in `spareCapacity`. A non-finite overhead cost lands here too, since a
  // remainder is only as finite as the pin costs it was subtracted from.
  const { blocks, limitedBy } = axisFit(
    { cpu: cpuLeft, powergrid: powergridLeft },
    blockLoad,
    'this ratio block'
  );

  const pins = merge(overheadPins, scale(block, blocks));
  return {
    blocks,
    pins,
    used: pinsLoad(pins, infrastructure, {
      extractorHeads: (pins.extractorControlUnit ?? 0) * headsPerExtractor,
    }),
    budget,
    limitedBy,
  };
}

/**
 * How many more of each pin kind the leftover budget holds — the measured
 * headroom on a colony that already exists.
 *
 * `fitColony` answers "how big could this layout be"; this answers "what
 * could I still add to the layout I have". A built colony's `used` is read
 * off its own pins (`features/pi/adapters.ts`'s `colonyPinLoad`), so nothing
 * here is an estimate, and the per-kind answer is what makes the CPU/Powergrid
 * meter actionable rather than decorative: one number says a colony is 87%
 * full, six say it has room for three more factories and no extractor at all.
 *
 * Independent per kind, deliberately: these are alternatives, not a plan. Two
 * of one and one of another may well not fit together, and a caller rendering
 * this row has to say so — the shipped Advisor once joined the six counts into
 * one sentence, which read as a shopping list and promised a colony five pins
 * it had powergrid for one of.
 */
export interface SpareCapacityOptions {
  headsPerExtractor?: number;
  /**
   * What one link costs on this colony, charged once per pin counted.
   *
   * Nothing on a planet is reachable without a link, so a pin priced without
   * one is priced at less than it can ever be built for. The effect is not
   * cosmetic: a colony with 448 MW free was offered a 400 MW High-Tech plant
   * whose link cost 54 MW, and the pilot could not place it.
   *
   * A link's cost depends on the distance between the two pins it joins
   * (`linkCost.ts`), and where a pin that does not exist yet would go is not
   * knowable — so the figure has to come from the caller, which has the
   * colony's own measured links to average. Omitted means *unpriced*, not
   * free: a caller with no link to measure is quoting a ceiling, and owes the
   * reader that caveat.
   */
  newLinkCost?: PinLoad;
}

export function spareCapacity(
  used: PinLoad,
  budget: PinLoad,
  infrastructure: PiInfrastructure,
  opts: SpareCapacityOptions = {}
): Record<PiPinKind, number> {
  const cpuLeft = Math.max(0, budget.cpu - used.cpu);
  const powergridLeft = Math.max(0, budget.powergrid - used.powergrid);
  const heads = opts.headsPerExtractor ?? 0;
  const link = opts.newLinkCost ?? { cpu: 0, powergrid: 0 };

  const out = {} as Record<PiPinKind, number>;
  for (const [kind, spec] of Object.entries(infrastructure.pins) as [PiPinKind, PiPinSpec][]) {
    // An extractor is only worth counting with the heads it would carry —
    // a head-less ECU extracts nothing, so its bare cost is not the price of
    // a usable one.
    const extraCpu = kind === 'extractorControlUnit' ? infrastructure.extractorHead.cpu * heads : 0;
    const extraPowergrid =
      kind === 'extractorControlUnit' ? infrastructure.extractorHead.powergrid * heads : 0;
    // Same `axisFit` as the colony fit, so an unbounded axis cannot mean
    // "unbounded" there and "no room" here on identical cost data. Which axis
    // bound the count is not reported: per kind it is always the tighter of
    // two, and a caller comparing kinds gets that from the numbers themselves.
    // The link rides as `axisFit`'s surcharge rather than being folded into
    // the pin's cost, so a payload pricing a pin at nothing still fails loudly
    // on a colony whose links cost something.
    out[kind] = axisFit(
      { cpu: cpuLeft, powergrid: powergridLeft },
      { cpu: spec.cpu + extraCpu, powergrid: spec.powergrid + extraPowergrid },
      `pin kind ${kind}`,
      link
    ).blocks;
  }
  return out;
}

export interface CheckThroughputOptions {
  /**
   * Ratio blocks the colony runs — the scale `fitColony` arrived at. Positive:
   * a colony that fits none has no flow to check and would pass every test
   * here on a zero flow.
   */
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
  // A colony that fits no block moves nothing, and nothing that moves nothing
  // overflows a buffer or saturates a link — so every verdict this function
  // could reach at zero blocks would be `ok`, about a layout that cannot
  // exist. There is no honest verdict for it, so there is no verdict: the
  // scale has to be a real one, and `planColony` answers `does-not-fit`
  // instead of asking.
  if (!Number.isFinite(blocks) || blocks <= 0) {
    throw new Error(`checkThroughput needs a positive block count, got ${blocks}`);
  }
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

export interface PlanColonyOptions extends ChainBlockOptions, ThroughputOptions {
  budget: PinLoad;
  infrastructure: PiInfrastructure;
  overhead: FitColonyOptions['overhead'];
  headsPerExtractor: number;
}

export type PlanColonyResult =
  | {
      status: 'planned';
      /** The chain one target factory sustains — the shape the block repeats. */
      chain: PiChain;
      /** One ratio block's pins. */
      block: PinCounts;
      fit: ColonyFit;
      throughput: ThroughputCheck;
    }
  /**
   * The budget hosts no whole block, so there is no colony to check the
   * throughput of. Deliberately carries no `throughput` at all, the same way
   * `ChainCostNeedsExtractionRate` carries no cost: zero blocks move zero
   * material, which overflows nothing and saturates nothing, so any verdict
   * here would read as `ok` about a layout that cannot be built. `fit` still
   * comes back — which ceiling bound, and against what budget, is the whole
   * answer to "why not", and it is what a caller renders instead.
   */
  | { status: 'does-not-fit'; chain: PiChain; block: PinCounts; fit: ColonyFit }
  | (Extract<ChainBlockResult, { status: 'needs-extraction-rate' }> & { chain: PiChain })
  /** `typeId` is a P0 resource, or absent from the payload: no factory makes it, so there is no layout to plan. */
  | { status: 'not-a-product' };

/**
 * One call from "what should this planet build" to "how much of it fits, and
 * will it move".
 *
 * The three steps compose only one way — expand at one factory's rate, size
 * the block, fit it, then check the throughput at the scale the fit arrived at
 * — and both refusals have to be honoured on the way: the extraction rate
 * before any of it, and a fit of zero blocks before the throughput, which has
 * no colony to measure and would pass one that cannot be built. Left
 * as three exported functions, every call site would re-derive that order and
 * unwrap that refusal by hand, which is where a caller silently plans a
 * colony against a guessed rate. So this is the entry point; the pieces stay
 * exported for a caller that genuinely needs one of them alone (a built
 * colony reads its own pins and only wants `pinsLoad`).
 */
export function planColony(typeId: number, pi: PiData, opts: PlanColonyOptions): PlanColonyResult {
  const chain = singleFactoryChain(typeId, pi);
  if (chain === null) return { status: 'not-a-product' };

  const sized = chainBlockPins(chain, pi, opts);
  if (sized.status === 'needs-extraction-rate') return { ...sized, chain };

  const fit = fitColony({
    budget: opts.budget,
    infrastructure: opts.infrastructure,
    overhead: opts.overhead,
    block: sized.pins,
    headsPerExtractor: opts.headsPerExtractor,
  });
  if (fit.blocks <= 0) return { status: 'does-not-fit', chain, block: sized.pins, fit };

  const throughput = checkThroughput(chain, pi, {
    blocks: fit.blocks,
    pins: fit.pins,
    infrastructure: opts.infrastructure,
    sourcingFloor: opts.sourcingFloor,
    linkCapacityPerHour: opts.linkCapacityPerHour,
    bufferHours: opts.bufferHours,
  });
  return { status: 'planned', chain, block: sized.pins, fit, throughput };
}
