/**
 * What one Improve search will calculate, decided before any calculation: the
 * Defense sides and their candidates, the Makeover's moves and forced
 * propulsion, the swaps that pay for an unflyable-module fix, and every type
 * id that needs a price.
 */
import {
  improveCandidates,
  type DefenseChoice,
  type ImproveCandidate,
  type ImproveGoal,
} from '@/engine/fittings/improve';
import { compensationSwaps } from '@/engine/fittings/improveCompensation';
import { TANK_GOALS } from '@/engine/fittings/improveGroups';
import type { PropulsionStart } from '@/engine/fittings/improveMakeover';
import type { JobCommonality } from '@/engine/fittings/hullCommonality';
import type { FitSwap } from '@/engine/fittings/makeItFit';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import type { SearchContext } from './context';
import { makeoverMovesFor, makeoverPropulsionFor } from './makeoverPhase';

/** One Defense side's run of single swaps. */
export interface SideSet {
  side: DefenseChoice;
  candidates: ImproveCandidate[];
}

export interface SearchPlan {
  /** One set, or two (the chosen side first) for a tank goal under Shield or Armor. */
  sets: SideSet[];
  /** Every single swap, both sides together: the progress bar's total. */
  total: number;
  /** Rework's Makeover moves; null when no Makeover follows the single swaps. */
  movesFor: ((fitting: Fitting) => ImproveCandidate[]) | null;
  /** The propulsion the Job needs, forced first in the Makeover; null: none. */
  propulsion: PropulsionStart | null;
  /** The swaps that can pay for an unflyable-module fix; empty when no candidate is one. */
  compensation: FitSwap[];
  /** Every type id the search buys or sells. */
  typeIds: number[];
}

/** Every type id a candidate (and the downgrade paired with it) buys or sells. */
function candidateTypeIds(candidates: readonly ImproveCandidate[]): number[] {
  const ids = new Set<number>();
  const add = (candidate: ImproveCandidate | undefined) => {
    if (!candidate) return;
    ids.add(candidate.toTypeId);
    if (candidate.fromTypeId !== null) ids.add(candidate.fromTypeId);
    candidate.conversion?.removes.forEach((removed) => ids.add(removed.typeId));
    add(candidate.pairedWith);
  };
  candidates.forEach(add);
  return [...ids];
}

/** Every fitted module's compensating swaps, for this search's catalogue and pilot. */
export function allCompensation(ctx: SearchContext): FitSwap[] {
  const { request, index, pool } = ctx;
  return compensationSwaps(request.fitting.modules, index, request.catalogue.rackOf, pool);
}

export function planSearch(
  ctx: SearchContext,
  searched: ImproveGoal,
  own: FittingStats,
  commonality: JobCommonality | null
): SearchPlan {
  const { request, index, pool, jobSetting } = ctx;
  const { fitting, catalogue, config } = request;
  const { reach, defense, includeRigs, includeOfficer, allowMutated } = config;
  // A tank goal under Shield or Armor runs both sides, the chosen one first, to compare them.
  const sides: DefenseChoice[] =
    defense !== 'keep' && reach !== 'upgrade' && TANK_GOALS.has(searched)
      ? [defense, defense === 'shield' ? 'armor' : 'shield']
      : [reach === 'upgrade' ? 'keep' : defense];
  const sets = sides.map((side) => ({
    side,
    candidates: improveCandidates(fitting.modules, index, catalogue.rackOf, {
      goal: searched,
      reach,
      defense: side,
      includeRigs,
      includeOfficer,
      allowMutated,
      jobSetting,
      commonality,
      slotCounts: own.slotCounts,
      pool,
    }),
  }));
  const candidates = sets.flatMap((set) => set.candidates);
  // The Makeover is Rework's: it follows the single swaps, and the Cheaper goal has none. One search, for the chosen Defense side.
  const wantMakeover = reach === 'rework' && searched !== 'cheaper';
  const makeoverOptions = {
    goal: searched,
    defense: sets[0].side,
    includeRigs,
    allowMutated,
    jobSetting,
    commonality,
    slotCounts: own.slotCounts,
  };
  const movesFor = wantMakeover ? makeoverMovesFor(ctx, makeoverOptions) : null;
  // The propulsion the Job needs is a forced first step of the Makeover (#5578).
  const propulsion = wantMakeover ? makeoverPropulsionFor(ctx, makeoverOptions) : null;
  const makeoverStart = [
    ...(movesFor ? movesFor(fitting) : []),
    ...(propulsion?.tiers(fitting).flat() ?? []),
  ];
  const compensation = candidates.some((candidate) => candidate.fixesUnflyable)
    ? allCompensation(ctx)
    : [];
  return {
    sets,
    total: candidates.length,
    movesFor,
    propulsion,
    compensation,
    typeIds: [
      ...new Set([
        ...candidateTypeIds(candidates),
        ...candidateTypeIds(makeoverStart),
        ...compensation.flatMap((swap) => [swap.fromTypeId, swap.toTypeId]),
      ]),
    ],
  };
}
