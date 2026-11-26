import type { PiInfrastructure, PiPinKind } from '@/sde/types';

export interface ExtractorProgram {
  pinId: number;
  expiryTimeMs: number;
  qtyPerCycle?: number;
  cycleTimeMs?: number;
  installTimeMs?: number;
}

export interface ExtractorYieldProgram extends ExtractorProgram {
  qtyPerCycle: number;
  cycleTimeMs: number;
  installTimeMs: number;
}

export type ExtractorState = 'active' | 'expiring-soon' | 'expired';

export interface ColonyStatus {
  idle: boolean;
  soonestExpiryMs: number | null;
  decayed?: boolean;
}

export type ColonyAttention = 'idle' | 'expiring-soon' | 'decayed' | 'healthy';

export type PiTier = 0 | 1 | 2 | 3 | 4;

export type SourcingFloor = 'P0' | 'P1' | 'P2' | 'P3';

export type ChainLayout = 'single-planet' | 'planet-per-tier';

export interface ChainInput {
  typeId: number;
  quantityPerCycle: number;
}

export interface ChainNode {
  typeId: number;
  name: string;
  tier: PiTier;
  unitsPerHour: number;
  cycleTimeSeconds: number | null;
  outputPerCycle: number | null;
  cyclesPerHour: number | null;
  outputPerHour: number | null;
  factoryPins: number | null;
  inputs: readonly ChainInput[];
}

export interface PiChain {
  targetTypeId: number;
  targetPerHour: number;
  nodes: readonly ChainNode[];
}

export interface ExpandChainOptions {
  unitsPerHour: number;
}

export interface SourcedLine {
  typeId: number;
  name: string;
  tier: PiTier;
  units: number;
  unitPrice: number;
  cost: number;
}

export interface ExtractionLine {
  typeId: number;
  name: string;
  unitsPerHour: number;
  extractors: number;
}

export interface ExtractionPlan {
  ratePerHour: number;
  totalExtractors: number;
  byType: readonly ExtractionLine[];
}

export interface ChainCostBreakdown {
  status: 'costed';
  sourcingFloor: SourcingFloor;
  layout: ChainLayout;
  taxRate: number;
  planetCount: number;
  sourced: readonly SourcedLine[];
  sourcedCost: number;
  taxBase: number;
  taxCost: number;
  totalCost: number;
  revenue: number;
  salesTax: number;
  salesTaxPct: number;
  margin: number;
  extraction: ExtractionPlan | null;
}

export interface ChainCostNeedsExtractionRate {
  status: 'needs-extraction-rate';
  sourcingFloor: 'P0';
  p0PerHour: readonly { typeId: number; name: string; unitsPerHour: number }[];
}

export type ChainCostResult = ChainCostBreakdown | ChainCostNeedsExtractionRate;

export interface ChainCostOptions {
  prices: Readonly<Record<number, number>>;
  revenuePrices?: Readonly<Record<number, number>>;
  sourcingFloor: SourcingFloor;
  sourcedBasis?: 'buy' | 'own';
  ownSourcedIds?: ReadonlySet<number>;
  layout: ChainLayout;
  taxRate?: number;
  salesTaxPct?: number;
  extractionRate?: number | null;
}

export interface PinLoad {
  cpu: number;
  powergrid: number;
}

export type PinCounts = Readonly<Partial<Record<PiPinKind, number>>>;

export interface PinOverhead {
  launchpads: number;
  storageFacilities: number;
}

export interface FitColonyOptions {
  budget: PinLoad;
  infrastructure: PiInfrastructure;
  overhead: PinOverhead;
  block: PinCounts;
  headsPerExtractor: number;
  newLinkCost?: PinLoad;
}

export interface ColonyFit {
  blocks: number;
  pins: PinCounts;
  used: PinLoad;
  budget: PinLoad;
  limitedBy: readonly ('cpu' | 'powergrid')[];
}

export type ThroughputVerdict =
  'ok' | 'link-capacity' | 'buffer-overflow' | 'link-capacity-unknown';

export interface ThroughputCheck {
  verdict: ThroughputVerdict;
  flowPerHourM3: number;
  bufferM3: number;
  bufferNeedM3: number;
  hoursToFull: number | null;
  linkCapacityPerHour: number | null;
}

export interface ThroughputOptions {
  linkCapacityPerHour: number | null;
  bufferHours: number;
}
