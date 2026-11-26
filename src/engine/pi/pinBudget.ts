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

export const EXTRACTOR_HEADS_MAX = 10;

const SECONDS_PER_HOUR = 3_600;

const FLOOR_EPSILON = 1e-9;

function floorBlocks(value: number): number {
  return Math.max(0, Math.floor(value + FLOOR_EPSILON));
}

export function singleFactoryRate(typeId: number, pi: PiData): number | null {
  const schematic = pi.schematics[String(typeId)];
  if (!schematic) return null;
  return (schematic.quantity * SECONDS_PER_HOUR) / schematic.cycleTime;
}

export function singleFactoryChain(typeId: number, pi: PiData): PiChain | null {
  const rate = singleFactoryRate(typeId, pi);
  if (rate === null) return null;
  return expandChain(typeId, pi, { unitsPerHour: rate });
}

export type ChainBlockResult =
  | { status: 'sized'; pins: PinCounts }
  | {
      status: 'needs-extraction-rate';
      p0PerHour: readonly { typeId: number; name: string; unitsPerHour: number }[];
    };

export interface ChainBlockOptions {
  sourcingFloor: SourcingFloor;
  extractionRatePerHour?: number | null;
}

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

  if (sourcingFloor === 'P0' && rate !== null) {
    for (const node of p0Nodes) {
      add('extractorControlUnit', Math.ceil(node.unitsPerHour / rate - FLOOR_EPSILON));
    }
  }

  return { status: 'sized', pins };
}

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
  if (
    !Number.isFinite(plus.cpu) ||
    !Number.isFinite(plus.powergrid) ||
    plus.cpu < 0 ||
    plus.powergrid < 0
  ) {
    throw new Error(
      `the surcharge on ${what} must be a finite, non-negative CPU and Powergrid figure, got ${plus.cpu} tf / ${plus.powergrid} MW`
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

export function fitColony(opts: FitColonyOptions): ColonyFit {
  const { budget, infrastructure, overhead, block, headsPerExtractor, newLinkCost } = opts;
  if (
    !Number.isInteger(headsPerExtractor) ||
    headsPerExtractor < 0 ||
    headsPerExtractor > EXTRACTOR_HEADS_MAX
  ) {
    throw new Error(
      `an Extractor Control Unit carries 0-${EXTRACTOR_HEADS_MAX} heads, got ${headsPerExtractor}`
    );
  }

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
  const blockLinkCost = newLinkCost
    ? { cpu: newLinkCost.cpu * blockPinCount, powergrid: newLinkCost.powergrid * blockPinCount }
    : { cpu: 0, powergrid: 0 };
  const { blocks, limitedBy } = axisFit(
    { cpu: cpuLeft, powergrid: powergridLeft },
    blockLoad,
    'this ratio block',
    blockLinkCost
  );

  const pins = merge(overheadPins, scale(block, blocks));
  const pinLoad = pinsLoad(pins, infrastructure, {
    extractorHeads: (pins.extractorControlUnit ?? 0) * headsPerExtractor,
  });
  return {
    blocks,
    pins,
    used: {
      cpu: pinLoad.cpu + blockLinkCost.cpu * blocks,
      powergrid: pinLoad.powergrid + blockLinkCost.powergrid * blocks,
    },
    budget,
    limitedBy,
  };
}

export interface SpareCapacityOptions {
  headsPerExtractor?: number;
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
    const extraCpu = kind === 'extractorControlUnit' ? infrastructure.extractorHead.cpu * heads : 0;
    const extraPowergrid =
      kind === 'extractorControlUnit' ? infrastructure.extractorHead.powergrid * heads : 0;
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
  blocks: number;
  pins: PinCounts;
  infrastructure: PiInfrastructure;
  sourcingFloor: SourcingFloor;
  linkCapacityPerHour: ThroughputOptions['linkCapacityPerHour'];
  bufferHours: ThroughputOptions['bufferHours'];
}

export function checkThroughput(
  chain: PiChain,
  pi: PiData,
  opts: CheckThroughputOptions
): ThroughputCheck {
  const { blocks, pins, infrastructure, sourcingFloor, linkCapacityPerHour, bufferHours } = opts;
  if (!Number.isFinite(blocks) || blocks <= 0) {
    throw new Error(`checkThroughput needs a positive block count, got ${blocks}`);
  }
  const floorTier = SOURCING_FLOOR_TIER[sourcingFloor];
  const rawVolume = new Map(pi.raw.map((resource) => [resource.typeID, resource.volume]));

  let flowPerHourM3 = 0;
  for (const node of chain.nodes) {
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

  const verdict =
    bufferNeedM3 > bufferM3
      ? 'buffer-overflow'
      : linkCapacityPerHour === null
        ? 'link-capacity-unknown'
        : flowPerHourM3 > linkCapacityPerHour
          ? 'link-capacity'
          : 'ok';

  const hoursToFull = flowPerHourM3 > 0 ? bufferM3 / flowPerHourM3 : null;

  return { verdict, flowPerHourM3, bufferM3, bufferNeedM3, hoursToFull, linkCapacityPerHour };
}

export interface PlanColonyOptions extends ChainBlockOptions, ThroughputOptions {
  budget: PinLoad;
  infrastructure: PiInfrastructure;
  overhead: FitColonyOptions['overhead'];
  headsPerExtractor: number;
  newLinkCost?: PinLoad;
}

export type PlanColonyResult =
  | {
      status: 'planned';
      chain: PiChain;
      block: PinCounts;
      fit: ColonyFit;
      throughput: ThroughputCheck;
    }
  | { status: 'does-not-fit'; chain: PiChain; block: PinCounts; fit: ColonyFit }
  | (Extract<ChainBlockResult, { status: 'needs-extraction-rate' }> & { chain: PiChain })
  | { status: 'not-a-product' };

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
    ...(opts.newLinkCost ? { newLinkCost: opts.newLinkCost } : {}),
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
