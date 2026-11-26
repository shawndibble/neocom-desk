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

export function makeoverMovesFor(
  ctx: SearchContext,
  options: MoveOptions
): (fitting: Fitting) => ImproveCandidate[] {
  const { index, pool } = ctx;
  const { rackOf } = ctx.request.catalogue;
  return (fitting) => makeoverMoves(fitting.modules, index, rackOf, { ...options, pool });
}

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
  propulsion?: PropulsionStart | null;
  targetShare?: (move: ImproveCandidate) => number;
  iskBudget: number | null;
  fitTotal: number | null;
  listed: { noDownside: readonly ImproveOption[]; tradeOffs: readonly ImproveOption[] };
  concurrency: number;
  onProgress: (checked: number, total: number) => void;
  isCancelled: () => boolean;
  shouldStop: () => boolean;
}

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
