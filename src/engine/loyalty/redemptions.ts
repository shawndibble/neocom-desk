/**
 * LP Store Offer Detail's "How many" box (issue #5659): an offer redeemed N
 * times, priced by walking the order books instead of at the top of book.
 *
 * Pure, like every `src/engine` module: the caller (`features/loyalty`) fetches
 * the books. Required items walk the station's sell book for N × quantity
 * (`walkSellBook`). The output walks the reachable buy book on the instant
 * basis (`walkSellIntoBuys`, #5653) and stays at top of book on the list-order
 * basis. Fees are `loyaltyOfferProfit`'s: N redemptions are one stack, one
 * listing. A required item the book cannot fill leaves the cost unpriced (the
 * redemption cannot be bought out); output units a buy book cannot take earn
 * nothing and are stated.
 */
import { walkSellBook } from '@/engine/industry/depthPrice';
import type { LiquidationBasis } from '@/engine/industry/ownedStockSale';
import type { SkillLevels } from '@/engine/industry/types';
import { walkSellIntoBuys, type ReachableBuyOrder } from '@/engine/market/buyReach';
import type { HubOrder } from '@/engine/market/haulingMarket';
import { capListedPrice } from '@/engine/market/tradedPriceCheck';
import type { ResolvedStandings } from '@/engine/market/standings';
import { loyaltyOfferProfit, type LoyaltyOfferProfit } from './offerProfit';

export interface RedemptionsInput {
  /** N, at least 1. */
  redemptions: number;
  /** Per redemption. */
  iskCost: number;
  lpCost: number;
  /** Per redemption; `unitPrice` is the top-of-book price the row already shows. */
  requiredItems: readonly { typeId: number; quantity: number; unitPrice: number | null }[];
  /** Units of the output one redemption hands over; null when unknown. */
  outputUnits: number | null;
  /** The row's top-of-book unit price for the output; null when unpriced. */
  outputTopUnitPrice: number | null;
  /** Per redemption: a blueprint's materials plus job fee, 0 for a plain item. */
  buildCost: number;
  stationId: number;
  /** The station's sell book per required type; absent while loading or failed. */
  sellBooks: ReadonlyMap<number, readonly HubOrder[]>;
  /** `instant` walks `buyOrders`; `order` keeps the output at top of book. */
  outputBasis: 'order' | 'instant';
  /** Buy orders that reach the station; undefined while the book is loading. */
  buyOrders: readonly ReachableBuyOrder[] | undefined;
  /** The output's **Traded Price Ceiling**: a bid far above it counts at it (margin-trading bait). */
  outputPriceCeiling?: number | null;
  liquidationBasis: LiquidationBasis;
  skills: SkillLevels;
  standing?: ResolvedStandings;
  playerLp: number | null;
}

export interface RedemptionsLine {
  typeId: number;
  unitsNeeded: number;
  filled: number;
  unfilled: number;
  /** ISK for the filled units; null when the line cannot be priced. */
  lineCost: number | null;
  /** The walked average is above the top of book. */
  moved: boolean;
}

export interface RedemptionsOutput {
  units: number;
  filled: number;
  unsold: number;
  revenue: number | null;
  /** The walked average is below the top bid. */
  moved: boolean;
}

export interface RedemptionsResult {
  requiredLines: RedemptionsLine[];
  requiredItemsCost: number | null;
  output: RedemptionsOutput;
  profit: LoyaltyOfferProfit;
  totals: { iskCost: number; lpCost: number; itemsToBuy: { typeId: number; units: number }[] };
}

function priceLine(
  item: RedemptionsInput['requiredItems'][number],
  input: RedemptionsInput
): RedemptionsLine {
  const unitsNeeded = item.quantity * input.redemptions;
  const walk = walkSellBook(input.sellBooks.get(item.typeId) ?? [], input.stationId, unitsNeeded);
  if (walk === null) {
    return {
      typeId: item.typeId,
      unitsNeeded,
      filled: unitsNeeded,
      unfilled: 0,
      lineCost: item.unitPrice === null ? null : item.unitPrice * unitsNeeded,
      moved: false,
    };
  }
  return {
    typeId: item.typeId,
    unitsNeeded,
    filled: walk.filled,
    unfilled: unitsNeeded - walk.filled,
    lineCost: walk.avg * walk.filled,
    moved: walk.avg > walk.best,
  };
}

function priceOutput(input: RedemptionsInput): RedemptionsOutput {
  const units = (input.outputUnits ?? 0) * input.redemptions;
  const atTop: RedemptionsOutput = {
    units,
    filled: units,
    unsold: 0,
    revenue:
      input.outputUnits === null || input.outputTopUnitPrice === null
        ? null
        : input.outputTopUnitPrice * units,
    moved: false,
  };
  if (input.outputBasis !== 'instant' || input.buyOrders === undefined) return atTop;
  if (units === 0) return atTop;
  const ceiling = input.outputPriceCeiling ?? null;
  const bids =
    ceiling === null
      ? input.buyOrders
      : input.buyOrders.map((order) => ({
          ...order,
          price: capListedPrice(order.price, ceiling).price,
        }));
  const walk = walkSellIntoBuys(bids, units);
  return {
    units,
    filled: walk.filled,
    unsold: walk.unsold,
    revenue: walk.revenue,
    moved: walk.movedPrice,
  };
}

export function priceRedemptions(input: RedemptionsInput): RedemptionsResult {
  const requiredLines = input.requiredItems.map((item) => priceLine(item, input));
  const unpriced = requiredLines.some((line) => line.lineCost === null || line.unfilled > 0);
  const requiredItemsCost = unpriced
    ? null
    : requiredLines.reduce((sum, line) => sum + (line.lineCost ?? 0), 0);
  const output = priceOutput(input);
  const n = input.redemptions;
  const profit = loyaltyOfferProfit({
    iskCost: input.iskCost * n,
    lpCost: input.lpCost * n,
    requiredItemsCost,
    revenue: output.revenue,
    buildCost: input.buildCost * n,
    playerLp: input.playerLp,
    liquidationBasis: input.liquidationBasis,
    skills: input.skills,
    standing: input.standing,
  });
  return {
    requiredLines,
    requiredItemsCost,
    output,
    profit,
    totals: {
      iskCost: input.iskCost * n,
      lpCost: input.lpCost * n,
      itemsToBuy: requiredLines.map((line) => ({ typeId: line.typeId, units: line.unitsNeeded })),
    },
  };
}
