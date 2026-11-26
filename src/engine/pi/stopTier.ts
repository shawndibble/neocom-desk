import type { PiData, PiInfrastructure } from '@/sde/types';
import { CUSTOMS_TAXABLE_VALUE, chainCost, isP0 } from './chain';
import { checkThroughput, fitColony, planColony } from './pinBudget';
import type {
  ChainLayout,
  ColonyFit,
  PinCounts,
  FitColonyOptions,
  PiChain,
  PiTier,
  PinLoad,
  ThroughputCheck,
  ThroughputOptions,
} from './types';

export interface StopTierOptions {
  localResources: readonly number[];
  budget: PinLoad;
  infrastructure: PiInfrastructure;
  overhead: FitColonyOptions['overhead'];
  headsPerExtractor: number;
  extractionRatePerHour: number;
  prices: Readonly<Record<number, number>>;
  revenuePrices?: Readonly<Record<number, number>>;
  taxRate: number;
  salesTaxPct: number;
  linkCapacityPerHour: ThroughputOptions['linkCapacityPerHour'];
  bufferHours: ThroughputOptions['bufferHours'];
  newLinkCost?: PinLoad;
  extraExtractorYieldFactor?: number;
}

export const DEFAULT_EXTRA_EXTRACTOR_YIELD_FACTOR = 0.8;

const LAYOUT: ChainLayout = 'single-planet';

interface CandidateBase {
  typeId: number;
  name: string;
  tier: PiTier;
}

export interface ScoredStopTier extends CandidateBase {
  status: 'scored';
  blocks: number;
  pins: PinCounts;
  used: PinLoad;
  limitedBy: ColonyFit['limitedBy'];
  unitsPerHour: number;
  marginPerUnit: number;
  marginPerHour: number;
  throughput: ThroughputCheck;
}

export type StopTierEntry =
  | ScoredStopTier
  | (CandidateBase & { status: 'does-not-fit'; fit: ColonyFit })
  | (CandidateBase & { status: 'rejected-throughput'; throughput: ThroughputCheck })
  | (CandidateBase & { status: 'needs-price'; missing: number[] });

export type StopTierBlocker =
  'does-not-fit' | 'needs-prices' | 'throughput' | 'unprofitable' | 'mixed';

export type StopTierAdvice =
  | { kind: 'recommended'; best: ScoredStopTier; entries: StopTierEntry[] }
  | { kind: 'no-recommendation'; blocker: StopTierBlocker; entries: StopTierEntry[] }
  | { kind: 'nothing-to-score'; entries: [] };

function p0Closure(typeId: number, pi: PiData, seen = new Set<number>()): Set<number> {
  const out = new Set<number>();
  if (isP0(typeId, pi)) {
    out.add(typeId);
    return out;
  }
  const schematic = pi.schematics[String(typeId)];
  if (!schematic || seen.has(typeId)) return out;
  const next = new Set(seen).add(typeId);
  for (const input of schematic.inputs) {
    for (const id of p0Closure(input.typeID, pi, next)) out.add(id);
  }
  return out;
}

export function localChainTargets(localResources: readonly number[], pi: PiData): number[] {
  const local = new Set(localResources);
  if (local.size === 0) return [];
  return Object.keys(pi.schematics)
    .map(Number)
    .filter((typeId) => {
      const needed = p0Closure(typeId, pi);
      return needed.size > 0 && [...needed].every((id) => local.has(id));
    });
}

function rawChain(typeId: number, name: string, ratePerHour: number): PiChain {
  return {
    targetTypeId: typeId,
    targetPerHour: ratePerHour,
    nodes: [
      {
        typeId,
        name,
        tier: 0,
        unitsPerHour: ratePerHour,
        cycleTimeSeconds: null,
        outputPerCycle: null,
        cyclesPerHour: null,
        outputPerHour: null,
        factoryPins: null,
        inputs: [],
      },
    ],
  };
}

function priceOf(typeId: number, prices: Readonly<Record<number, number>>): number | null {
  const price = prices[typeId];
  return price != null && Number.isFinite(price) ? price : null;
}

function extractionFalloffRatio(n: number, factor: number): number {
  return (1 + (n - 1) * factor) / n;
}

const CEILING_EPSILON = 1e-9;

function extractorsPerBlock(demandPerHour: number, ratePerHour: number): number {
  return Math.ceil(demandPerHour / ratePerHour - CEILING_EPSILON);
}

function madeTierFalloffRatio(
  chain: PiChain,
  blocks: number,
  ratePerHour: number,
  factor: number
): number {
  const ratios = chain.nodes
    .filter((node) => node.tier === 0)
    .map((node) =>
      extractionFalloffRatio(blocks * extractorsPerBlock(node.unitsPerHour, ratePerHour), factor)
    );
  return Math.min(...ratios);
}

function rejectOrScore(
  base: CandidateBase,
  fit: ColonyFit,
  throughput: ThroughputCheck,
  unitsPerHour: number,
  marginPerUnit: number
): StopTierEntry {
  if (throughput.verdict === 'buffer-overflow' || throughput.verdict === 'link-capacity') {
    return { ...base, status: 'rejected-throughput', throughput };
  }
  return {
    ...base,
    status: 'scored',
    blocks: fit.blocks,
    pins: fit.pins,
    used: fit.used,
    limitedBy: fit.limitedBy,
    unitsPerHour,
    marginPerUnit,
    marginPerHour: unitsPerHour * marginPerUnit,
    throughput,
  };
}

function scoreRawResource(
  typeId: number,
  name: string,
  fit: ColonyFit,
  pi: PiData,
  opts: StopTierOptions
): StopTierEntry {
  const base = { typeId, name, tier: 0 as PiTier };
  if (fit.blocks <= 0) return { ...base, status: 'does-not-fit', fit };

  const price = priceOf(typeId, opts.revenuePrices ?? opts.prices);
  if (price === null) return { ...base, status: 'needs-price', missing: [typeId] };

  const throughput = checkThroughput(rawChain(typeId, name, opts.extractionRatePerHour), pi, {
    blocks: fit.blocks,
    pins: fit.pins,
    infrastructure: opts.infrastructure,
    sourcingFloor: 'P0',
    linkCapacityPerHour: opts.linkCapacityPerHour,
    bufferHours: opts.bufferHours,
  });

  const netPrice = price * (1 - opts.salesTaxPct / 100);
  const marginPerUnit = netPrice - opts.taxRate * CUSTOMS_TAXABLE_VALUE[0];
  const factor = opts.extraExtractorYieldFactor ?? DEFAULT_EXTRA_EXTRACTOR_YIELD_FACTOR;
  const unitsPerHour =
    fit.blocks * opts.extractionRatePerHour * extractionFalloffRatio(fit.blocks, factor);
  return rejectOrScore(base, fit, throughput, unitsPerHour, marginPerUnit);
}

function scoreProduct(typeId: number, pi: PiData, opts: StopTierOptions): StopTierEntry | null {
  const plan = planColony(typeId, pi, {
    budget: opts.budget,
    infrastructure: opts.infrastructure,
    overhead: opts.overhead,
    headsPerExtractor: opts.headsPerExtractor,
    ...(opts.newLinkCost ? { newLinkCost: opts.newLinkCost } : {}),
    sourcingFloor: 'P0',
    extractionRatePerHour: opts.extractionRatePerHour,
    linkCapacityPerHour: opts.linkCapacityPerHour,
    bufferHours: opts.bufferHours,
  });
  if (plan.status === 'not-a-product' || plan.status === 'needs-extraction-rate') return null;
  const node = plan.chain.nodes.find((entry) => entry.typeId === typeId);
  const base = { typeId, name: node?.name ?? String(typeId), tier: node?.tier ?? (1 as PiTier) };
  if (plan.status === 'does-not-fit') return { ...base, status: 'does-not-fit', fit: plan.fit };

  const missing = [
    ...new Set([typeId, ...plan.chain.nodes.filter((n) => n.tier === 0).map((n) => n.typeId)]),
  ].filter((id) => priceOf(id, opts.prices) === null);
  if (missing.length > 0) return { ...base, status: 'needs-price', missing };

  const cost = chainCost(plan.chain, {
    ...(opts.revenuePrices ? { revenuePrices: opts.revenuePrices } : {}),
    sourcedBasis: 'own' as const,
    prices: opts.prices,
    sourcingFloor: 'P0',
    layout: LAYOUT,
    taxRate: opts.taxRate,
    salesTaxPct: opts.salesTaxPct,
    extractionRate: opts.extractionRatePerHour,
  });
  if (cost.status !== 'costed') return { ...base, status: 'needs-price', missing: [typeId] };

  const factor = opts.extraExtractorYieldFactor ?? DEFAULT_EXTRA_EXTRACTOR_YIELD_FACTOR;
  const unitsPerHour =
    plan.fit.blocks *
    plan.chain.targetPerHour *
    madeTierFalloffRatio(plan.chain, plan.fit.blocks, opts.extractionRatePerHour, factor);
  return rejectOrScore(base, plan.fit, plan.throughput, unitsPerHour, cost.margin);
}

const MARGIN_TIE_EPSILON = 1e-6;

function marginsTied(a: number, b: number): boolean {
  return Math.abs(a - b) <= MARGIN_TIE_EPSILON * Math.max(Math.abs(a), Math.abs(b));
}

function bestOf(scored: readonly ScoredStopTier[]): ScoredStopTier {
  const top = scored.reduce((max, entry) => Math.max(max, entry.marginPerHour), -Infinity);
  return scored
    .filter((entry) => marginsTied(entry.marginPerHour, top) || entry.marginPerHour === top)
    .reduce((best, entry) =>
      entry.tier < best.tier || (entry.tier === best.tier && entry.typeId < best.typeId)
        ? entry
        : best
    );
}

const BLOCKER_BY_STATUS: Readonly<Record<StopTierEntry['status'], StopTierBlocker>> = {
  'does-not-fit': 'does-not-fit',
  'needs-price': 'needs-prices',
  'rejected-throughput': 'throughput',
  scored: 'unprofitable',
};

function blockerFor(entries: readonly StopTierEntry[]): StopTierBlocker {
  const fitted = entries.filter((entry) => entry.status !== 'does-not-fit');
  if (fitted.length === 0) return 'does-not-fit';
  const statuses = new Set(fitted.map((entry) => entry.status));
  return statuses.size === 1 ? BLOCKER_BY_STATUS[[...statuses][0]] : 'mixed';
}

export function recommendStopTier(opts: StopTierOptions, pi: PiData): StopTierAdvice {
  const local = new Set(opts.localResources);
  const rawFit = fitColony({
    budget: opts.budget,
    infrastructure: opts.infrastructure,
    overhead: opts.overhead,
    block: { extractorControlUnit: 1 },
    headsPerExtractor: opts.headsPerExtractor,
    ...(opts.newLinkCost ? { newLinkCost: opts.newLinkCost } : {}),
  });
  const rawEntries = pi.raw
    .filter((resource) => local.has(resource.typeID))
    .map((resource) => scoreRawResource(resource.typeID, resource.name, rawFit, pi, opts));
  const madeEntries = localChainTargets(opts.localResources, pi)
    .map((typeId) => scoreProduct(typeId, pi, opts))
    .filter((entry): entry is StopTierEntry => entry !== null);

  const entries = [...rawEntries, ...madeEntries];
  if (entries.length === 0) return { kind: 'nothing-to-score', entries: [] };

  const scored = entries
    .filter((entry): entry is ScoredStopTier => entry.status === 'scored')
    .filter((entry) => entry.marginPerHour > 0);
  if (scored.length === 0) {
    return { kind: 'no-recommendation', blocker: blockerFor(entries), entries };
  }
  return { kind: 'recommended', best: bestOf(scored), entries };
}
