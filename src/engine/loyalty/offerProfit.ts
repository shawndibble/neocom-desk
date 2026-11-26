import { brokerFee, salesTax } from '@/engine/industry/fees';
import { SKILL_IDS } from '@/engine/industry/types';
import type { SkillLevels } from '@/engine/industry/types';
import type { LiquidationBasis } from '@/engine/industry/ownedStockSale';
import type { ResolvedStandings } from '@/engine/market/standings';

export interface LoyaltyOfferProfitInput {
  iskCost: number;
  lpCost: number;
  requiredItemsCost: number | null;
  revenue: number | null;
  buildCost: number;
  playerLp: number | null;
  liquidationBasis: LiquidationBasis;
  skills: SkillLevels;
  standing?: ResolvedStandings;
}

export interface LoyaltyOfferProfit {
  revenue: number | null;
  salesTax: number | null;
  brokerFee: number | null;
  netRevenue: number | null;
  profit: number | null;
  iskPerLp: number | null;
  affordableLp: boolean | null;
}

export function loyaltyOfferProfit(input: LoyaltyOfferProfitInput): LoyaltyOfferProfit {
  const {
    iskCost,
    lpCost,
    requiredItemsCost,
    revenue,
    buildCost,
    playerLp,
    liquidationBasis,
    skills,
    standing,
  } = input;

  const accounting = skills[SKILL_IDS.accounting] ?? 0;
  const brokerRelations = skills[SKILL_IDS.brokerRelations] ?? 0;

  const tax = revenue === null ? null : salesTax(revenue, accounting, standing?.feeDiscountFactor);
  const broker =
    revenue === null
      ? null
      : liquidationBasis === 'order'
        ? brokerFee(
            revenue,
            brokerRelations,
            standing?.factionStanding,
            standing?.corpStanding,
            standing?.safetyTaxPct,
            standing?.feeDiscountFactor
          )
        : 0;
  const netRevenue =
    revenue === null || tax === null || broker === null ? null : revenue - tax - broker;

  const profit =
    netRevenue === null || requiredItemsCost === null
      ? null
      : netRevenue - iskCost - requiredItemsCost - buildCost;

  const iskPerLp = profit === null || lpCost <= 0 ? null : profit / lpCost;

  return {
    revenue,
    salesTax: tax,
    brokerFee: broker,
    netRevenue,
    profit,
    iskPerLp,
    affordableLp: playerLp === null ? null : playerLp >= lpCost,
  };
}

export function rankByIskPerLp<T>(rows: readonly T[], iskPerLp: (row: T) => number | null): T[] {
  return [...rows].sort((a, b) => {
    const av = iskPerLp(a);
    const bv = iskPerLp(b);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return bv - av;
  });
}
