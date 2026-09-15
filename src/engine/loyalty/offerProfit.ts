/**
 * LP store offer profitability: ISK/LP is the ranking metric, not raw ISK
 * profit — LP (not ISK) is the resource a character can't just make more of,
 * so the standard way to compare offers within one store is profit per LP
 * spent. Pure, like every `src/engine` module: the caller (features/loyalty)
 * does the ESI fetch, the market-price lookup and, for a blueprint offer, the
 * `src/engine/industry` build-vs-buy call this composes with.
 *
 * Revenue is netted of the same market fees every other liquidation surface
 * in the app nets, from the same authority (`src/engine/industry/fees.ts`) —
 * sales tax on both bases, broker fee only when listing an order. The split
 * is `ownedStockSale`'s, not a second model: an LP offer's goods reach the
 * wallet exactly the way a sold stack of owned materials does. Only the
 * revenue leg carries fees — `iskCost`, `requiredItemsCost` and `buildCost` are
 * what the character *pays*, and nothing paid is ever listed on the market.
 */

import { brokerFee, salesTax } from '@/engine/industry/fees';
import { SKILL_IDS } from '@/engine/industry/types';
import type { SkillLevels } from '@/engine/industry/types';
import type { LiquidationBasis } from '@/engine/industry/ownedStockSale';

export interface LoyaltyOfferProfitInput {
  /** The store's ISK price for the offer. */
  iskCost: number;
  /** The store's LP price for the offer — the ranking denominator. */
  lpCost: number;
  /**
   * Hub cost of any `required_items` the offer also demands as a turn-in.
   * `null` when at least one required item has no hub price (unpriceable).
   */
  requiredItemsCost: number | null;
  /**
   * Gross sell value of what the offer nets: `hubPrice * quantity` for a
   * plain item, or the built product's sell value for a blueprint. `null`
   * when it can't be priced at the selected hub.
   */
  revenue: number | null;
  /**
   * Additional ISK required to realize that revenue beyond the store price —
   * 0 for a plain item, `BuildResult.totalCost` (materials + job fee) for a
   * blueprint offer. Never fee-netted here: the caller passes the build's
   * cost side only, so a blueprint offer's fees are charged once, on this
   * module's own revenue leg, and never inherited from `buildVsBuy`.
   */
  buildCost: number;
  /** The character's current LP balance with this corporation. */
  playerLp: number;
  /**
   * How the offer's goods are turned into ISK, mirroring the LP store's
   * revenue price basis: `order` lists at the hub's sell price (sales tax
   * plus broker fee), `instant` fills the hub's standing buy orders (sales
   * tax only — filling someone else's order lists nothing).
   */
  liquidationBasis: LiquidationBasis;
  /** Trained skills; Accounting and Broker Relations set the two fee rates. */
  skills: SkillLevels;
}

export interface LoyaltyOfferProfit {
  /** Passed through from the input; null when the offer can't be priced. */
  revenue: number | null;
  /** Sales tax on `revenue`. Null when unpriceable; charged on both bases. */
  salesTax: number | null;
  /** Broker fee on `revenue`. Null when unpriceable, always 0 on `instant`. */
  brokerFee: number | null;
  /** `revenue - salesTax - brokerFee` — what actually reaches the wallet. */
  netRevenue: number | null;
  /** `netRevenue - iskCost - requiredItemsCost - buildCost`; null when unpriceable. */
  profit: number | null;
  /** `profit / lpCost` — the ranking metric. Null when unpriceable or `lpCost <= 0`. */
  iskPerLp: number | null;
  /** Whether the character's current LP balance covers `lpCost`. Independent of profitability. */
  affordableLp: boolean;
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
  } = input;

  const accounting = skills[SKILL_IDS.accounting] ?? 0;
  const brokerRelations = skills[SKILL_IDS.brokerRelations] ?? 0;

  const tax = revenue === null ? null : salesTax(revenue, accounting);
  // One redemption is one listing: the offer hands over a single stack of a
  // single type, so it goes up as one order and the 100 ISK broker-fee
  // minimum bites once for the whole stack — the same "per stack listed"
  // rule `ownedStockSale` applies to a material. That floor is what decides
  // the verdict on the cheap, high-volume offers every LP store is full of;
  // charging it per unit would condemn all of them, and charging it not at
  // all would flatter them.
  const broker =
    revenue === null
      ? null
      : liquidationBasis === 'order'
        ? brokerFee(revenue, brokerRelations)
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
    affordableLp: playerLp >= lpCost,
  };
}

/**
 * Sorts most-profitable-per-LP first. Unpriceable offers (`iskPerLp === null`)
 * sink to the end rather than sorting as `0` — an unknown value is not the
 * same as "worth nothing", and mixing them into the ranking by value would
 * misplace them relative to genuinely break-even offers.
 */
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
