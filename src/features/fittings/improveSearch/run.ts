/**
 * One Improve search of the open Fitting (`findImprovements`): every fitted
 * module's variations the hull takes and the pilot can fly, recalculated whole
 * under the same evaluator the page's stats come from, scored against the
 * page's Target Profile and priced at the pilot's Trade Hub; then, for Rework,
 * the Makeover. No React here: the hook owns the status, the timer and Cancel.
 */
import {
  effectiveHold,
  findImprovements,
  searchableGoal,
  type ImproveResult,
} from '@/engine/fittings/improve';
import { overBudgetResources } from '@/engine/fittings/improveFree';
import { unloadedMiners } from '@/engine/fittings/improveMining';
import { targetShareOf } from '@/engine/fittings/hullCommonality';
import { communityHintsOf } from '../improveCommonHints';
import { combineSides } from './combine';
import { searchContext } from './context';
import { runMakeoverPhase } from './makeoverPhase';
import { allCompensation, planSearch } from './plan';
import { scoringFor } from './scoring';
import type {
  CompletionPool,
  ImproveOutcome,
  ImproveRequest,
  ImproveSearchEvents,
  ImproveSearchPorts,
  MakeoverResult,
  PriceOf,
} from './types';

const unpriced: PriceOf = () => null;

/**
 * Runs the search. Null when `events.signal` aborts it; rejects when it fails
 * (a stats calculation, or prices a budget needs).
 */
export async function runImproveSearch(
  request: ImproveRequest,
  ports: ImproveSearchPorts,
  events: ImproveSearchEvents
): Promise<ImproveOutcome | null> {
  const started = performance.now();
  const { signal, shouldStop } = events;
  const isCancelled = () => signal.aborted;
  const progress: NonNullable<ImproveSearchEvents['onProgress']> = (p) => {
    if (!signal.aborted) events.onProgress?.(p);
  };
  const ctx = searchContext(request, ports, signal);
  const { catalogue, config, target } = request;
  const { fitting } = ctx;

  const { before: own } = await ports.compare(fitting, signal);
  if (signal.aborted) return null;
  events.onBaseline?.(own);
  // A fit that doesn't fit has nothing to improve yet (`20261019-144736`).
  const over = overBudgetResources(own);
  if (over.length > 0) return { status: 'overBudget', resources: over };
  // A remembered goal this fit cannot score (Longer reach on a drone boat) searches the role's default.
  const searched = searchableGoal(request.goal, own, request.hull);
  // What the hull's community fits say for this Job; null (no fits, a failed load) leaves the search as it is.
  const commonality = (await ports.commonality())?.[config.job] ?? null;
  if (signal.aborted) return null;
  const targetShare = targetShareOf(commonality, ctx.groupOf);
  const plan = planSearch(ctx, searched, own, commonality);
  progress({ checked: 0, total: plan.total });

  const [prices, fitTotal] = await Promise.all([
    ports.prices(plan.typeIds).catch(() => null),
    // The Price section's own total, for the budget.
    ports.fitTotal().catch(() => null),
  ]);
  if (signal.aborted) return null;
  const { iskBudget } = config;
  // A cap that cannot be checked is not silently waived.
  if (iskBudget !== null && (prices === null || fitTotal === null))
    throw new Error('Prices unavailable for the spend cap');
  if (iskBudget !== null && fitTotal !== null && iskBudget < fitTotal)
    return { status: 'belowPrice', budget: iskBudget, fitTotal };
  const priceOf = prices ?? unpriced;

  const scoring = await scoringFor(ctx, searched, own);
  if (scoring === null) return null;
  const { scoredBefore, stats, plan: crystals } = scoring;
  const hold = effectiveHold(own.holds, config.hold);
  const shared = {
    before: scoredBefore,
    goal: searched,
    stats,
    hold,
    jobSetting: ctx.jobSetting,
    ...(targetShare ? { targetShare } : {}),
    priceOf,
    iskBudget,
    fitTotal,
    isCancelled,
    shouldStop,
  };

  const results: ImproveResult[] = [];
  let done = 0;
  for (const set of plan.sets) {
    const result = await findImprovements({
      ...shared,
      fitting,
      candidates: set.candidates,
      concurrency: ports.concurrency,
      ...(target ? { target } : {}),
      compensators: (fix) =>
        plan.compensation.filter(
          (swap) => !fix.at.some((at) => at.slot === swap.slot && at.slotIndex === swap.slotIndex)
        ),
      onProgress: (checked) => progress({ checked: done + checked, total: plan.total }),
    });
    if (signal.aborted || result === null) return null;
    results.push(result);
    done += set.candidates.length;
    // "Show best so far" ends the whole search: the other side was not searched, so it is not compared.
    if (shouldStop()) break;
  }
  const { listed, checked, sides, neutral } = combineSides(plan.sets, results, ctx.groupOf);

  // The Makeover: only after the single swaps ran to the end ("Show best so far" skips it), and only if it beats the best of them.
  let makeover: MakeoverResult | undefined;
  let makeoverStopped = false;
  if (plan.movesFor && !shouldStop() && results.length > 0) {
    const search = await runMakeoverPhase(ctx, {
      ...shared,
      moves: plan.movesFor,
      target,
      propulsion: plan.propulsion,
      listed,
      concurrency: ports.concurrency,
      onProgress: (n, total) => progress({ checked: n, total, makeover: true }),
    });
    if (signal.aborted || search === null) return null;
    // Only the pilot's "Show best so far" reads as stopped; the Makeover's own calculation cap is its normal end.
    makeoverStopped = search.stopped && shouldStop();
    makeover = search.makeover ?? undefined;
  }

  return {
    status: 'done',
    result: { ...listed, checked, stopped: listed.stopped || makeoverStopped },
    ...(makeover ? { makeover } : {}),
    ...(commonality
      ? {
          hints: communityHintsOf(
            commonality,
            config.job,
            catalogue,
            fitting.shipTypeId,
            fitting.modules,
            makeover?.makeover.rows ?? []
          ),
        }
      : {}),
    before: scoredBefore,
    ...(crystals
      ? {
          fitAsIs: own,
          crystals: {
            bestKey: crystals.bestKey,
            unloaded: unloadedMiners(fitting, crystals.crystalsOf, crystals.crystalFor),
          },
        }
      : {}),
    fitTotal,
    elapsedMs: performance.now() - started,
    ...(sides ? { sides, neutral } : {}),
    recalc: stats,
    completion: completionOf(ctx.ports, () => allCompensation(ctx)),
  };
}

/** The completion pool, fetched on the first ask; a failed lookup is asked again next time, not remembered. */
function completionOf(
  ports: ImproveSearchPorts,
  swapsOf: () => CompletionPool['swaps']
): () => Promise<CompletionPool> {
  let pool: Promise<CompletionPool> | null = null;
  return () =>
    (pool ??= (async () => {
      const swaps = swapsOf();
      const prices = await ports
        .prices([...new Set(swaps.flatMap((swap) => [swap.fromTypeId, swap.toTypeId]))])
        .catch(() => null);
      return { swaps, priceOf: prices ?? unpriced };
    })().catch((error: unknown) => {
      pool = null;
      throw error;
    }));
}
