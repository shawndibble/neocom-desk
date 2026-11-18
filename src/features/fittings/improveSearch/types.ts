/** The Improve search's interface: what it is asked, what it reads through, and what it hands back. */
import type {
  DefenseChoice,
  ImproveGoal,
  ImproveHold,
  ImproveOption,
  ImproveReach,
  ImproveResult,
} from '@/engine/fittings/improve';
import type { Makeover } from '@/engine/fittings/improve';
import type { ChargeLoadStep } from '@/engine/fittings/improve';
import type { ExploreSpace, ImproveJob } from '@/engine/fittings/improve';
import type { HullRef } from '@/engine/fittings/improve';
import type { HullCommonality } from '@/engine/fittings/hullCommonality';
import type { FitSwap, Resource } from '@/engine/fittings/makeItFit';
import type { TargetProfile } from '@/engine/fittings/targetProfile';
import type { Fitting, FittingSlotKind, FittingStats } from '@/engine/fittings/types';
import type { CommunityHints } from '../improveCommonHints';
import type { FittingCatalogue } from '../useFittingCatalogue';

/** What the drawer asks of one search beyond the goal. */
export interface ImproveConfig {
  job: ImproveJob;
  /** Explore only. */
  space: ExploreSpace;
  /** PvE only: no propulsion module is needed, so a Makeover adds none. */
  noPropulsion: boolean;
  reach: ImproveReach;
  iskBudget: number | null;
  defense: DefenseChoice;
  includeRigs: boolean;
  includeOfficer: boolean;
  /** Swap fitted mutated modules too, losing their rolls; off: they are kept (#5800). */
  allowMutated: boolean;
  /** Mine more: the crystal family (ore) every miner is scored with. */
  oreFamily: string;
  /** Carry more: the hold scored. */
  hold: ImproveHold;
}

/** The Makeover that beat the best single swap, with its rows as options ready to tick. */
export interface MakeoverResult {
  makeover: Makeover;
  options: ImproveOption[];
}

/** One Improve search of the open Fitting (the one `ImproveSearchPorts.fitting` names). */
export interface ImproveRequest {
  catalogue: FittingCatalogue;
  /** The remembered goal; a fit that cannot score it searches the hull role's default. */
  goal: ImproveGoal;
  hull: HullRef | undefined;
  /** The page's Target Profile, for More damage's applied DPS. */
  target: TargetProfile | undefined;
  config: ImproveConfig;
  /** Empty guns and launchers are scored loaded with these charges. */
  chargePlan: readonly ChargeLoadStep[];
}

/** A price per type id; null: unpriced. */
export type PriceOf = (typeId: number) => number | null;

/** What the search reads from outside: the stats engine, the hull and skill checks, prices and the community's fits. */
export interface ImproveSearchPorts {
  /** The open Fitting the search improves; every calculation is a change to it. */
  fitting: Fitting;
  /**
   * A variant beside the open Fitting's own stats (the page's cached baseline),
   * under the conditions the page shows: for the baseline and the scored load.
   */
  compare: (
    variant: Fitting,
    signal: AbortSignal
  ) => Promise<{ before: FittingStats; after: FittingStats }>;
  /** The same recalculation of a candidate, on the search's own workers (started on first use). */
  stats: (fitting: Fitting, signal: AbortSignal) => Promise<FittingStats>;
  /** How many `stats` calculations may run at once. */
  concurrency: number;
  /** Whether the hull takes the module in that rack and the pilot can fly it; undefined: not known (assumed yes). */
  fitCheck: (
    slot: FittingSlotKind,
    typeId: number
  ) => { fitsHull: boolean; canFly: boolean } | undefined;
  /** The charge groups the module type takes in that rack on the hull. */
  chargeGroups: (slot: FittingSlotKind, typeId: number) => readonly number[];
  /** Prices at the pilot's Trade Hub; rejects when they cannot be loaded. */
  prices: (typeIds: readonly number[]) => Promise<PriceOf>;
  /** What the open Fitting costs at the hub (the Price section's total); rejects when unknown. */
  fitTotal: () => Promise<number>;
  /** What the hull's community fits say per Job; null: none loaded. Never rejects. */
  commonality: () => Promise<HullCommonality | null>;
}

/** How the search reports back while it runs, and how it is stopped. */
export interface ImproveSearchEvents {
  /** Cancel: the search ends with null, or rejects. */
  signal: AbortSignal;
  /** The open Fitting's own stats, as soon as they are known. */
  onBaseline?: (before: FittingStats) => void;
  /** Calculations done of how many; `makeover`: the Makeover search is the one counting. */
  onProgress?: (progress: { checked: number; total: number; makeover?: boolean }) => void;
  /** "Show best so far": rank what is done, and skip the Makeover. */
  shouldStop: () => boolean;
}

/** What `findCompletions` needs beyond the ticked set. */
export interface CompletionPool {
  swaps: FitSwap[];
  priceOf: PriceOf;
}

/** A finished search. */
export interface ImproveDone {
  status: 'done';
  result: ImproveResult;
  before: FittingStats;
  /** What the fit costs now at the hub, for the selection summary; null when not loaded. */
  fitTotal: number | null;
  elapsedMs: number;
  /** Rework's whole-fit rework, when it beat the best single swap; its rows as options, ready to tick. */
  makeover?: MakeoverResult;
  /** What the hull's community fits say for the Job searched (#5581); absent: none loaded. Shown as hints, never scored. */
  hints?: CommunityHints;
  /** A tank goal under Shield or Armor: both sides' results, to compare. */
  sides?: Record<'shield' | 'armor', ImproveResult>;
  /** With `sides`: the options on neither side (Damage Control, hull), shown as "Either". */
  neutral?: ImproveResult;
  /** Mine more: the fit as it is, whose yield is the real "Now"; `before` is scored with the best crystals. */
  fitAsIs?: FittingStats;
  /** Mine more: the best crystal's key, and the miners that hold none of the ore's crystals. */
  crystals?: { bestKey: string; unloaded: { count: number; steps: ChargeLoadStep[] } | null };
}

/** How a search ends, when it is not cancelled. */
export type ImproveOutcome =
  /** The fit is over a budget: Improve hands over to Make it fit and searches nothing. */
  | { status: 'overBudget'; resources: Resource[] }
  /** Planning's budget is under the fit's own price: nothing is searched until it changes. */
  | { status: 'belowPrice'; budget: number; fitTotal: number }
  | (ImproveDone & {
      /** One whole-fit recalculation under the search's own conditions, for the ticked set. */
      recalc: (fitting: Fitting) => Promise<FittingStats>;
      /**
       * The swaps and prices that could cover a ticked set running the fit out of CPU,
       * powergrid or calibration, fetched on the first ask (most sets never need them).
       */
      completion: () => Promise<CompletionPool>;
    });
