import {
  rankOpportunities,
  type OrderDepthThresholds,
  type RankedOpportunity,
} from './opportunities';

export interface LiquidityCandidate {
  productTypeID: number;
  marketGroupID: number | null;
  sellPrice: number | null;
  sellVolume: number | null;
}

export function selectLiquidCandidates(
  candidates: readonly LiquidityCandidate[],
  floorIsk: number,
  topNPerGroup: number
): LiquidityCandidate[] {
  const withDepth = candidates
    .map((c) => ({
      candidate: c,
      depth: c.sellPrice !== null && c.sellVolume !== null ? c.sellPrice * c.sellVolume : null,
    }))
    .filter((c) => c.depth !== null && c.depth >= floorIsk);

  const groups = new Map<string, { candidate: LiquidityCandidate; depth: number }[]>();
  withDepth.forEach(({ candidate, depth }, index) => {
    const key =
      candidate.marketGroupID === null ? `null:${index}` : String(candidate.marketGroupID);
    let group = groups.get(key);
    if (!group) {
      group = [];
      groups.set(key, group);
    }
    group.push({ candidate, depth: depth! });
  });

  const selected: LiquidityCandidate[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => b.depth - a.depth);
    for (const entry of group.slice(0, topNPerGroup)) selected.push(entry.candidate);
  }
  return selected;
}

export interface PricedMarketWideCandidate {
  productTypeID: number;
  profit: number;
  marginPct: number | null;
  seconds: number;
  iskPerHour: number;
  buildCost: number;
  outputQuantity: number;
  sellDepthIsk: number;
  me: number;
  te: number;
}

export interface MarketWideRow extends RankedOpportunity {
  productTypeID: number;
  marginPct: number | null;
  seconds: number;
  unitMargin: number;
  outputQuantity: number;
  me: number;
  te: number;
}

export function rankMarketWideRows(
  candidates: readonly PricedMarketWideCandidate[],
  thresholds?: OrderDepthThresholds
): MarketWideRow[] {
  const priced = candidates.map(({ profit, ...candidate }) => ({
    ...candidate,
    id: String(candidate.productTypeID),
    unitMargin: candidate.outputQuantity > 0 ? profit / candidate.outputQuantity : 0,
  }));
  const byId = new Map(priced.map((p) => [p.id, p]));
  return rankOpportunities(priced, thresholds).map((r) => {
    const { productTypeID, marginPct, seconds, unitMargin, outputQuantity, me, te } = byId.get(
      r.id
    )!;
    return { ...r, productTypeID, marginPct, seconds, unitMargin, outputQuantity, me, te };
  });
}
