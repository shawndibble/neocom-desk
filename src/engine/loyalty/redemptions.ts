import { walkSellBook } from '@/engine/industry/depthPrice';
import type { LiquidationBasis } from '@/engine/industry/ownedStockSale';
import type { SkillLevels } from '@/engine/industry/types';
import { walkSellIntoBuys, type ReachableBuyOrder } from '@/engine/market/buyReach';
import type { HubOrder } from '@/engine/market/haulingMarket';
import { capListedPrice } from '@/engine/market/tradedPriceCheck';
import type { ResolvedStandings } from '@/engine/market/standings';
import { loyaltyOfferProfit, type LoyaltyOfferProfit } from './offerProfit';

export interface RedemptionsInput {
  redemptions: number;
  iskCost: number;
  lpCost: number;
  requiredItems: readonly { typeId: number; quantity: number; unitPrice: number | null }[];
  outputUnits: number | null;
  outputTopUnitPrice: number | null;
  buildCost: number;
  stationId: number;
  sellBooks: ReadonlyMap<number, readonly HubOrder[]>;
  outputBasis: 'order' | 'instant';
  buyOrders: readonly ReachableBuyOrder[] | undefined;
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
  lineCost: number | null;
  moved: boolean;
}

export interface RedemptionsOutput {
  units: number;
  filled: number;
  unsold: number;
  revenue: number | null;
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
