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

export interface ImproveConfig {
  job: ImproveJob;
  space: ExploreSpace;
  noPropulsion: boolean;
  reach: ImproveReach;
  iskBudget: number | null;
  defense: DefenseChoice;
  includeRigs: boolean;
  includeOfficer: boolean;
  allowMutated: boolean;
  oreFamily: string;
  hold: ImproveHold;
}

export interface MakeoverResult {
  makeover: Makeover;
  options: ImproveOption[];
}

export interface ImproveRequest {
  catalogue: FittingCatalogue;
  goal: ImproveGoal;
  hull: HullRef | undefined;
  target: TargetProfile | undefined;
  config: ImproveConfig;
  chargePlan: readonly ChargeLoadStep[];
}

export type PriceOf = (typeId: number) => number | null;

export interface ImproveSearchPorts {
  fitting: Fitting;
  compare: (
    variant: Fitting,
    signal: AbortSignal
  ) => Promise<{ before: FittingStats; after: FittingStats }>;
  stats: (fitting: Fitting, signal: AbortSignal) => Promise<FittingStats>;
  concurrency: number;
  fitCheck: (
    slot: FittingSlotKind,
    typeId: number
  ) => { fitsHull: boolean; canFly: boolean } | undefined;
  chargeGroups: (slot: FittingSlotKind, typeId: number) => readonly number[];
  prices: (typeIds: readonly number[]) => Promise<PriceOf>;
  fitTotal: () => Promise<number>;
  commonality: () => Promise<HullCommonality | null>;
}

export interface ImproveSearchEvents {
  signal: AbortSignal;
  onBaseline?: (before: FittingStats) => void;
  onProgress?: (progress: { checked: number; total: number; makeover?: boolean }) => void;
  shouldStop: () => boolean;
}

export interface CompletionPool {
  swaps: FitSwap[];
  priceOf: PriceOf;
}

export interface ImproveDone {
  status: 'done';
  result: ImproveResult;
  before: FittingStats;
  fitTotal: number | null;
  elapsedMs: number;
  makeover?: MakeoverResult;
  hints?: CommunityHints;
  sides?: Record<'shield' | 'armor', ImproveResult>;
  neutral?: ImproveResult;
  fitAsIs?: FittingStats;
  crystals?: { bestKey: string; unloaded: { count: number; steps: ChargeLoadStep[] } | null };
}

export type ImproveOutcome =
  | { status: 'overBudget'; resources: Resource[] }
  | { status: 'belowPrice'; budget: number; fitTotal: number }
  | (ImproveDone & {
      recalc: (fitting: Fitting) => Promise<FittingStats>;
      completion: () => Promise<CompletionPool>;
    });
