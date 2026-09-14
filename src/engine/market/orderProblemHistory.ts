/**
 * "Has this order actually been undercut most of the time it has been
 * listed?" — the rolling read behind the Open Orders page's
 * `frequentlyUndercut` badge (issue #1018).
 *
 * The page's existing `OrderProblem` classification is a snapshot: it answers
 * "is a rival beating me right now". That answer is enough for every group
 * the page already shows worst-first, because the action it prompts
 * (re-price) is obvious from the live status alone. The one case it cannot
 * see is an order reading `healthy` *this instant* that has spent most of its
 * recent life undercut — a fundamentally mispriced listing quietly running
 * out its duration, which asks for a bigger re-price than "you are undercut
 * today" ever does. This module is the only place that second read lives.
 *
 * Pure by construction (CLAUDE.md): it takes an array of samples somebody
 * else persisted and returns a verdict. The Dexie table, the pruning of
 * closed orders, and the decision of *when* to take a sample all belong to
 * `features/market/orderProblemSamples.ts` — nothing here imports Dexie.
 *
 * Deliberately coarse. The samples are taken only while the Open Orders page
 * is open (the route reloads on the Foreground Poller's own ESI cache
 * revalidation, roughly every 5 minutes), so the series is genuinely gappy:
 * a player who never leaves the tab open has hours of real listing time with
 * no sample in them at all. `wasFrequentlyUndercut` therefore returns a
 * boolean and nothing else — rendering "undercut 7 of 13 checks" would claim
 * a precision the sampling does not have. The `minSamples` floor is what
 * stops a freshly-listed order with two unlucky samples reading as
 * chronically mispriced.
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

/**
 * Defaults, not laws — the same standing this repo gives
 * `DEFAULT_PROBLEM_THRESHOLDS` (see
 * `docs/context/decisions/20260906-155913-open-orders-reads-as-a-worklist.md`).
 * Picked against the observed sampling cadence rather than a study:
 *
 * - `windowMs` 7 days: long enough to outlive a weekend the tab was shut,
 *   short enough that a re-priced order stops wearing the badge within a week.
 * - `minSamples` 12: about an hour of the page being left open at the ~5
 *   minute revalidation cadence, or a dozen separate visits. Under that, the
 *   sample set is too small for a majority to mean anything.
 * - `undercutRate` 0.5, strictly exceeded: "most of the time", the plainest
 *   reading of the flag's own wording.
 * - `minSpacingMs` 4 minutes: just under the poller's 5, so an ordinary
 *   refresh always records while a burst of remounts (route re-entry,
 *   a manual refresh) records once.
 */
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
 * spacing-deduplicated and capped. Returns the SAME array reference when the
 * sample was dropped for spacing, so a caller can skip the write entirely
 * rather than rewriting an unchanged row every render.
 *
 * `samples` is assumed oldest-first, which is how this function returns it.
 */
export function appendOrderProblemSample(
  samples: readonly OrderProblemSample[],
  sample: OrderProblemSample,
  thresholds: UndercutHistoryThresholds = DEFAULT_UNDERCUT_HISTORY_THRESHOLDS
): readonly OrderProblemSample[] {
  const last = samples[samples.length - 1];
  if (last && sample.at - last.at < thresholds.minSpacingMs) return samples;

  const kept = [...inWindow(samples, sample.at, thresholds.windowMs), sample];
  return kept.length > MAX_SAMPLES_PER_ORDER
    ? kept.slice(kept.length - MAX_SAMPLES_PER_ORDER)
    : kept;
}
