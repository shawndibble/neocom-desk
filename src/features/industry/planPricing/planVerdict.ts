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

/** Both liquidation bases of the owned stock a plan would use, side by side. */
type OwnedSale = Record<LiquidationBasis, OwnedStockSale>;

const NO_DEPTH: ReadonlyMap<number, DepthPrice> = new Map();

/**
 * What a Build Plan is worth, read the way its page's hero reads it: the
 * resolution, the product at its (troll-capped) sale price, and the profit,
 * margin, ISK/hour and break-even on the pilot's Profit Basis.
 */
export interface PlanVerdict<R extends Pick<ResolvedBuildPlan, 'result'> = ResolvedBuildPlan> {
  resolved: R;
  /**
   * `resolved.result` with its headline figures (profit, margin, ISK/hour,
   * break-even) on `basis`; cost columns keep the plan's own `totalCost`.
   */
  basisResult: BuildResult | null;
  /** The hero's figures on `basis`, with headroom and verdict. */
  figures: ProfitOnBasis | null;
  /** The basis the figures are on; null when nothing owned is used, or an owned material has no price. */
  basis: ProfitBasis | null;
  /** The owned stock's sale on both liquidation bases; null with no result or no snapshot. */
  ownedSale: OwnedSale | null;
  /** `ownedSale` on the chosen sale basis; null when nothing owned is used. */
  ownedForSale: OwnedStockSale | null;
  /** The owned stock's forgone sale charged against the profit; 0 off the sell-value basis. */
  forgone: number;
  /** The product's hub sell price, capped at the average for a troll order. */
  productUnitPrice: number | null;
  /** True when `productUnitPrice` is the average because the cheapest order is a troll price. */
  priceCapped: boolean;
  /** The product sold into buy orders instead, on the hero's basis. */
  sellNow: ProductSellNow | null | undefined;
  /**
   * The Depth Prices `pricePlan` walked and re-resolved at; empty when it
   * walked none, or when the caller resolved the plan itself (the page, a
   * Build Group's summed walk).
   */
  depth: ReadonlyMap<number, DepthPrice>;
}

export interface PlanVerdictContext {
  /** The plan's own (uncapped) snapshot: owned stock and the product sell into it. */
  snapshot: MarketSnapshot | null;
  productTypeID: number | null;
  /** Units the job yields; null when the blueprint has no product. */
  productQuantity: number | null;
  /** The pilot's Profit Basis setting (`profitBasisSetting.ts`). */
  profitBasis: ProfitBasis;
  /** How owned stock would be sold; `instant` unless the page's toggle says otherwise. */
  saleBasis?: LiquidationBasis;
  modifiers: CharacterModifiers;
  standing: ResolvedStandings | undefined;
  /**
   * The owned stock's sale, when the caller already holds it (the page
   * memoises it; null there means no result or snapshot yet). Absent, it is
   * computed here.
   */
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

/**
 * The verdict on an already-resolved plan. Synchronous: the plan page calls
 * it with its own resolution (Depth Prices walked through its cached books),
 * and `pricePlan` with one it loaded the books for.
 */
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
  // Nothing owned, or an owned material with no price: no sell value to
  // charge, so there is no basis to switch and the plan's own figure stands.
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
  // The product sold into buy orders instead, on the hero's basis so it reads
  // against the Profit row above it (issue #5007).
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
