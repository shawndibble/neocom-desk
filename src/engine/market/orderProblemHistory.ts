/**
 * "Has this order been undercut most of the time it has been listed?" — the
 * rolling read behind the Open Orders page's `frequentlyUndercut` badge.
 *
 * `OrderProblem` is a snapshot: it answers "is a rival beating me right
 * now". The one case it cannot see is an order reading `healthy` this
 * instant that has spent most of its recent life undercut — a mispriced
 * listing quietly running out its duration, which asks for a bigger
 * re-price than "you are undercut today" ever does.
 *
 * Who persists these samples, and when, is `features/market/
 * orderProblemSamples.ts`. That series is gappy by construction, which is
 * why the verdict here is a bare boolean — "undercut 7 of 13 checks" would
 * claim a precision the sampling does not have — and why `minSamples` sits
 * under it.
 */
import { UNDERCUT_PROBLEMS, type OrderProblem } from './orderProblems';

/** One observation of an order's `OrderProblem`, at the moment it was taken. */
export interface OrderProblemSample {
  /** Epoch ms. */
  at: number;
  problem: OrderProblem;
}

/**
 * The states that mean "a rival is beating my price", across both order
 * shapes: the three sell-side undercut scopes plus the buy side's `outbid`,
 * which `orderProblems.ts` collapses the three scopes into for a buy order.
 * `belowFloor` is NOT here — it is a fact about my own cost basis, not about
 * a competitor — and neither is `expiringOrStale`.
 */
const UNDERCUT_HISTORY_PROBLEMS: ReadonlySet<OrderProblem> = new Set<OrderProblem>([
  ...UNDERCUT_PROBLEMS,
  'outbid',
]);

export interface UndercutHistoryThresholds {
  /** How far back a sample still counts. */
  windowMs: number;
  /** Below this many in-window samples the order is "not judged yet", never flagged. */
  minSamples: number;
  /** The share of in-window samples that must be undercut. Strictly greater — an even split is not a majority. */
  undercutRate: number;
  /** The closest two stored samples may sit; anything sooner is dropped as a duplicate read. */
  minSpacingMs: number;
}

/** Defaults, not laws. Each number is argued in the issue-1018 decision record. */
export const DEFAULT_UNDERCUT_HISTORY_THRESHOLDS: UndercutHistoryThresholds = {
  windowMs: 7 * 24 * 60 * 60 * 1000,
  minSamples: 12,
  undercutRate: 0.5,
  minSpacingMs: 4 * 60 * 1000,
};

/**
 * Hard ceiling on what one order's history may grow to, so a tab left open
 * for a month cannot grow a row without bound. At the default 4-minute
 * spacing this holds ~34 hours of continuous sampling, well past
 * `minSamples`; the window prune normally bites long before this does.
 */
export const MAX_SAMPLES_PER_ORDER = 512;

function inWindow(
  samples: readonly OrderProblemSample[],
  nowMs: number,
  windowMs: number
): OrderProblemSample[] {
  const cutoff = nowMs - windowMs;
  return samples.filter((sample) => sample.at >= cutoff);
}

/**
 * The `OrderProblem` to store for one reading, from an order's FULL problem
 * set (`allProblems`), not its worst one.
 *
 * An order can be both under its own floor and undercut at the same time,
 * and `ORDER_PROBLEMS` ranks `belowFloor` above all three undercut scopes —
 * so storing `worstProblem` alone would record `belowFloor` and silently
 * drop the undercut fact on exactly the chronically-mispriced listing this
 * history exists to catch. Picks the undercut state whenever the order has
 * one; otherwise the worst problem stands.
 */
export function sampledProblem(problems: readonly OrderProblem[]): OrderProblem {
  return (
    problems.find((problem) => UNDERCUT_HISTORY_PROBLEMS.has(problem)) ?? problems[0] ?? 'healthy'
  );
}

/**
 * True when this order's recent history is majority-undercut. Callers apply
 * it ONLY to an order whose current classification is `healthy` — for
 * anything already reading worse, the live status prompts the same action
 * and this adds nothing.
 */
export function wasFrequentlyUndercut(
  samples: readonly OrderProblemSample[],
  nowMs: number,
  thresholds: UndercutHistoryThresholds = DEFAULT_UNDERCUT_HISTORY_THRESHOLDS
): boolean {
  const recent = inWindow(samples, nowMs, thresholds.windowMs);
  if (recent.length < thresholds.minSamples) return false;
  const undercut = recent.filter((sample) => UNDERCUT_HISTORY_PROBLEMS.has(sample.problem)).length;
  return undercut / recent.length > thresholds.undercutRate;
}

/**
 * The stored history for one order after taking a new reading: window-pruned,
 * spacing-deduplicated and capped. Returns the SAME array reference whenever
 * the reading changes nothing, so a caller can skip the write rather than
 * rewrite an unchanged row every render.
 *
 * `samples` is assumed oldest-first, which is how this function returns it.
 */
export function appendOrderProblemSample(
  samples: readonly OrderProblemSample[],
  sample: OrderProblemSample,
  thresholds: UndercutHistoryThresholds = DEFAULT_UNDERCUT_HISTORY_THRESHOLDS
): readonly OrderProblemSample[] {
  const last = samples[samples.length - 1];
  // Same timestamp means the same page load re-classified this order after a
  // deeper check landed, so the new reading is strictly better informed than
  // the stored one — replace it rather than let the spacing guard drop it.
  // Identical readings return the same reference, so a re-render costs no write.
  if (last && sample.at === last.at) {
    return last.problem === sample.problem ? samples : [...samples.slice(0, -1), sample];
  }
  if (last && sample.at - last.at < thresholds.minSpacingMs) return samples;

  const kept = [...inWindow(samples, sample.at, thresholds.windowMs), sample];
  return kept.length > MAX_SAMPLES_PER_ORDER
    ? kept.slice(kept.length - MAX_SAMPLES_PER_ORDER)
    : kept;
}
