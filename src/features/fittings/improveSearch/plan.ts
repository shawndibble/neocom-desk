import {
  improveCandidates,
  type DefenseChoice,
  type ImproveCandidate,
  type ImproveGoal,
} from '@/engine/fittings/improve';
import { compensationSwaps } from '@/engine/fittings/improve';
import { TANK_GOALS } from '@/engine/fittings/improve';
import type { PropulsionStart } from '@/engine/fittings/improve';
import type { JobCommonality } from '@/engine/fittings/hullCommonality';
import type { FitSwap } from '@/engine/fittings/makeItFit';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import type { SearchContext } from './context';
import { makeoverMovesFor, makeoverPropulsionFor } from './makeoverPhase';

export interface SideSet {
  side: DefenseChoice;
  candidates: ImproveCandidate[];
}

export interface SearchPlan {
  sets: SideSet[];
  total: number;
  movesFor: ((fitting: Fitting) => ImproveCandidate[]) | null;
  propulsion: PropulsionStart | null;
  compensation: FitSwap[];
  typeIds: number[];
}

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

export function allCompensation(ctx: SearchContext): FitSwap[] {
  const { request, index, pool, fitting } = ctx;
  return compensationSwaps(fitting.modules, index, request.catalogue.rackOf, pool);
}

export function planSearch(
  ctx: SearchContext,
  searched: ImproveGoal,
  own: FittingStats,
  commonality: JobCommonality | null
): SearchPlan {
  const { request, index, pool, jobSetting, fitting } = ctx;
  const { catalogue, config } = request;
  const { reach, defense, includeRigs, includeOfficer, allowMutated } = config;
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
