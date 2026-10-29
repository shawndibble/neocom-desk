/**
 * The Makeover phase of an Improve search (Rework's whole-fit rework, run after
 * the single swaps): its one-slot moves, the `findMakeover` call with the bar
 * the single swaps set, progress, and the result shaped as tickable options.
 */
import type { ImproveCandidate, ImproveHold, ImproveOption } from '@/engine/fittings/improve';
import type { JobSetting } from '@/engine/fittings/improveJob';
import {
  findMakeover,
  makeoverBar,
  makeoverMoves,
  MAKEOVER_CALCS,
  type Makeover,
  type MakeoverMoveOptions,
} from '@/engine/fittings/improveMakeover';
import type { ImproveGoal } from '@/engine/fittings/improve';
import type { TargetProfile } from '@/engine/fittings/targetProfile';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { buildVariationIndex } from '@/engine/market/variations';
import { makeoverOptionsOf } from './improveMakeoverTicks';
import { modulePool } from './improveModulePool';
import type { FittingCatalogue } from './useFittingCatalogue';
import type { VariantEvaluator } from './useFittingEvaluation';

/** The Makeover that beat the best single swap, with its rows as options ready to tick. */
export interface MakeoverResult {
  makeover: Makeover;
  options: ImproveOption[];
}

/** The Makeover's one-slot moves on any fit the search reaches, for the catalogue, pilot and settings of this search. */
export function makeoverMovesFor(
  variants: VariantEvaluator,
  catalogue: FittingCatalogue,
  options: Omit<MakeoverMoveOptions, 'pool'>
): (fitting: Fitting) => ImproveCandidate[] {
  const index = buildVariationIndex(catalogue.variations.types, catalogue.variations.metaGroups);
  const pool = modulePool(catalogue, variants);
  return (fitting) => makeoverMoves(fitting.modules, index, catalogue.rackOf, { ...options, pool });
}

export interface MakeoverPhaseParams {
  variants: VariantEvaluator;
  catalogue: FittingCatalogue;
  moves: (fitting: Fitting) => readonly ImproveCandidate[];
  before: FittingStats;
  goal: ImproveGoal;
  stats: (fitting: Fitting) => Promise<FittingStats>;
  priceOf: (typeId: number) => number | null;
  target: TargetProfile | null | undefined;
  hold: ImproveHold;
  jobSetting: JobSetting;
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
  params: MakeoverPhaseParams
): Promise<{ makeover: MakeoverResult | null; stopped: boolean } | null> {
  const { variants, catalogue, listed, target, onProgress, priceOf } = params;
  onProgress(0, MAKEOVER_CALCS);
  const search = await findMakeover({
    fitting: variants.fitting,
    before: params.before,
    goal: params.goal,
    moves: params.moves,
    stats: params.stats,
    priceOf,
    ...(target ? { target } : {}),
    hold: params.hold,
    jobSetting: params.jobSetting,
    iskBudget: params.iskBudget,
    fitTotal: params.fitTotal,
    // Faction and officer upgrades stay single rows; only a same-tier single swap has to be beaten.
    bestSingle: makeoverBar(
      listed,
      buildVariationIndex(catalogue.variations.types, catalogue.variations.metaGroups)
    ),
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
