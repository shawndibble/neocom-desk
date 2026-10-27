/**
 * Build Opportunities: ranks candidate rows (one per owned blueprint, already
 * priced by `buildVsBuy`) by ISK/hour, and classifies each row's order-depth
 * — the ISK value of sell orders at the hub against the row's own build cost.
 * No fixed Deep/Thin convention exists yet in this codebase, so this module
 * introduces one, `ProblemThresholds`-style (see
 * `src/engine/market/orderProblems.ts`), rather than hardcoding a ratio the
 * next similar feature would have to re-invent.
 *
 * Pure: the caller (feature layer) already ran every candidate through
 * `buildVsBuy`/`computeBuildPlan` and looked up its hub sell depth — this
 * module only sorts and classifies what it's handed.
 */

export type OrderDepthLevel = 'deep' | 'moderate' | 'thin' | 'unknown';

export interface OrderDepthThresholds {
  /** sellDepthIsk / buildCost ratio at or above which depth reads 'deep'. Default 3. */
  deepAtOrAboveRatio: number;
  /** Ratio strictly below which depth reads 'thin'. Default 0.5. */
  thinBelowRatio: number;
}

export const DEFAULT_ORDER_DEPTH_THRESHOLDS: OrderDepthThresholds = {
  deepAtOrAboveRatio: 3,
  thinBelowRatio: 0.5,
};

/**
 * `sellDepthIsk` is null when the product itself has no hub sell price (an
 * unpriceable row's depth is unknowable, not thin) — never coerced to 0,
 * same rule `HubAggregate.sellMin` follows.
 */
export function classifyOrderDepth(
  sellDepthIsk: number | null,
  buildCost: number,
  thresholds: OrderDepthThresholds = DEFAULT_ORDER_DEPTH_THRESHOLDS
): OrderDepthLevel {
  if (sellDepthIsk === null || buildCost <= 0) return 'unknown';
  const ratio = sellDepthIsk / buildCost;
  if (ratio >= thresholds.deepAtOrAboveRatio) return 'deep';
  if (ratio < thresholds.thinBelowRatio) return 'thin';
  return 'moderate';
}

export interface OpportunityCandidateResult {
  id: string;
  /** Null for an unpriceable row — sorts after every priced row, never coerced to 0. */
  iskPerHour: number | null;
  buildCost: number;
  /** ISK value of sell orders for the product at the hub; null when unpriceable. */
  sellDepthIsk: number | null;
}

export interface RankedOpportunity extends OpportunityCandidateResult {
  orderDepth: OrderDepthLevel;
}

/** Every candidate, ISK/hour descending, each carrying its own order-depth classification. */
export function rankOpportunities(
  candidates: readonly OpportunityCandidateResult[],
  thresholds: OrderDepthThresholds = DEFAULT_ORDER_DEPTH_THRESHOLDS
): RankedOpportunity[] {
  return candidates
    .map((c) => ({ ...c, orderDepth: classifyOrderDepth(c.sellDepthIsk, c.buildCost, thresholds) }))
    .sort((a, b) => (b.iskPerHour ?? -Infinity) - (a.iskPerHour ?? -Infinity));
}
