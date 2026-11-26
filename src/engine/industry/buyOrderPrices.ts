import type { ResolvedStandings } from '@/engine/market/standings';
import { brokerFeePct } from '@/engine/industry/fees';
import { SKILL_IDS, type HubPrices, type SkillLevels } from '@/engine/industry/types';

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

export function buyOrderMaterialPrices(buyPrices: HubPrices, feePct: number): HubPrices {
  if (feePct === 0) return buyPrices;
  const prices: HubPrices = {};
  for (const [typeID, price] of Object.entries(buyPrices)) {
    prices[Number(typeID)] = price + (price * feePct) / 100;
  }
  return prices;
}
