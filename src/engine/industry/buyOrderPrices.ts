/**
 * What a material costs on a Build Plan's Buy order basis (issue #6167):
 * the hub's highest buy order plus the broker fee for placing the order
 * that matches it.
 *
 * Placing a buy order is listing an order, so it pays the same broker fee a
 * sell order does — the same skill, the same base standings, and the hub's
 * Safety Tax, which is charged on non-instant buy orders too. It is one
 * placement: outbidding and modifying the order cost more, so the price is a
 * floor, and the copy says so. The 100 ISK per-order minimum is left out —
 * these are unit prices, and an order is never one unit's worth of ISK.
 */
import type { ResolvedStandings } from '@/engine/market/standings';
import { brokerFeePct } from '@/engine/industry/fees';
import { SKILL_IDS, type HubPrices, type SkillLevels } from '@/engine/industry/types';

/** The broker fee rate, percent, a Character pays to place an order at a hub. */
export function buyOrderFeePct(
  skills: Readonly<SkillLevels>,
  standing?: ResolvedStandings
): number {
  return brokerFeePct(
    skills[SKILL_IDS.brokerRelations] ?? 0,
    standing?.factionStanding,
    standing?.corpStanding,
    standing?.safetyTaxPct,
    standing?.feeDiscountFactor
  );
}

/**
 * Each buy-order price with the placement fee added. A type with no buy
 * order stays absent — unpriced, never re-quoted. A zero rate returns the
 * same map, so nothing downstream sees a new identity for no change.
 */
export function buyOrderMaterialPrices(buyPrices: HubPrices, feePct: number): HubPrices {
  if (feePct === 0) return buyPrices;
  const prices: HubPrices = {};
  for (const [typeID, price] of Object.entries(buyPrices)) {
    prices[Number(typeID)] = price + (price * feePct) / 100;
  }
  return prices;
}
