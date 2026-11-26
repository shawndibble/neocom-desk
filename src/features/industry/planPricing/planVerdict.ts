import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { DepthPrice } from '@/engine/industry/depthPrice';
import {
  planOwnedStockSale,
  type LiquidationBasis,
  type OwnedStockSale,
} from '@/engine/industry/ownedStockSale';
import { productSellNow, type ProductSellNow } from '@/engine/industry/productSellNow';
import { profitOnBasis, type ProfitBasis, type ProfitOnBasis } from '@/engine/industry/profitBasis';
import { SKILL_IDS, type BuildResult } from '@/engine/industry/types';
import type { ResolvedStandings } from '@/engine/market/standings';
import type { MarketSnapshot } from '../marketData';
import { productSalePrice } from '../productPriceCap';
import type { ResolvedBuildPlan } from '../resolveBuildPlan';

type OwnedSale = Record<LiquidationBasis, OwnedStockSale>;

const NO_DEPTH: ReadonlyMap<number, DepthPrice> = new Map();

export interface PlanVerdict<R extends Pick<ResolvedBuildPlan, 'result'> = ResolvedBuildPlan> {
  resolved: R;
  basisResult: BuildResult | null;
  figures: ProfitOnBasis | null;
  basis: ProfitBasis | null;
  ownedSale: OwnedSale | null;
  ownedForSale: OwnedStockSale | null;
  forgone: number;
  productUnitPrice: number | null;
  priceCapped: boolean;
  sellNow: ProductSellNow | null | undefined;
  depth: ReadonlyMap<number, DepthPrice>;
}

export interface PlanVerdictContext {
  snapshot: MarketSnapshot | null;
  productTypeID: number | null;
  productQuantity: number | null;
  profitBasis: ProfitBasis;
  saleBasis?: LiquidationBasis;
  modifiers: CharacterModifiers;
  standing: ResolvedStandings | undefined;
  ownedSale?: OwnedSale | null;
  depth?: ReadonlyMap<number, DepthPrice>;
}

function ownedSaleOf(
  result: BuildResult | null,
  { snapshot, modifiers, standing }: PlanVerdictContext
): OwnedSale | null {
  if (!result || !snapshot) return null;
  const sale = (basis: LiquidationBasis) =>
    planOwnedStockSale(result.materials, snapshot, basis, modifiers.skills, standing);
  return { instant: sale('instant'), order: sale('order') };
}

export function planVerdictOf<R extends Pick<ResolvedBuildPlan, 'result'>>(
  resolved: R,
  ctx: PlanVerdictContext
): PlanVerdict<R> {
  const { snapshot, productTypeID, productQuantity, profitBasis, standing } = ctx;
  const { skills } = ctx.modifiers;
  const result = resolved.result;
  const { price: productUnitPrice, capped: priceCapped } = productSalePrice(
    snapshot,
    productTypeID
  );
  const ownedSale = ctx.ownedSale !== undefined ? ctx.ownedSale : ownedSaleOf(result, ctx);
  const ownedForSale =
    ownedSale && ownedSale.instant.ownedUnits > 0 ? ownedSale[ctx.saleBasis ?? 'instant'] : null;
  const basis: ProfitBasis | null =
    ownedForSale && ownedForSale.unpriced.length === 0 ? profitBasis : null;
  const forgone = basis === 'sellValue' && ownedForSale ? ownedForSale.net : 0;
  const figures = result
    ? profitOnBasis(basis ?? 'free', {
        result,
        ownedSellNet: ownedForSale?.net ?? null,
        productQuantity: productQuantity ?? 0,
        productUnitPrice,
        accountingLevel: skills[SKILL_IDS.accounting] ?? 0,
        brokerRelationsLevel: skills[SKILL_IDS.brokerRelations] ?? 0,
        factionStanding: standing?.factionStanding,
        corpStanding: standing?.corpStanding,
        safetyTaxPct: standing?.safetyTaxPct,
        feeDiscountFactor: standing?.feeDiscountFactor,
      })
    : null;
  const basisResult =
    result && figures && basis === 'sellValue'
      ? {
          ...result,
          profit: figures.profit,
          marginPct: figures.marginPct,
          iskPerHour: figures.iskPerHour,
          breakEvenPrice: figures.breakEvenPrice,
        }
      : result;
  const sellNow =
    result && snapshot && productTypeID !== null && productQuantity !== null
      ? productSellNow({
          productTypeID,
          productQuantity,
          hubBuyPrices: snapshot.hubBuyPrices,
          skills,
          standing,
          totalCost: result.totalCost,
          forgone,
        })
      : undefined;
  return {
    resolved,
    basisResult,
    figures,
    basis,
    ownedSale,
    ownedForSale,
    forgone,
    productUnitPrice,
    priceCapped,
    sellNow,
    depth: ctx.depth ?? NO_DEPTH,
  };
}
