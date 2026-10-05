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

import type { PiFactoryKind, PiRawResource } from '@/sde/types';
import type { PinCounts, PinLoad, PiTier } from './types';

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
    /**
     * ECUs the colony runs today on each P0. Optional: a caller that cannot
     * count them leaves it out. When present, an extraction within it is
     * accepted as fitting without a model check — see `colonyCapacity.ts`.
     */
    ecusByP0?: ReadonlyMap<number, number>;
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

// --- The solver's answer (goalPlan.ts), read by planEconomics.ts and planDiff.ts ---

/**
 * How a demanded type is covered, with `DemandLine.madeFraction` saying how
 * much of it the plan makes:
 *
 * - `'short'` — this line has a gap of its own (a budget gap on its P1, or a
 *   P2+ that does not reach its rate);
 * - `'bought'` — a P1 whose uncovered part is bought (the made part is
 *   `madeFraction`);
 * - `'made'` / `'extracted'` — no gap of its own. `madeFraction` under 1 then
 *   means it is rationed by a scarcer input elsewhere, not short itself;
 * - `'not-extracted'` — a P0 whose P1 is bought in full: nothing is extracted.
 */
export type DemandSource = 'made' | 'bought' | 'short' | 'extracted' | 'not-extracted';

/** One type the goals need, summed across every goal that needs it. */
export interface DemandLine {
  typeId: number;
  tier: PiTier;
  unitsPerHour: number;
  /** Factories of this schematic, re-ceiled on the summed rate. Null on P0, which no factory makes. */
  factories: number | null;
  source: DemandSource;
  /** 0..1: the share of `unitsPerHour` the plan makes (extracts, for a P0). */
  madeFraction: number;
}

/**
 * `'baseline'` is a colony the plan does not need: it keeps selling its best
 * P1, credited at its Baseline. `'idle'` is only a colony with no priced
 * Baseline to fall back on.
 */
export type ColonyRole = 'extract' | 'factory' | 'baseline' | 'idle';

export interface ColonyAssignment {
  planetId: number;
  role: ColonyRole;
  /** What it extracts: the plan's slots (the host's too), or its Baseline's. Empty when idle. */
  slots: ExtractionSlot[];
  /** The P2+ factory pins on the host. Empty unless `role` is `'factory'`. */
  factories: PinCounts;
  /** Every planned pin, the Launchpad included. Empty for an idle colony. */
  pins: PinCounts;
  used: PinLoad;
  budget: PinLoad;
  /** The axes the host's factories overrun. Always empty for an extractor, which is only ever planned to fit. */
  limitedBy: FitLimit[];
  /**
   * The extraction is the colony's own layout today (`colonyExtraction`'s
   * `runningToday`): accepted as fitting, so `used` — the model's estimate —
   * may exceed `budget` without that being an overrun.
   */
  runningToday?: true;
}

export type Shortfall =
  /** No enabled colony's planet type yields this P0. `unitsPerHour` is P0 units; `p1TypeId` is what it was for. */
  | {
      kind: 'type-gap';
      p0TypeId: number;
      p1TypeId: number;
      unitsPerHour: number;
      /** The same gap in P1 units/h — the figure a pilot buys or plans in. */
      p1UnitsPerHour: number;
      fixPlanetTypes: PlanetType[];
    }
  /** No colony that yields it can take more. `unitsPerHour` is P0 units; `p1UnitsPerHour` P1. */
  | {
      kind: 'budget-gap';
      p0TypeId: number;
      p1TypeId: number;
      unitsPerHour: number;
      p1UnitsPerHour: number;
    }
  /** P2+ is demanded but no enabled colony's planet type carries every factory the chain needs. */
  | { kind: 'no-factory-host'; facility: PiFactoryKind }
  /** The host was chosen but its factories overrun its CPU/Powergrid. */
  | { kind: 'host-over-budget'; planetId: number; limitedBy: FitLimit[] };

/** Either end of a haul: a colony by planet id, or the trade hub. */
export type FlowEnd = number | 'hub';

/**
 * One leg of goods moving per hour. The plan's whole routing ledger: a colony
 * origin pays that colony's export customs, a colony destination its import
 * customs, a hub destination is a sale and a hub origin a purchase.
 * `'hub'` → `'hub'` is a goal bought outright: bought, never hauled. A
 * colony → the same colony is the host feeding itself: no customs, no haul.
 */
export interface Flow {
  from: FlowEnd;
  to: FlowEnd;
  typeId: number;
  tier: PiTier;
  unitsPerHour: number;
}

/**
 * Why this colony hosts the factories. `planGoals` alone picks by scarcity
 * (`'least-needed-extraction'`) or takes the caller's (`'forced'`);
 * `planBest` tries every eligible host and keeps the best (`'best-net'`: goals
 * reached first, then net — the name predates the ranking).
 */
export type FactoryHostReason = 'only-eligible' | 'least-needed-extraction' | 'forced' | 'best-net';

export interface GoalPlan {
  /** The goals as planned: merged by type, zero-rate goals dropped. */
  goals: Goal[];
  /**
   * What each goal actually reaches, by typeId. A goal whose inputs are short
   * runs at the fraction its scarcest P1 allows, and only that much is shipped
   * and priced — an output whose inputs are missing is not revenue.
   */
  achieved: { typeId: number; unitsPerHour: number; fraction: number }[];
  /** Highest tier first, then typeId. Sized for the goals in full. */
  demand: DemandLine[];
  /** One per colony, by planet id. */
  assignments: ColonyAssignment[];
  factoryHost: { planetId: number; reason: FactoryHostReason } | null;
  shortfalls: Shortfall[];
  buys: { typeId: number; tier: PiTier; unitsPerHour: number }[];
  /** P1 extracted beyond what the goals need — whole ECUs overshoot — sold at the hub. */
  surplusP1: { typeId: number; unitsPerHour: number }[];
  flows: Flow[];
  hauling: {
    /** Every leg once, hub-to-hub excluded. */
    m3PerWeek: number;
    /** What each colony ships out plus what it takes in. */
    perColony: Map<number, number>;
  };
}
