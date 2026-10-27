/**
 * Market-Wide Build Opportunities (issue #819): a cold-start "what should I
 * build, starting from nothing" ranking — every manufacturable product in the
 * SDE, independent of ownership, ranked by ISK/hour. `rankOpportunities`/
 * `classifyOrderDepth` already do the sort and depth read for the
 * ownership-based Build Opportunities panel; this module supplies the two
 * pieces that panel doesn't need: bounding a full-SDE candidate set down to
 * something worth pricing at all (`selectLiquidCandidates`), and shaping the
 * priced candidates into ranked rows (`rankMarketWideRows`).
 *
 * The pricing itself is not here. A candidate is priced by the same
 * `resolveBuildPlan` a Build Plan opened from its row runs
 * (`features/industry/marketWidePlanPricing.ts`), so a row's profit, margin
 * and ISK/hour cannot differ from the plan's — blueprint price, job fee,
 * sales tax and broker fee included.
 *
 * Pure: no fetch/DOM/Dexie. The caller supplies prices already fetched.
 */
import {
  rankOpportunities,
  type OrderDepthThresholds,
  type RankedOpportunity,
} from './opportunities';

/** One product's liquidity signal — the cheap, product-only price fetch that runs before any material pricing. */
export interface LiquidityCandidate {
  productTypeID: number;
  /** null when the product carries no Market Group (shouldn't happen for a baked candidate, but never assumed). */
  marketGroupID: number | null;
  /** null when the product has no hub sell price at all — unpriceable, excluded regardless of floor. */
  sellPrice: number | null;
  sellVolume: number | null;
}

/**
 * Bounds a candidate set two ways at once, per the ticket: a liquidity floor
 * (sell-order ISK at the hub must clear `floorIsk`) and a fixed top-N per
 * Market Group category — never a full-SDE sweep past this point. A null
 * Market Group is its own single-member bucket per candidate, never merged
 * with another null-group candidate: two unrelated ungrouped items have
 * nothing in common that would justify capping them against each other.
 */
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
    // Null-group candidates each get a unique bucket key (by index) so they
    // never compete against one another for the top-N slots.
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

/** One liquidity-selected candidate, priced by the Build Plan engine at the ME/TE a plan opened from its row starts at. */
export interface PricedMarketWideCandidate {
  productTypeID: number;
  /** Net profit of one run, blueprint price and fees included. */
  profit: number;
  /** profit ÷ revenue × 100; null when revenue is 0 (unknown, never 0%). */
  marginPct: number | null;
  /** The plan's job duration — what `iskPerHour` divides by, not a wall-clock promise. */
  seconds: number;
  iskPerHour: number;
  /** The plan's total cost: materials, blueprint and job fee. */
  buildCost: number;
  /** Units one run yields. */
  outputQuantity: number;
  /** ISK value of sell orders for the product at the hub, from the same liquidity pass — reused for `orderDepth`, never re-fetched. */
  sellDepthIsk: number;
  /** The ME/TE the row is priced at, seeded into the plan a click opens. */
  me: number;
  te: number;
}

export interface MarketWideRow extends RankedOpportunity {
  productTypeID: number;
  /** profit ÷ revenue × 100, on the same net profit `iskPerHour` uses; null when revenue is 0 (unknown, never 0%). */
  marginPct: number | null;
  /** The plan's job duration — the duration `iskPerHour` divides by, not a wall-clock promise. */
  seconds: number;
  /** Net profit per unit sold (profit ÷ `outputQuantity`) — ISK/day's per-unit margin. */
  unitMargin: number;
  /** Units one build yields. */
  outputQuantity: number;
  /** The ME/TE the row is priced at, seeded into the plan a click opens. */
  me: number;
  te: number;
}

/** Ranks priced candidates by ISK/hour and classifies each one's sell-order depth. */
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
