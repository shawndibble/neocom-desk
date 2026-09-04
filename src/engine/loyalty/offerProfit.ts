/**
 * LP store offer profitability: ISK/LP is the ranking metric, not raw ISK
 * profit — LP (not ISK) is the resource a character can't just make more of,
 * so the standard way to compare offers within one store is profit per LP
 * spent. Pure, like every `src/engine` module: the caller (features/loyalty)
 * does the ESI fetch, the market-price lookup and, for a blueprint offer, the
 * `src/engine/industry` build-vs-buy call this composes with.
 */

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
   * blueprint offer.
   */
  buildCost: number;
  /** The character's current LP balance with this corporation. */
  playerLp: number;
}

export interface LoyaltyOfferProfit {
  /** Passed through from the input; null when the offer can't be priced. */
  revenue: number | null;
  /** `revenue - iskCost - requiredItemsCost - buildCost`; null when unpriceable. */
  profit: number | null;
  /** `profit / lpCost` — the ranking metric. Null when unpriceable or `lpCost <= 0`. */
  iskPerLp: number | null;
  /** Whether the character's current LP balance covers `lpCost`. Independent of profitability. */
  affordableLp: boolean;
}

export function loyaltyOfferProfit(input: LoyaltyOfferProfitInput): LoyaltyOfferProfit {
  const { iskCost, lpCost, requiredItemsCost, revenue, buildCost, playerLp } = input;

  const profit =
    revenue === null || requiredItemsCost === null
      ? null
      : revenue - iskCost - requiredItemsCost - buildCost;

  const iskPerLp = profit === null || lpCost <= 0 ? null : profit / lpCost;

  return {
    revenue,
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
