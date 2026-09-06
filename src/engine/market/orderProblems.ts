/**
 * Order Problems: the one problem an open market order is filed under. The
 * Market Orders page groups every order under exactly one heading, worst
 * first, so this precedence table is the page's spine — deliberately pulled
 * out of any component so the ordering has one owner and one set of tests,
 * rather than being re-derived (and re-argued) inside JSX.
 *
 * Two shapes share one precedence list because the underlying facts mean
 * different things for a sell vs. a buy order:
 *
 * - `belowFloor` only makes sense for a sell order (a floor is a cost basis
 *   you must not sell under) — a buy order is a purchase, not a sale, so it
 *   can never land there even if the caller passes `belowFloor: true` by
 *   mistake. This module is the one place that guards against that, rather
 *   than trusting every caller to already know it.
 * - An undercut scope means "someone beats my price" either way, but what
 *   that implies is opposite for the two order types: for a sell order it
 *   is competition to react to (`undercutStation`/`System`/`Region`,
 *   tightest scope first); for a buy order it collapses to a single
 *   `outbid` — the buyer does not care *where* they were outbid, only that
 *   they were, so the three scopes are not worth telling apart there.
 *
 * `worstProblem` and `allProblems` are built from one shared, ordered walk
 * (`applicableProblems`) so `worstProblem === allProblems(...)[0] ?? 'healthy'`
 * holds by construction, not by two independently-written functions that
 * could drift apart.
 */

export type OrderProblem =
  | 'belowFloor'
  | 'undercutStation'
  | 'undercutSystem'
  | 'undercutRegion'
  | 'expiringOrStale'
  | 'outbid'
  | 'healthy';

/** Worst first. The UI renders its groups in exactly this order. */
export const ORDER_PROBLEMS: readonly OrderProblem[] = [
  'belowFloor',
  'undercutStation',
  'undercutSystem',
  'undercutRegion',
  'expiringOrStale',
  'outbid',
  'healthy',
];

export interface OrderProblemFacts {
  isBuyOrder: boolean;
  /** True when my sell price is under my own floor — needs a cost basis; false when unknown. */
  belowFloor: boolean;
  /** The tightest scope where someone beats me, or null. Plain strings — do not import another module for this. */
  undercutScope: 'station' | 'system' | 'region' | null;
  /** Whole days until the order lapses; null when it could not be worked out. */
  daysLeft: number | null;
  /** Units still unsold. */
  volumeRemain: number;
  /** Days since listing with no unit sold; null when unknown. */
  daysWithoutSale: number | null;
  /** True when the remaining stock cannot clear before the order lapses. */
  outlastsOrder: boolean;
}

export interface ProblemThresholds {
  /** Default 7. */
  expiringWithinDays: number;
  /** Default 12. */
  staleAfterDays: number;
}

export const DEFAULT_PROBLEM_THRESHOLDS: ProblemThresholds = {
  expiringWithinDays: 7,
  staleAfterDays: 12,
};

function isExpiringOrStale(facts: OrderProblemFacts, thresholds: ProblemThresholds): boolean {
  const { daysLeft, volumeRemain, daysWithoutSale, outlastsOrder } = facts;

  if (volumeRemain > 0 && daysLeft !== null && daysLeft <= thresholds.expiringWithinDays) {
    return true;
  }
  if (daysWithoutSale !== null && daysWithoutSale >= thresholds.staleAfterDays) {
    return true;
  }
  if (volumeRemain > 0 && outlastsOrder) {
    return true;
  }
  return false;
}

/**
 * Every problem that applies to these facts, worst first. The single source
 * of truth both `worstProblem` and `allProblems` read from, so the two can
 * never disagree.
 */
function applicableProblems(
  facts: OrderProblemFacts,
  thresholds: ProblemThresholds
): OrderProblem[] {
  const problems: OrderProblem[] = [];

  if (facts.isBuyOrder) {
    if (facts.undercutScope !== null) problems.push('outbid');
  } else {
    if (facts.belowFloor) problems.push('belowFloor');
    if (facts.undercutScope === 'station') problems.push('undercutStation');
    if (facts.undercutScope === 'system') problems.push('undercutSystem');
    if (facts.undercutScope === 'region') problems.push('undercutRegion');
  }

  if (isExpiringOrStale(facts, thresholds)) problems.push('expiringOrStale');

  return problems;
}

export function worstProblem(
  facts: OrderProblemFacts,
  thresholds: ProblemThresholds = DEFAULT_PROBLEM_THRESHOLDS
): OrderProblem {
  return applicableProblems(facts, thresholds)[0] ?? 'healthy';
}

/** Every problem an order has, worst first — for filter chips, which are not mutually exclusive. */
export function allProblems(
  facts: OrderProblemFacts,
  thresholds: ProblemThresholds = DEFAULT_PROBLEM_THRESHOLDS
): OrderProblem[] {
  const problems = applicableProblems(facts, thresholds);
  return problems.length > 0 ? problems : ['healthy'];
}
