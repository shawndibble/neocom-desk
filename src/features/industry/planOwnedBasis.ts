import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import { planOwnedStockSale } from '@/engine/industry/ownedStockSale';
import { profitOnBasis } from '@/engine/industry/profitBasis';
import { SKILL_IDS, type BuildResult } from '@/engine/industry/types';
import type { ResolvedStandings } from '@/engine/market/standings';
import type { MarketSnapshot } from './marketData';

/**
 * The figures a Build Plan's hero shows by default, on `result`: owned
 * materials are charged at what they would sell for (instant sale into buy
 * orders), so profit reads as what building earns over just selling them. The
 * plan page does this through the same `planOwnedStockSale` and
 * `profitOnBasis`; with nothing owned, or an owned material with no price, the
 * plan's own figure stands, as it does there. Only the headline figures move:
 * cost columns keep the plan's own `totalCost`.
 */
export function onPlanHeroBasis(
  result: BuildResult,
  input: {
    snapshot: MarketSnapshot;
    modifiers: CharacterModifiers;
    standing: ResolvedStandings | undefined;
    productQuantity: number;
    productUnitPrice: number | null;
  }
): { result: BuildResult; forgone: number } {
  const { snapshot, modifiers, standing } = input;
  const sale = planOwnedStockSale(
    result.materials,
    snapshot,
    'instant',
    modifiers.skills,
    standing
  );
  if (sale.ownedUnits === 0 || sale.unpriced.length > 0) return { result, forgone: 0 };
  const figures = profitOnBasis('sellValue', {
    result,
    ownedSellNet: sale.net,
    productQuantity: input.productQuantity,
    productUnitPrice: input.productUnitPrice,
    accountingLevel: modifiers.skills[SKILL_IDS.accounting] ?? 0,
    brokerRelationsLevel: modifiers.skills[SKILL_IDS.brokerRelations] ?? 0,
    factionStanding: standing?.factionStanding,
    corpStanding: standing?.corpStanding,
    safetyTaxPct: standing?.safetyTaxPct,
  });
  return {
    result: {
      ...result,
      profit: figures.profit,
      marginPct: figures.marginPct,
      iskPerHour: figures.iskPerHour,
      breakEvenPrice: figures.breakEvenPrice,
    },
    forgone: sale.net,
  };
}
