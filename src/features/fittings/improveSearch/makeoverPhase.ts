/**
 * The Makeover phase of an Improve search (Rework's whole-fit rework, run after
 * the single swaps): its one-slot moves, the `findMakeover` call with the bar
 * the single swaps set, progress, and the result shaped as tickable options.
 */
import type { ImproveCandidate, ImproveHold, ImproveOption } from '@/engine/fittings/improve';
import type { JobSetting } from '@/engine/fittings/improve';
import {
  findMakeover,
  makeoverBar,
  makeoverMoves,
  MAKEOVER_CALCS,
  propulsionStart,
  type MakeoverMoveOptions,
  type PropulsionStart,
} from '@/engine/fittings/improve';
import type { ImproveGoal } from '@/engine/fittings/improve';
import type { TargetProfile } from '@/engine/fittings/targetProfile';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { makeoverOptionsOf } from '../improveMakeoverTicks';
import type { SearchContext } from './context';
import type { MakeoverResult } from './types';

type MoveOptions = Omit<MakeoverMoveOptions, 'pool'>;

/** The Makeover's one-slot moves on any fit the search reaches, for the catalogue, pilot and settings of this search. */
export function makeoverMovesFor(
  ctx: SearchContext,
  options: MoveOptions
): (fitting: Fitting) => ImproveCandidate[] {
  const { index, pool } = ctx;
  const { rackOf } = ctx.request.catalogue;
  return (fitting) => makeoverMoves(fitting.modules, index, rackOf, { ...options, pool });
}

/** The forced propulsion step of the Makeover for the Job and this pilot's catalogue; null when the Job needs none. */
export function makeoverPropulsionFor(
  ctx: SearchContext,
  options: MoveOptions
): PropulsionStart | null {
  return propulsionStart(ctx.index, ctx.request.catalogue.rackOf, { ...options, pool: ctx.pool });
}

export interface MakeoverPhaseParams {
  moves: (fitting: Fitting) => readonly ImproveCandidate[];
  before: FittingStats;
  goal: ImproveGoal;
  stats: (fitting: Fitting) => Promise<FittingStats>;
  priceOf: (typeId: number) => number | null;
  target: TargetProfile | null | undefined;
  hold: ImproveHold;
  jobSetting: JobSetting;
  /** The propulsion the Job needs, added first; null: none needed. */
  propulsion?: PropulsionStart | null;
  /** How common a move's target group is on the hull for the Job; orders near-ties. */
  targetShare?: (move: ImproveCandidate) => number;
  iskBudget: number | null;
  fitTotal: number | null;
  /** The single swaps' results: the Makeover must beat the best of them. */
  listed: { noDownside: readonly ImproveOption[]; tradeOffs: readonly ImproveOption[] };
  concurrency: number;
  /** Calculations done and the most this search makes; called with 0 at the start. */
  onProgress: (checked: number, total: number) => void;
  isCancelled: () => boolean;
  shouldStop: () => boolean;
}

/**
 * Runs the Makeover search. Null when cancelled; otherwise `makeover` is null
 * when nothing beat the best single swap, and `stopped` says it ended early.
 */
export async function runMakeoverPhase(
  ctx: SearchContext,
  params: MakeoverPhaseParams
): Promise<{ makeover: MakeoverResult | null; stopped: boolean } | null> {
  const { listed, target, onProgress, priceOf } = params;
  onProgress(0, MAKEOVER_CALCS);
  const search = await findMakeover({
    fitting: ctx.fitting,
    before: params.before,
    goal: params.goal,
    moves: params.moves,
    stats: params.stats,
    priceOf,
    ...(target ? { target } : {}),
    hold: params.hold,
    jobSetting: params.jobSetting,
    propulsion: params.propulsion,
    ...(params.targetShare ? { targetShare: params.targetShare } : {}),
    iskBudget: params.iskBudget,
    fitTotal: params.fitTotal,
    // Faction and officer upgrades stay single rows; only a same-tier single swap has to be beaten.
    bestSingle: makeoverBar(listed, ctx.index),
    concurrency: params.concurrency,
    onProgress,
    isCancelled: params.isCancelled,
    shouldStop: params.shouldStop,
  });
  if (search === null) return null;
  return {
    stopped: search.stopped,
    makeover: search.makeover
      ? { makeover: search.makeover, options: makeoverOptionsOf(search.makeover, priceOf) }
      : null,
  };
}
