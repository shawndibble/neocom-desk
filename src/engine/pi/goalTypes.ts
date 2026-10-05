/**
 * Shapes for the goal planner: "here are my colonies and the products I want
 * per day — what should each colony do, what do I buy, and is it worth more
 * than what my colonies would earn anyway?"
 *
 * Four modules share them, in dependency order:
 *
 * - `colonyCapacity.ts` — what one colony can extract and refine to P1, as a
 *   set of extraction slots fitted against its CPU/Powergrid.
 * - `baseline.ts` — the **Baseline**: every colony selling its best P1. Every
 *   ISK figure the planner shows is a **Lift** over this, so extracted P0 is
 *   never priced at zero.
 * - `goalPlan.ts` — the greedy solver: goals → demand → colony assignments,
 *   buys and shortfalls.
 * - `planEconomics.ts` / `planDiff.ts` — the plan's ISK ledger against the
 *   Baseline, and the plan as a change list against what each colony runs now.
 *
 * Pure: every payload (`PiData`, prices, colony facts) arrives as a
 * parameter. The feature layer (`features/pi/goalPlannerModel.ts`) adapts ESI
 * colonies into `PlannerColony`.
 */

import type { PiRawResource } from '@/sde/types';
import type { PinLoad, PiTier } from './types';

/** A planet type as the SDE names it — the same strings ESI reports for a colony. */
export type PlanetType = PiRawResource['planetTypes'][number];

/** Where a per-ECU extraction rate came from, strongest first. */
export type RateSource =
  /** This colony's own running program for this P0, re-projected at the pilot's restart cadence. */
  | 'measured'
  /** The mean of the pilot's own measured programs: this colony does not extract this P0 today. */
  | 'own-mean'
  /** The pilot's typed fallback: nothing measured to lean on. */
  | 'assumed';

export interface EcuRate {
  /** Sustained P0 units per hour one Extractor Control Unit yields on this colony. */
  unitsPerHour: number;
  source: RateSource;
}

/** One colony as the planner sees it. Built by the feature layer from ESI + SDE. */
export interface PlannerColony {
  planetId: number;
  planetType: PlanetType;
  /**
   * What the Command Center supplies at the colony's own upgrade level. The
   * plan rebuilds the colony's production pins, so this is the whole supply,
   * not what is left after today's pins.
   */
  budget: PinLoad;
  /** What one new link costs on this colony, charged once per planned pin. */
  newLinkCost: PinLoad;
  /** Heads fitted per ECU, read off the colony's own extractors (or a caller default for an unbuilt layout). */
  headsPerExtractor: number;
  /** This colony's own customs rate, 0..1 (POCO owner tax after Customs Code Expertise). */
  taxRate: number;
  /**
   * Per-ECU rate for each P0 this colony's planet type can yield. A P0 the
   * planet cannot yield is absent, never zero.
   */
  ratePerEcu: ReadonlyMap<number, EcuRate>;
  /** What the colony runs today — the "from" side of the change list. */
  current: {
    p0TypeIds: readonly number[];
    productTypeIds: readonly number[];
  };
}

/** A product the pilot wants, at a rate. */
export interface Goal {
  typeId: number;
  unitsPerDay: number;
}

export interface PlannerPolicy {
  /** ECUs one colony may run in total, across all its slots. */
  maxEcusPerColony: number;
  /** Distinct P0 types one colony may extract: one ECU each, or two ECUs on one. */
  maxP0TypesPerColony: 1 | 2;
  /**
   * What each ECU after the first on the *same* P0 yields relative to the
   * first, since a second program on one resource competes for the same hot
   * spots. `stopTier.ts`'s `DEFAULT_EXTRA_EXTRACTOR_YIELD_FACTOR`.
   */
  extraEcuFactor: number;
  /** Tiers the pilot is willing to buy at the hub. Empty means "make everything or call it short". */
  buyTiers: readonly PiTier[];
}

/** Hub prices. The ask is what buying costs; the bid is what selling earns. */
export interface PriceBooks {
  ask: Readonly<Record<number, number>>;
  bid: Readonly<Record<number, number>>;
  /** Percent, e.g. 3.6. Charged on every sale. */
  salesTaxPct: number;
}

/** One extractor program group on a colony: ECUs on one P0, refined to its P1 on the spot. */
export interface ExtractionSlot {
  p0TypeId: number;
  p1TypeId: number;
  ecus: number;
  p0PerHour: number;
  p1PerHour: number;
  basicFactories: number;
  rateSource: RateSource;
}

export type FitLimit = 'cpu' | 'powergrid';
