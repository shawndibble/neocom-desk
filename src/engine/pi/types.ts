/**
 * Engine-native PI shapes, in two groups.
 *
 * Colony health: an extractor program's expiry, the one field ESI keeps
 * current without the colony being opened in the client
 * (https://developers.eveonline.com/docs/guides/pi/). Adapted from the ESI
 * `pins[]` shape at the feature boundary (`features/pi/adapters.ts`), same
 * convention as `engine/industry/types.ts`.
 *
 * Production chains: the shapes `chain.ts` expands and costs. They live here
 * rather than beside the functions because a feature layer needs them to build
 * its own controls — a sourcing-floor picker and a layout picker are UI over
 * `SourcingFloor` and `ChainLayout` — and because the cost result is the seam
 * a caller renders. `chain.ts` re-exports them, so either import path works.
 */

export interface ExtractorProgram {
  pinId: number;
  expiryTimeMs: number;
  /**
   * Install-time baseline for the yield curve (`engine/pi/extraction.ts`).
   * Optional because ESI marks every one of `qty_per_cycle`, `cycle_time` and
   * `install_time` optional — a pin with a trustworthy `expiry_time` but no
   * quantity still counts for colony health, it just can't be projected.
   * `hasYieldBaseline` narrows a program to `ExtractorYieldProgram` when all
   * three are present and usable.
   */
  qtyPerCycle?: number;
  cycleTimeMs?: number;
  installTimeMs?: number;
}

/** An `ExtractorProgram` whose install-time baseline is complete enough to project. */
export interface ExtractorYieldProgram extends ExtractorProgram {
  qtyPerCycle: number;
  cycleTimeMs: number;
  installTimeMs: number;
}

export type ExtractorState = 'active' | 'expiring-soon' | 'expired';

export interface ColonyStatus {
  /** True when any extractor program has already expired. */
  idle: boolean;
  /** Soonest expiry across the colony's extractor programs; null when it has none. */
  soonestExpiryMs: number | null;
}

export type ColonyAttention = 'idle' | 'expiring-soon' | 'healthy';

/** Planetary tier, derived from the recipe graph — never from a hardcoded table. */
export type PiTier = 0 | 1 | 2 | 3 | 4;

/** Buy at or below this tier, make above it. `P0` means supply your own P0. */
export type SourcingFloor = 'P0' | 'P1' | 'P2' | 'P3';

/**
 * How the made tiers are grouped onto planets. Customs is charged only where
 * this puts a planet boundary, so this is what decides the tax bill — two
 * tiers made on one planet pay nothing between them.
 */
export type ChainLayout = 'single-planet' | 'planet-per-tier';

/** One schematic input line, as the chain carries it. */
export interface ChainInput {
  typeId: number;
  /** Units consumed per cycle of the parent schematic. */
  quantityPerCycle: number;
}

export interface ChainNode {
  typeId: number;
  name: string;
  tier: PiTier;
  /** Units this node must supply per hour to sustain the chain's target rate. */
  unitsPerHour: number;
  /** Null on P0: extracted, not produced by a schematic. */
  cycleTimeSeconds: number | null;
  /** Null on P0. */
  outputPerCycle: number | null;
  /** Null on P0. */
  cyclesPerHour: number | null;
  /** Null on P0. Derived from the schematic itself: 40/5/3/1 per hour at P1..P4. */
  outputPerHour: number | null;
  /** `ceil(unitsPerHour / outputPerHour)`. Null on P0, which is never given a factory. */
  factoryPins: number | null;
  /** Empty on P0. */
  inputs: readonly ChainInput[];
}

export interface PiChain {
  targetTypeId: number;
  targetPerHour: number;
  /** Target first, then descending tier. */
  nodes: readonly ChainNode[];
}

export interface ExpandChainOptions {
  /** Units of the target to produce per hour. */
  unitsPerHour: number;
}

/** One tier bought off the market to feed the chain, per unit of the target. */
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
  /** `ceil(unitsPerHour / ratePerHour)`. */
  extractors: number;
}

export interface ExtractionPlan {
  /** Sustained units per hour one extractor program yields, exactly as the caller gave it. */
  ratePerHour: number;
  totalExtractors: number;
  byType: readonly ExtractionLine[];
}

export interface ChainCostBreakdown {
  status: 'costed';
  sourcingFloor: SourcingFloor;
  layout: ChainLayout;
  taxRate: number;
  /** Planets the layout uses for the made tiers. */
  planetCount: number;
  sourced: readonly SourcedLine[];
  /** ISK to acquire the floor-tier inputs for one unit of the target. */
  sourcedCost: number;
  /** Taxable value crossing a customs boundary per unit of the target. `taxCost = taxRate * taxBase`. */
  taxBase: number;
  taxCost: number;
  /** `sourcedCost + taxCost`. Excludes what this module cannot see: no POCO fuel, no hauling, no time. */
  totalCost: number;
  /** The target's own unit price, as supplied. */
  revenue: number;
  /** `revenue - totalCost`, per unit. No sales tax or broker fee: a chain's output is not assumed listed. */
  margin: number;
  /** Non-null only on the P0 floor, which is the only one that extracts. */
  extraction: ExtractionPlan | null;
}

/**
 * The P0 floor without an extraction rate. Deliberately carries no cost field
 * at all: there is no honest number to put in one, and a zero would read as
 * "free".
 */
export interface ChainCostNeedsExtractionRate {
  status: 'needs-extraction-rate';
  sourcingFloor: 'P0';
  /** What an assumption would have to cover, so a caller can ask for it precisely. */
  p0PerHour: readonly { typeId: number; name: string; unitsPerHour: number }[];
}

export type ChainCostResult = ChainCostBreakdown | ChainCostNeedsExtractionRate;

export interface ChainCostOptions {
  /**
   * ISK per unit by typeId. Must cover the target and every tier the floor
   * buys — a silently missing price would understate cost, so it throws.
   */
  prices: Readonly<Record<number, number>>;
  sourcingFloor: SourcingFloor;
  layout: ChainLayout;
  /** Defaults to the highsec NPC base rate. Never derived here. */
  taxRate?: number;
  /**
   * Sustained units per hour one extractor program yields, which already bakes
   * in richness, head count, head placement and cycle time. `null` (or
   * omitted, or non-positive) means "not known", which is a first-class state
   * — a user with no colonies has no rate to give.
   *
   * Derive it from a real program with `engine/pi/extraction.ts`
   * (`programTotalYield` over the program's length), not from raw
   * `qty_per_cycle`: output decays across a program, so `qty_per_cycle`
   * overstates a 14-day program by ~150%.
   */
  extractionRate?: number | null;
}
