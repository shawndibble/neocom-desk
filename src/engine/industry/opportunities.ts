export type OrderDepthLevel = 'deep' | 'moderate' | 'thin' | 'unknown';

export interface OrderDepthThresholds {
  deepAtOrAboveRatio: number;
  thinBelowRatio: number;
}

export const DEFAULT_ORDER_DEPTH_THRESHOLDS: OrderDepthThresholds = {
  deepAtOrAboveRatio: 3,
  thinBelowRatio: 0.5,
};

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
  iskPerHour: number | null;
  buildCost: number;
  sellDepthIsk: number | null;
}

export interface RankedOpportunity extends OpportunityCandidateResult {
  orderDepth: OrderDepthLevel;
}

export function rankOpportunities(
  candidates: readonly OpportunityCandidateResult[],
  thresholds: OrderDepthThresholds = DEFAULT_ORDER_DEPTH_THRESHOLDS
): RankedOpportunity[] {
  return candidates
    .map((c) => ({ ...c, orderDepth: classifyOrderDepth(c.sellDepthIsk, c.buildCost, thresholds) }))
    .sort((a, b) => (b.iskPerHour ?? -Infinity) - (a.iskPerHour ?? -Infinity));
}
