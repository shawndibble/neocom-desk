/**
 * Market-Wide Build Opportunities (issue #819): a cold-start "what should I
 * build, starting from nothing" ranking — every manufacturable product in the
 * SDE, independent of ownership, ranked by ISK/hour. `rankOpportunities`/
 * `classifyOrderDepth` already do the sort and depth read for the
 * ownership-based Build Opportunities panel; this module supplies the two
 * pieces that panel doesn't need: bounding a full-SDE candidate set down to
 * something worth pricing at all (`selectLiquidCandidates`), and costing a
 * candidate from its precomputed flattened material tree instead of a live
 * `computeBuildPlan` run (`computeMarketWideRows`).
 *
 * `computeMarketWideRows` nets sales tax, broker fee and the job installation
 * fee through the same `fees.ts`/`jobCost.ts` primitives the owned-blueprint
 * panel's `buildVsBuy` uses. There is no owned facility here — this scan is
 * ownership-agnostic by construction — so the job fee always assumes an NPC
 * station: no job-cost bonus, the fixed 0.25% NPC tax. `MarketWideFeeInputs`
 * is the caller's own concern (this module stays pure); the feature layer
 * reads it off the hub's own system, the same "no build system of its own"
 * fallback `loadMarketSnapshot` already uses for a caller with no plan.
 *
 * Pure: no fetch/DOM/Dexie. The caller supplies prices already fetched.
 */
import type { MarketWideTreeEntry } from '@/sde/types';
import { brokerFee, salesTax } from './fees';
import { jobFee } from './jobCost';
import {
  rankOpportunities,
  type OrderDepthThresholds,
  type RankedOpportunity,
} from './opportunities';
import { FACILITY_PRESETS, SKILL_IDS, type AdjustedPrices, type SkillLevels } from './types';

/** The pricing context `computeMarketWideRows` needs beyond hub prices — one object, not three loose same-shaped `Record<number, number>` positionals. */
export interface MarketWideFeeInputs {
  adjustedPrices: AdjustedPrices;
  systemCostIndex: number;
  skills: SkillLevels;
}

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

/** One liquidity-selected candidate, paired with its precomputed material tree and product price. */
export interface MarketWideCandidate {
  productTypeID: number;
  tree: MarketWideTreeEntry;
  sellPrice: number;
  /** ISK value of sell orders for the product at the hub, from the same liquidity pass — reused for `orderDepth`, never re-fetched. */
  sellDepthIsk: number;
}

export interface MarketWideRow extends RankedOpportunity {
  productTypeID: number;
}

/**
 * Prices every candidate from its flattened tree, at ME 0, against a
 * materials price map — no `computeBuildPlan` call, per the ticket's
 * "precomputed, not resolved live" requirement. A candidate with any
 * unpriced material is excluded rather than shown at a guessed cost, the
 * same "never guessed" rule `classifyOrderDepth` follows for sell depth.
 *
 * `iskPerHour`/`buildCost` are on the same basis `buildVsBuy` uses: cost is
 * materials + the job fee, revenue nets sales tax and broker fee. One
 * `jobFee` call over the whole (already base-mineral-flattened) tree slightly
 * undercounts a multi-tier product against a real per-job build — a
 * flattened-tree limitation, not something fixable without resolving the
 * tree live.
 */
export function computeMarketWideRows(
  candidates: readonly MarketWideCandidate[],
  materialPrices: ReadonlyMap<number, number>,
  feeInputs: MarketWideFeeInputs,
  thresholds?: OrderDepthThresholds
): MarketWideRow[] {
  const { adjustedPrices, systemCostIndex, skills } = feeInputs;
  const priced: {
    id: string;
    productTypeID: number;
    iskPerHour: number;
    buildCost: number;
    sellDepthIsk: number;
  }[] = [];
  for (const candidate of candidates) {
    const { tree } = candidate;
    let materialCost = 0;
    let eiv = 0;
    let allPriced = true;
    for (const material of tree.materials) {
      const price = materialPrices.get(material.typeID);
      if (price === undefined) {
        allPriced = false;
        break;
      }
      materialCost += price * material.quantity;
      eiv += material.quantity * (adjustedPrices[material.typeID] ?? 0);
    }
    if (!allPriced || tree.time <= 0) continue;

    const fee = jobFee(eiv, systemCostIndex, FACILITY_PRESETS.npcStation);
    const buildCost = materialCost + fee.total;

    const revenue = candidate.sellPrice * tree.outputQuantity;
    const tax = salesTax(revenue, skills[SKILL_IDS.accounting] ?? 0);
    const broker = brokerFee(revenue, skills[SKILL_IDS.brokerRelations] ?? 0);
    const profit = revenue - tax - broker - buildCost;
    const iskPerHour = (profit / tree.time) * 3600;
    priced.push({
      id: String(candidate.productTypeID),
      productTypeID: candidate.productTypeID,
      iskPerHour,
      buildCost,
      sellDepthIsk: candidate.sellDepthIsk,
    });
  }

  const ranked = rankOpportunities(priced, thresholds);
  const byId = new Map(priced.map((p) => [p.id, p]));
  return ranked.map((r) => ({ ...r, productTypeID: byId.get(r.id)!.productTypeID }));
}
