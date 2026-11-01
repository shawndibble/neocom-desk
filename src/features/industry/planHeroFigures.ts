import type { BuildResult } from '@/engine/industry/types';
import { SKILL_IDS } from '@/engine/industry/types';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { LiquidationBasis, planOwnedStockSale } from '@/engine/industry/ownedStockSale';
import { profitOnBasis, type ProfitBasis } from '@/engine/industry/profitBasis';
import { productSellNow } from '@/engine/industry/productSellNow';
import type { MarketSnapshot } from './marketData';
import type { pricingSourcesForHub } from './buildPlanPricingInputs';

/** Both liquidation bases of the owned stock this plan would use, side by side. */
export type OwnedSale = {
  instant: ReturnType<typeof planOwnedStockSale>;
  order: ReturnType<typeof planOwnedStockSale>;
};

interface PlanHeroFiguresInput {
  result: BuildResult | null;
  ownedSale: OwnedSale | null;
  saleBasis: LiquidationBasis;
  profitBasis: ProfitBasis;
  snapshot: MarketSnapshot | null;
  productTypeID: number | null;
  productQuantity: number | null;
  productUnitPrice: number | null;
  skills: CharacterModifiers['skills'];
  standing: ReturnType<typeof pricingSourcesForHub>['standing'];
}

/**
 * The verdict hero's numbers: the owned stock this plan would sell, the basis
 * the profit is read on, the profit itself, and the product sold into buy
 * orders for comparison.
 */
export function planHeroFigures({
  result,
  ownedSale,
  saleBasis,
  profitBasis,
  snapshot,
  productTypeID,
  productQuantity,
  productUnitPrice,
  skills,
  standing,
}: PlanHeroFiguresInput) {
  const ownedForSale = ownedSale && ownedSale.instant.ownedUnits > 0 ? ownedSale[saleBasis] : null;
  // Nothing owned, or an owned material with no price: no sell value to
  // charge, so there is no basis to switch and the plan's own figure stands.
  const heroBasis: ProfitBasis | null =
    ownedForSale && ownedForSale.unpriced.length === 0 ? profitBasis : null;
  const heroFigures = result
    ? profitOnBasis(heroBasis ?? 'free', {
        result,
        ownedSellNet: ownedForSale?.net ?? null,
        productQuantity: productQuantity ?? 0,
        productUnitPrice,
        accountingLevel: skills[SKILL_IDS.accounting] ?? 0,
        brokerRelationsLevel: skills[SKILL_IDS.brokerRelations] ?? 0,
        factionStanding: standing?.factionStanding,
        corpStanding: standing?.corpStanding,
        brokerSurchargePct: standing?.brokerSurchargePct,
      })
    : null;
  // The product sold into buy orders instead, on the hero's basis so it reads
  // against the Profit row above it (issue #5007).
  const sellNow =
    result && snapshot && productTypeID !== null && productQuantity !== null
      ? productSellNow({
          productTypeID,
          productQuantity,
          hubBuyPrices: snapshot.hubBuyPrices,
          skills,
          totalCost: result.totalCost,
          forgone: heroBasis === 'sellValue' && ownedForSale ? ownedForSale.net : 0,
        })
      : undefined;
  return { ownedForSale, heroBasis, heroFigures, sellNow };
}
